// AI clinic receptionist. Answers questions and finds free appointment times;
// the patient books by tapping a time (book.mjs), so the AI never books on its own.
import { findBusiness } from "../businesses.mjs";
import { nowIn, addDays, niceDate, findService, dateProblem, openRanges, staffFor } from "../booking/calendar.mjs";
import { availability, getBooking } from "../booking/store.mjs";
import { json, publicTimes } from "../booking/http.mjs";

const DEFAULT_BUSINESS = "carefirst-clinic";
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";
const MAX_MESSAGES = 20;     // conversation turns kept per request
const MAX_CHARS = 800;       // longest message a patient can send
const MAX_TOOL_ROUNDS = 3;   // availability look-ups per patient message

function nextDays(b) {
  const now = nowIn(b.timezone);
  return Array.from({ length: 8 }, (_, i) => {
    const d = addDays(now.date, i);
    const label = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : "";
    return `${niceDate(d)} = ${d}${label}${openRanges(b.booking, d).length ? "" : " CLOSED"}`;
  }).join("\n");
}

async function verifiedBookings(key, input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input.slice(0, 5)) {
    const id = String(item?.ref || ""), date = String(item?.date || "");
    if (!/^[A-Z0-9]{6}$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const bk = await getBooking(key, date, id);
    if (bk) out.push(bk);
  }
  return out;
}

function systemPrompt(b, booked) {
  const now = nowIn(b.timezone);
  const clock = `${String(Math.floor(now.minutes / 60)).padStart(2, "0")}:${String(now.minutes % 60).padStart(2, "0")}`;
  const services = b.services.map(s => {
    const who = staffFor(b.booking, s).map(d => `${d.name} (${d.role})`).join(", ");
    return `- ${s.name}: ${s.price}, ${s.duration}, with ${who}`;
  }).join("\n");
  const bookedNote = booked.length ? `
Appointments this patient booked in this chat (checked in the calendar just now, so they are real):
${booked.map(x => `- ${x.service} with ${x.staffName}, ${niceDate(x.date)} at ${x.time}, ref ${x.id}: ${x.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`).join("\n")}
The patient booked these by tapping a time and confirming, not through you. Never say they were not booked. If they say "no" or "thanks", close warmly and briefly.
` : "";

  return `You are the online receptionist for ${b.name}, a ${b.type} in ${b.location}.${b.sample ? " It is a fictional sample clinic used for demonstrations." : ""}
Now: ${niceDate(now.date)}, ${clock} (${b.timezone} time).

Your job: answer questions about the clinic and help patients book appointments. Be warm, calm, brief and clear. Keep replies to 1 to 4 short sentences. Plain text only: no markdown, no bullet symbols, no emojis unless the patient uses them. You can reply in ${b.languages}; answer in the patient's language.

Next days (use these exact dates):
${nextDays(b)}

Opening hours:
${b.hours.join("\n")}

Services, fees and doctors:
${services}

Policies:
${b.policies.map(p => "- " + p).join("\n")}

Booking:
- You see real availability only with the check_availability tool. Never guess or promise a time without it.
- To book, find out which service and which day (ask if missing), then call check_availability.
- Free times appear to the patient as buttons under your message. Reply briefly, mention at most 3 times (like "10:30 am" or "2:00 pm"), and tell them to tap a time to book. Do not ask for their name or number: the booking form asks after they tap.
- If they ask for a specific time, check it and say whether it is free; if not, suggest the nearest free times. If the day is full or closed, suggest days from next_available.
- To cancel, tell them to tap "Cancel a booking" under the chat and enter their reference and mobile number. To change a time, they cancel and book again.
${bookedNote}
Medical safety (most important):
- You are not a doctor or nurse. Never diagnose, never say what a symptom means, never suggest medicines, doses or treatment, and never say whether something is serious.
- If the patient describes anything that could be an emergency (for example chest pain, trouble breathing, severe bleeding, signs of a stroke, a seizure, a serious injury, thoughts of harming themselves, or a very unwell baby), tell them clearly and first to call 998 for an ambulance or go to the nearest emergency department now, and not to wait for an appointment.
- If they mention symptoms, you may only help choose which listed service to book (for example skin problems: Skin consultation; teeth: Dental check-up; anything else: General consultation). Do not ask for medical details; they are not needed to book.

Rules:
- Only use the information above and tool results. Never invent services, doctors, fees, insurance details, offers or availability.
- For anything you cannot answer from this information, say so politely and give this: ${b.handoff}`;
}

function tools(b) {
  return [{
    name: "check_availability",
    description: "Get the free appointment start times for one service on one date from the live clinic calendar, and the doctor. Also returns the next days with free times if that date is full or closed.",
    input_schema: {
      type: "object",
      properties: {
        service: { type: "string", enum: b.services.map(s => s.name), description: "Exact service name" },
        date: { type: "string", description: "Date as YYYY-MM-DD" },
      },
      required: ["service", "date"],
    },
  }];
}

async function checkAvailability(key, b, input) {
  const service = findService(b, input?.service);
  if (!service) return { forAI: { error: "Unknown service. Use one of the listed services." } };
  const now = nowIn(b.timezone);
  const date = String(input?.date || "");
  const problem = dateProblem(b, date, now);
  const free = problem ? [] : publicTimes(await availability(key, b, service, date, now));
  const doctors = staffFor(b.booking, service).map(d => d.name).join(", ");
  const result = { service: service.name, doctor: doctors, date, day: problem ? null : niceDate(date), problem, free_times: free };
  if (!free.length) {
    const next = [];
    const base = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= now.date ? date : now.date;
    for (let i = 1; i <= 7 && next.length < 3; i++) {
      const d = addDays(base, i);
      if (dateProblem(b, d, now)) continue;
      const t = publicTimes(await availability(key, b, service, d, now));
      if (t.length) next.push({ date: d, day: niceDate(d), first_times: t.slice(0, 3) });
    }
    result.next_available = next;
  }
  return { forAI: result, slots: free.length ? { service: service.name, doctor: doctors, date, times: free } : null };
}

function cleanMessages(input) {
  if (!Array.isArray(input)) return null;
  const msgs = [];
  for (const m of input) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") continue;
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (!content) continue;
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) last.content += "\n" + content;
    else msgs.push({ role: m.role, content });
  }
  const recent = msgs.slice(-MAX_MESSAGES);
  while (recent.length && recent[0].role !== "user") recent.shift();
  if (!recent.length || recent[recent.length - 1].role !== "user") return null;
  return recent;
}

