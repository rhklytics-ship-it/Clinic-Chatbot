// Clinic bookings screen (public/admin.html) talks to this.
// Protected by the BOOKINGS_ADMIN_KEY environment variable.
import { timingSafeEqual, createHash } from "node:crypto";
import { businesses, findBusiness } from "../businesses.mjs";
import { findService, isTime, isDate, nowIn, dateProblem, addDays, staffList, staffFor } from "../booking/calendar.mjs";
import { listBookings, cancelBooking, createBooking, availability } from "../booking/store.mjs";
import { json, cleanCustomer } from "../booking/http.mjs";

function authorised(req) {
  const expected = process.env.BOOKINGS_ADMIN_KEY || "";
  const given = req.headers.get("x-admin-key") || "";
  if (expected.length < 8) return false;
  const h = (s) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(expected), h(given));
}

export default async (req) => {
  if ((process.env.BOOKINGS_ADMIN_KEY || "").length < 8) {
    return json(503, { error: "Set BOOKINGS_ADMIN_KEY (at least 8 characters) in Netlify to use this screen." });
  }
  if (!authorised(req)) return json(401, { error: "Wrong password." });

  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("list") === "businesses") {
      return json(200, {
        businesses: Object.entries(businesses).filter(([, b]) => b.booking)
          .map(([key, b]) => ({ key, name: b.name, timezone: b.timezone, today: nowIn(b.timezone).date,
            services: b.services.map(s => s.name), staffLabel: b.booking.staffLabel || "Staff",
            staff: staffList(b.booking).map(s => s.name) })),
      });
    }
    const key = url.searchParams.get("business") || "";
    const from = url.searchParams.get("from"), to = url.searchParams.get("to");
    if (from || to) {
      if (!findBusiness(key)?.booking || !isDate(from) || !isDate(to) || to < from || to > addDays(from, 92)) {
        return json(400, { error: "Choose a range of up to 3 months." });
      }
      const all = [];
      for (let d = from; d <= to; d = addDays(d, 1)) all.push(...await listBookings(key, d));
      return json(200, { bookings: all });
    }
    const date = url.searchParams.get("date") || "";
    if (!findBusiness(key)?.booking || !isDate(date)) return json(400, { error: "Choose a clinic and date." });
    return json(200, { bookings: await listBookings(key, date) });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json(400, { error: "Invalid request." }); }
    const key = String(body?.business || "");
    const business = findBusiness(key);
    if (!business?.booking) return json(400, { error: "Unknown clinic." });

    if (body.action === "cancel") {
      if (!isDate(body.date) || !/^[A-Z0-9]{6}$/.test(body.id || "")) return json(400, { error: "Invalid booking." });
      const b = await cancelBooking(key, body.date, body.id, "clinic");
      return b ? json(200, { booking: b }) : json(404, { error: "Booking not found." });
    }

    if (body.action === "add") {
      // Phone and walk-in appointments, so the calendar stays the single source of truth.
      const service = findService(business, body.service);
      if (!service) return json(400, { error: "Choose a service." });
      const now = nowIn(business.timezone);
      const problem = dateProblem(business, body.date, now);
      if (problem) return json(400, { error: problem });
      if (!isTime(body.time)) return json(400, { error: "Choose a time." });
      const customer = cleanCustomer(body);
      if (customer.error) return json(400, { error: customer.error });
      // The clinic may book earlier than the online notice period, but never over another booking.
      const relaxed = { ...business, booking: { ...business.booking, leadMinutes: -1440 } };
      const free = await availability(key, relaxed, service, body.date, now);
      const slot = free.find(f => f.time === body.time);
      if (!slot) return json(409, { error: `That time is already booked or outside ${staffFor(business.booking, service).map(s => s.name).join(", ")}'s hours.` });
      const b = await createBooking(key, business, service, body.date, body.time, customer, "owner", slot.staff);
      return b ? json(200, { booking: b }) : json(409, { error: "That time is already booked." });
    }
    return json(400, { error: "Unknown action." });
  }
  return json(405, { error: "Use GET or POST." });
};

export const config = { path: "/api/admin" };
