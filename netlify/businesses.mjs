// =====================================================================
// Clinic profile. Everything the assistant knows comes from here.
// CareFirst Clinic is a fictional sample clinic for demonstrations.
// For a real clinic: change the details, set sample: false, and redeploy.
// =====================================================================

export const businesses = {
  "carefirst-clinic": {
    name: "CareFirst Clinic",
    type: "family clinic",
    location: "Dubai (sample address), with free parking for patients",
    timezone: "Asia/Dubai",
    languages: "English and Arabic",
    sample: true,                         // true = fictional demo clinic, shown as such on the page

    hours: [
      "Monday to Saturday: 9:00 am to 5:00 pm (break 1:00 to 2:00 pm)",
      "Sunday: closed",
    ],

    // Each service: duration sets how long it blocks the doctor's calendar.
    services: [
      { name: "General consultation", duration: "30 min", price: "AED 250" },
      { name: "Skin consultation", duration: "30 min", price: "AED 350" },
      { name: "Dental check-up", duration: "30 min", price: "AED 300" },
    ],

    booking: {
      slotMinutes: 30,                    // appointment start times every 30 minutes
      leadMinutes: 60,                    // earliest booking: 1 hour from now
      daysAhead: 14,                      // how far ahead patients can book
      staffLabel: "Doctor",
      // Each doctor has their own calendar and only the services listed.
      staff: [
        { name: "Dr. Amina Rahman", role: "General practitioner", services: ["General consultation"] },
        { name: "Dr. Omar Haddad", role: "Dermatologist", services: ["Skin consultation"] },
        { name: "Dr. Lina Farouk", role: "Dentist", services: ["Dental check-up"] },
      ],
      // Opening times per weekday; null = closed. Two ranges = a lunch break.
      schedule: {
        mon: [["09:00", "13:00"], ["14:00", "17:00"]],
        tue: [["09:00", "13:00"], ["14:00", "17:00"]],
        wed: [["09:00", "13:00"], ["14:00", "17:00"]],
        thu: [["09:00", "13:00"], ["14:00", "17:00"]],
        fri: [["09:00", "13:00"], ["14:00", "17:00"]],
        sat: [["09:00", "13:00"], ["14:00", "17:00"]],
        sun: null,
      },
    },

    policies: [
      "Fees are paid at the clinic, by card or cash.",
      "Please arrive 10 minutes early and bring your Emirates ID and insurance card if you have one.",
      "To cancel, use your booking reference and the mobile number you booked with.",
    ],

    // Anything the assistant cannot answer is handed to the front desk.
    handoff: "please call the clinic front desk during opening hours.",
  },
};

export function findBusiness(key) {
  const k = String(key || "").toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(businesses, k) ? businesses[k] : null;
}
