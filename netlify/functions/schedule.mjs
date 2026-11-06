// Live schedule for the side panel: which times are free for one doctor,
// for the next open days. No patient details are returned.
import { findBusiness } from "../businesses.mjs";
import { nowIn, addDays, openRanges, fromMin, staffList, dateProblem } from "../booking/calendar.mjs";
import { takenBlocks } from "../booking/store.mjs";
import { json } from "../booking/http.mjs";

const DAYS_SHOWN = 6;

export default async (req) => {
  const url = new URL(req.url);
  const key = String(url.searchParams.get("business") || "carefirst-clinic").toLowerCase();
  const business = findBusiness(key);
  if (!business?.booking) return json(404, { error: "Unknown clinic." });
  const cfg = business.booking;
  const people = staffList(cfg);
  const staff = Number(url.searchParams.get("staff") || 0);
  const person = people[staff];
  if (!person) return json(400, { error: "Unknown doctor." });

  const now = nowIn(business.timezone);
  const days = [];
  for (let i = 0; i <= cfg.daysAhead && days.length < DAYS_SHOWN; i++) {
    const date = addDays(now.date, i);
    if (dateProblem(business, date, now)) continue;
    const taken = await takenBlocks(key, date);
    const earliest = date === now.date ? now.minutes + cfg.leadMinutes : -Infinity;
    const blocks = [];
    for (const [open, close] of openRanges(cfg, date)) {
      for (let t = open; t + cfg.slotMinutes <= close; t += cfg.slotMinutes) {
        const time = fromMin(t);
        const state = t < earliest ? "past" : taken.has(`${staff}|${time}`) ? "taken" : "free";
        blocks.push({ time, state });
      }
    }
    const free = blocks.filter(b => b.state === "free").length;
    if (date === now.date && !free) continue;   // today is over: start from the next open day
    days.push({ date, blocks, free });
  }
  return new Response(JSON.stringify({
    doctors: people.map(p => ({ index: p.index, name: p.name, role: p.role, services: p.services })),
    staff, days,
  }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
};

export const config = { path: "/api/schedule" };
