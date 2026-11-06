// Patients cancel with their booking reference AND the mobile number they booked with,
// so nobody can cancel someone else's appointment by guessing a reference.
import { findBusiness } from "../businesses.mjs";
import { nowIn, niceDate } from "../booking/calendar.mjs";
import { findByRef, cancelBooking } from "../booking/store.mjs";
import { json } from "../booking/http.mjs";

const lastDigits = (s) => String(s || "").replace(/\D/g, "").slice(-9);

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid request." }); }

  const key = String(body?.business || "carefirst-clinic").toLowerCase();
  const business = findBusiness(key);
  if (!business?.booking) return json(404, { error: "Unknown clinic." });

  const ref = String(body.ref || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const phone = lastDigits(body.phone);
  if (!/^[A-Z0-9]{6}$/.test(ref) || phone.length < 7) {
    return json(400, { error: "Please enter your 6-character reference and your mobile number." });
  }

  const booking = await findByRef(key, ref);
  // Same answer for "no such booking" and "wrong number", so references can't be probed.
  if (!booking || lastDigits(booking.phone) !== phone) {
    return json(404, { error: "We couldn't find a booking with that reference and mobile number." });
  }
  if (booking.status === "cancelled") return json(200, { cancelled: true, already: true, booking: summary(booking) });

  const now = nowIn(business.timezone);
  if (booking.date < now.date) return json(400, { error: "That appointment has already passed." });

  const done = await cancelBooking(key, booking.date, booking.id, "patient");
  return json(200, { cancelled: true, booking: summary(done) });
};

const summary = (b) => ({ ref: b.id, service: b.service, doctor: b.staffName, date: b.date, day: niceDate(b.date), time: b.time });

export const config = { path: "/api/cancel" };