async function callClaude(apiKey, body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("AI API error", res.status, await res.text());
    return null;
  }
  return res.json();
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json(500, { error: "The assistant is not set up yet (missing API key)." });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid request." }); }
  const key = String(body?.business || DEFAULT_BUSINESS).toLowerCase();
  const business = findBusiness(key);
  if (!business) return json(404, { error: "Unknown clinic." });
  const messages = cleanMessages(body?.messages);
  if (!messages) return json(400, { error: "Invalid conversation." });

  try {
    const system = systemPrompt(business, await verifiedBookings(key, body?.bookings));
    const toolList = tools(business);
    let slots = null;
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const data = await callClaude(apiKey, {
        model: MODEL, max_tokens: 500, system, messages,
        ...(round < MAX_TOOL_ROUNDS ? { tools: toolList } : {}),
      });
      if (!data) return json(502, { error: "The assistant is busy. Please try again in a moment." });
      const uses = (data.content || []).filter(c => c.type === "tool_use");
      if (data.stop_reason !== "tool_use" || !uses.length) {
        const reply = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n").trim();
        return json(200, { reply: reply || "Sorry, could you say that again?", slots });
      }
      messages.push({ role: "assistant", content: data.content });
      const results = [];
      for (const use of uses) {
        const out = use.name === "check_availability"
          ? await checkAvailability(key, business, use.input)
          : { forAI: { error: "Unknown tool." } };
        if (out.slots) slots = out.slots;
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(out.forAI) });
      }
      messages.push({ role: "user", content: results });
    }
    return json(502, { error: "The assistant is busy. Please try again in a moment." });
  } catch (err) {
    console.error(err);
    return json(502, { error: "The assistant is busy. Please try again in a moment." });
  }
};

export const config = { path: "/api/chat" };
