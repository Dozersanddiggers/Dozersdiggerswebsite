// Cloudflare Pages Function — handles POST /api/book
// Sends a booking notification to the business AND an instant auto-reply to the customer via Resend.
// Requires an environment variable RESEND_API_KEY (set in the Cloudflare Pages project settings).

const BUSINESS_EMAIL = "dozersanddiggers757@gmail.com";
const FROM = "Dozers & Diggers <bookings@dozersanddiggers.com>";
const PHONE = "(757) 453-3186";

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

async function sendEmail(env, payload) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text}`);
  }
  return res.json();
}

export async function onRequestPost({ request, env }) {
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  try {
    if (!env.RESEND_API_KEY) {
      return json({ ok: false, error: "Email is not configured yet." }, 500);
    }

    const form = await request.formData();
    const d = Object.fromEntries(form.entries());

    // Honeypot: silently accept bots without emailing.
    if (d._honey) return json({ ok: true });

    const first = (d["First Name"] || "").trim();
    const last = (d["Last Name"] || "").trim();
    const phone = (d["Phone"] || "").trim();
    const email = (d["email"] || "").trim();

    if (!first || !last || !phone || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ ok: false, error: "Please fill in your name, phone, and a valid email." }, 400);
    }

    const rows = [
      ["Name", `${first} ${last}`],
      ["Phone", phone],
      ["Email", email],
      ["Event type", d["Event Type"] || "—"],
      ["Construction workers (kids)", d["Number of Construction Workers"] || "—"],
      ["Party date", d["Party Date"] || "—"],
      ["Party time", d["Party Time"] || "—"],
      ["Location", d["Party Location"] || "—"],
      ["Parking", d["Parking Information"] || "—"],
      ["Notes", d["Additional Notes"] || "—"],
    ];

    const tableRows = rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:8px 14px;border:1px solid #E6DCC9;background:#FBF7EF;font-weight:600;white-space:nowrap">${esc(
            k
          )}</td><td style="padding:8px 14px;border:1px solid #E6DCC9">${esc(v)}</td></tr>`
      )
      .join("");

    const businessHtml = `
      <div style="font-family:Arial,sans-serif;color:#2B2620">
        <h2 style="margin:0 0 12px">New Party Booking Request</h2>
        <table style="border-collapse:collapse;font-size:14px">${tableRows}</table>
        <p style="font-size:13px;color:#777;margin-top:16px">Reply directly to this email to reach ${esc(
          first
        )}.</p>
      </div>`;

    const customerHtml = `
      <div style="font-family:Arial,sans-serif;color:#2B2620;line-height:1.6">
        <p>Hi ${esc(first)},</p>
        <p>Thanks so much for your booking request with <strong>Dozers &amp; Diggers</strong>! We've received your party details and we're excited to help you plan an unforgettable dig-site experience.</p>
        <p>We'll personally follow up within <strong>24 hours</strong> to confirm your date and answer any questions. If you need us sooner, just call or text <strong>${PHONE}</strong>.</p>
        <p>Talk soon,<br>The Dozers &amp; Diggers Team</p>
      </div>`;

    // Notify the business (reply-to the customer so you can respond directly)
    await sendEmail(env, {
      from: FROM,
      to: BUSINESS_EMAIL,
      reply_to: email,
      subject: `New booking request — ${first} ${last}`,
      html: businessHtml,
    });

    // Instant auto-reply to the customer
    await sendEmail(env, {
      from: FROM,
      to: email,
      reply_to: BUSINESS_EMAIL,
      subject: "We got your booking request — Dozers & Diggers",
      html: customerHtml,
    });

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: "Could not send right now. Please call or text " + PHONE + "." }, 500);
  }
}
