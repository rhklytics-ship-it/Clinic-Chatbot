// Small helpers shared by the booking functions.

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function cleanCustomer(input) {
  const name = String(input?.name || "").replace(/\s+/g, " ").trim();
  const phone = String(input?.phone || "").replace(/[^\d+]/g, "");
  const digits = phone.replace(/\D/g, "");
  if (name.length < 2 || name.length > 60) return { error: "Please enter your name." };
  if (digits.length < 7 || digits.length > 15) return { error: "Please enter a valid mobile number." };
  return { name, phone };
}

// Times to show the customer, with staff details removed.
export const publicTimes = (starts) => starts.map(s => s.time);
