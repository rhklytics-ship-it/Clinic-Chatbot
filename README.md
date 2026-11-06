# CareFirst Clinic: AI booking assistant (Netlify)

An AI receptionist for a clinic. Patients chat in plain English or Arabic, see each
doctor's real free times, and book or cancel in a few taps. The same time can never
be booked twice, and the clinic manages appointments on a password-protected screen
with Excel export. CareFirst is a fictional sample clinic for demonstrations.

```
clinic-chatbot/
├─ public/index.html                 chat + live doctor schedule (patient page)
├─ public/admin.html                 clinic appointments screen (password)
├─ public/bookings-export.js         builds the Excel file
├─ public/vendor/exceljs-4.4.0.min.js  Excel library (bundled, nothing loads from outside)
├─ netlify/businesses.mjs            the clinic: doctors, services, fees, hours, policies
├─ netlify/booking/calendar.mjs      opening hours, lunch break, which times are free
├─ netlify/booking/store.mjs         appointments in Netlify Blobs, double-booking lock
├─ netlify/functions/chat.mjs        AI receptionist (finds free times with a tool)
├─ netlify/functions/book.mjs        books a time the patient tapped (no AI involved)
├─ netlify/functions/cancel.mjs      patient cancels with reference + mobile number
├─ netlify/functions/schedule.mjs    live schedule for the side panel (no patient data)
├─ netlify/functions/admin.mjs       clinic screen: list, cancel, add, Excel range
├─ netlify.toml, package.json, .gitignore
```

## Deploy (GitHub + Netlify)

1. Push this folder to a private GitHub repository. `.gitignore` keeps `.env` and
   `node_modules` out.
2. Netlify: Add new project → Import an existing project → GitHub → choose the repo.
   Leave the build settings as they are (they come from `netlify.toml`) and deploy.
3. Project configuration → Environment variables → add:
   - `ANTHROPIC_API_KEY`: your Claude API key (set a monthly spend limit in the Claude Console)
   - `BOOKINGS_ADMIN_KEY`: a password of at least 8 characters for the appointments screen
4. Deploys → Trigger deploy. Bookings are stored in Netlify Blobs: free, nothing to set up.

Test on the live site, not with `netlify dev`: the booking storage needs Netlify.

## Try it

- Chat: "I have a skin rash, can I see someone on Monday?" Free times appear as buttons;
  tap one, enter a name and mobile, confirm. You get a reference.
- Schedule panel: pick a doctor and a day, tap a free time to book it directly.
- Open the page in a second browser: the time you booked is crossed out there too.
- "Cancel a booking": enter the reference and the same mobile number.
- `/admin.html`: enter the password to see appointments by doctor, cancel, add phone or
  walk-in appointments, and Download Excel for any date range.

## How it works

1. The AI never guesses availability. It calls `check_availability`, which reads the
   calendar and returns only free times for the right doctor.
2. Each doctor has their own calendar. Opening hours are 9:00 to 1:00 and 2:00 to 5:00,
   Monday to Saturday, so the lunch break and Sundays are never offered.
3. Booking claims the doctor's 30-minute block with "write only if new" storage. If two
   patients tap the same time, only the first gets it; the second is shown the times
   still free.
4. Cancelling needs the reference AND the mobile number used to book, so nobody can
   cancel someone else's appointment by guessing a reference.
5. A mobile number can hold at most 2 appointments per day (`MAX_PER_PHONE_PER_DAY`).

## Medical safety

The assistant is told it is not a doctor: it never diagnoses, explains symptoms or
suggests medicines. If a patient describes a possible emergency it tells them to call
998 or go to the nearest emergency department first. It only uses symptoms to pick the
right service, and the page shows the emergency number under the chat.

## Make it a real clinic

Everything is in `netlify/businesses.mjs`:
- `name`, `location`, `hours`, `policies`, `handoff` (what to tell patients it can't help with)
- `services`: name, duration (how long it blocks the calendar) and fee
- `booking.staff`: each doctor with the services they offer
- `booking.schedule`: opening ranges per weekday (two ranges = a lunch break; `null` = closed)
- `booking.slotMinutes`, `leadMinutes` (notice for same-day bookings), `daysAhead`
- set `sample: false`

Then in `public/index.html` change the clinic name in the header and title, and remove
the "Live demo · sample clinic" tag and the sample wording in the footer.
Clinics in Dubai should check DHA rules on patient data and advertising before going live.
