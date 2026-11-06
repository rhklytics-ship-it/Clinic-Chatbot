// Calendar maths: which start times are free for a service on a date.
// Pure functions, no storage, so they are easy to test.
//
// booking.schedule per weekday: null (closed), ["09:00", "17:00"], or a list of
// ranges for breaks, e.g. [["09:00", "13:00"], ["14:00", "17:00"]].
// booking.staff: a number (that many interchangeable people), or a list of named
// people with the services each one does, e.g. doctors.

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));
export const isTime = (s) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function toMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function fromMin(n) {
  return String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
}

export function addDays(date, n) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekday(date) {
  return DAY_KEYS[new Date(date + "T00:00:00Z").getUTCDay()];
}
export function niceDate(date) {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-GB",
    { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

// Today's date and the minutes past midnight, in the business's time zone.
export function nowIn(tz, at = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function serviceMinutes(service) {
  if (Number.isFinite(service.minutes)) return service.minutes;
  const n = parseInt(String(service.duration || ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

export function findService(business, name) {
  const want = String(name || "").trim().toLowerCase();
  return business.services.find(s => s.name.toLowerCase() === want) || null;
}

// Opening ranges for a date, in minutes: [[open, close], ...]
export function openRanges(cfg, date) {
  const day = cfg.schedule[weekday(date)];
  if (!day) return [];
  const list = Array.isArray(day[0]) ? day : [day];
  return list.map(([o, c]) => [toMin(o), toMin(c)]);
}

// Everyone who can be booked: [{ index, name, services }]
export function staffList(cfg) {
  if (Array.isArray(cfg.staff)) return cfg.staff.map((s, index) => ({ index, name: s.name, role: s.role, services: s.services || null }));
  return Array.from({ length: cfg.staff }, (_, index) => ({ index, name: `${cfg.staffLabel || "Staff"} ${index + 1}`, services: null }));
}
export function staffFor(cfg, service) {
  return staffList(cfg).filter(s => !s.services || s.services.includes(service.name));
}

// The slot-sized blocks a booking occupies.
export function units(startMin, minutes, step) {
  const out = [];
  for (let t = startMin; t < startMin + minutes; t += step) out.push(fromMin(t));
  return out;
}

// Is this date one customers may book, and if not, why?
export function dateProblem(business, date, now) {
  const cfg = business.booking;
  if (!isDate(date)) return "That date is not valid.";
  if (date < now.date) return "That date is in the past.";
  if (date > addDays(now.date, cfg.daysAhead)) return `Bookings open up to ${cfg.daysAhead} days ahead.`;
  if (!openRanges(cfg, date).length) return `${business.name} is closed on ${niceDate(date).split(" ")[0]}s.`;
  return null;
}

// taken: Set of "staffIndex|HH:MM" blocks already booked on that date.
// onlyStaff: optional staff index to limit the search to one person.
// Returns [{ time: "HH:MM", staff: [free staff indexes] }] in time order.
export function freeStarts(business, service, date, taken, now, onlyStaff = null) {
  const cfg = business.booking;
  if (dateProblem(business, date, now)) return [];
  const len = serviceMinutes(service);
  const step = cfg.slotMinutes;
  const earliest = date === now.date ? now.minutes + cfg.leadMinutes : -Infinity;
  const people = staffFor(cfg, service).filter(s => onlyStaff === null || s.index === onlyStaff);
  const out = [];
  for (const [open, close] of openRanges(cfg, date)) {
    for (let start = open; start + len <= close; start += step) {
      if (start < earliest) continue;
      const blocks = units(start, len, step);
      const free = people.filter(p => blocks.every(t => !taken.has(`${p.index}|${t}`))).map(p => p.index);
      if (free.length) out.push({ time: fromMin(start), staff: free });
    }
  }
  return out;
}
