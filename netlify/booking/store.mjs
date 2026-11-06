// Booking storage on Netlify Blobs (free, no database to set up).
//
// Keys:
//   lock/<business>/<date>/<staff>/<HH:MM>   one per slot-sized block, value = booking id
//   bk/<business>/<date>/<id>                the booking itself (JSON)
//   ref/<business>/<id>                      the booking's date, so a reference can be looked up
// A block is claimed with "write only if new", so two patients can never get the
// same block: the second write fails and that patient is offered other times.

import { getStore } from "@netlify/blobs";
import { units, toMin, serviceMinutes, freeStarts, staffList } from "./calendar.mjs";

let testStore = null;
export function useStoreForTests(s) { testStore = s; }
const store = () => testStore || getStore({ name: "bookings", consistency: "strong" });

const lockKey = (biz, date, staff, time) => `lock/${biz}/${date}/${staff}/${time}`;
const bookingKey = (biz, date, id) => `bk/${biz}/${date}/${id}`;
const refKey = (biz, id) => `ref/${biz}/${id}`;

export async function takenBlocks(biz, date) {
  const { blobs } = await store().list({ prefix: `lock/${biz}/${date}/` });
  return new Set(blobs.map(b => {
    const [, , , staff, time] = b.key.split("/");
    return `${staff}|${time}`;
  }));
}

export async function listBookings(biz, date) {
  const { blobs } = await store().list({ prefix: `bk/${biz}/${date}/` });
  const items = await Promise.all(blobs.map(b => store().get(b.key, { type: "json" })));
  return items.filter(Boolean).sort((a, b) => a.time.localeCompare(b.time) || a.staff - b.staff);
}

function newId() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) id += abc[Math.floor(Math.random() * abc.length)];
  return id;
}

// Claims every block of the booking for one person, or nothing.
// staffOrder: the staff indexes to try, in order.
export async function createBooking(biz, business, service, date, time, customer, source = "chat", staffOrder = null) {
  const cfg = business.booking;
  const minutes = serviceMinutes(service);
  const blocks = units(toMin(time), minutes, cfg.slotMinutes);
  const people = staffList(cfg);
  const order = staffOrder || people.filter(p => !p.services || p.services.includes(service.name)).map(p => p.index);
  const id = newId();

  for (const staff of order) {
    const claimed = [];
    let ok = true;
    for (const t of blocks) {
      const key = lockKey(biz, date, staff, t);
      const res = await store().set(key, id, { onlyIfNew: true });
      if (res && res.modified === false) { ok = false; break; }
      claimed.push(key);
    }
    if (ok) {
      const booking = {
        id, business: biz, service: service.name, minutes, date, time, staff, staffName: people[staff]?.name || null,
        name: customer.name, phone: customer.phone, status: "confirmed", source,
        createdAt: new Date().toISOString(),
      };
      await store().setJSON(bookingKey(biz, date, id), booking);
      await store().set(refKey(biz, id), date);
      return booking;
    }
    // Someone else holds part of this slot: give back what we took, try the next person.
    await Promise.all(claimed.map(k => store().delete(k)));
  }
  return null;
}

export async function getBooking(biz, date, id) {
  return store().get(bookingKey(biz, date, id), { type: "json" });
}

export async function findByRef(biz, id) {
  const date = await store().get(refKey(biz, id));
  return date ? getBooking(biz, date, id) : null;
}

export async function cancelBooking(biz, date, id, by = "owner") {
  const key = bookingKey(biz, date, id);
  const booking = await store().get(key, { type: "json" });
  if (!booking || booking.status === "cancelled") return booking;
  const { blobs } = await store().list({ prefix: `lock/${biz}/${date}/${booking.staff}/` });
  // Free only the blocks that belong to this booking.
  await Promise.all(blobs.map(async b => {
    const holder = await store().get(b.key);
    if (holder === id) await store().delete(b.key);
  }));
  booking.status = "cancelled";
  booking.cancelledBy = by;
  booking.cancelledAt = new Date().toISOString();
  await store().setJSON(key, booking);
  return booking;
}

// Free start times for a service on a date, straight from storage.
export async function availability(biz, business, service, date, now, onlyStaff = null) {
  const taken = await takenBlocks(biz, date);
  return freeStarts(business, service, date, taken, now, onlyStaff);
}
