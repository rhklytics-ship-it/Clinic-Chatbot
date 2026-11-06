// Books the time a patient picked (from the chat or the live schedule).
// No AI involved: the time is checked against the calendar and claimed atomically.
import { findBusiness } from "../businesses.mjs";
import { findService, isTime, nowIn, dateProblem, staffFor } from "../booking/calendar.mjs";
import { availability, createBooking, listBookings } from "../booking/store.mjs";
import { json, cleanCustomer, publicTimes } from "../booking/http.mjs";

const MAX_PER_PHONE_PER_DAY = 2;

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid request." }); }

  const key = String(body?.business || "carefirst-clinic").toLowerCase();
  const business = findBusiness(key);
  if (!business?.booking) return json(404, { error: "Online booking is not available here." });

  const service = findService(business, body.service);
  if (!service) return json(400, { error: "Please choose a service." });
  const { date, time } = body;
  const now = nowIn(business.timezone);
  const problem = dateProblem(business, date, now);
  if (problem) return json(400, { error: problem });
  if (!isTime(time)) return json(400, { error: "Please choose a time." });

  // Optional: a specific doctor, when the patient picked from that doctor's schedule.
  let onlyStaff = null;
  if (body.staff !== undefined && body.staff !== null && body.staff !== "") {
    onlyStaff = Number(body.staff);
    if (!staffFor(business.booking, service).some(s => s.index === onlyStaff)) {
      return json(400, { error: "That doctor does not offer this service." });
    }
  }

  const customer = cleanCustomer(body);
  if (customer.error) return json(400, { error: customer.error });

  const sameDay = await listBookings(key, date);
  const mine = sameDay.filter(b => b.status === "confirmed" && b.phone === customer.phone);
  if (mine.length >= MAX_PER_PHONE_PER_DAY) {
    return json(429, { error: `You already have ${mine.length} appointments on this day. Please call the clinic to book more.` });
  }

  const free = await availability(key, business, service, date, now, onlyStaff);
  const taken = () => json(409, {
    error: "Sorry, that time was just taken. Here are the times still free.",
    slots: { service: service.name, date, times: publicTimes(free.filter(f => f.time !== time)) },
  });
  const slot = free.find(f => f.time === time);
  if (!slot) return taken();

  const booking = await createBooking(key, business, service, date, time, customer, "chat", slot.staff);
  if (!booking) return taken();

  return json(200, {
    booking: { ref: booking.id, service: booking.service, doctor: booking.staffName, date, time,
      name: booking.name, phone: booking.phone, price: service.price },
    sample: !!business.sample,
  });
};

export const config = { path: "/api/book" };
