import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const PICKUP_PHONE = "91338157";
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || "post@bergensi.no";

async function sendNotification(subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, reason: "Email service is not configured" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from, to: [NOTIFY_EMAIL], subject, html })
  });
  return { sent: response.ok, reason: response.ok ? undefined : await response.text() };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { ticketId, method, shippingName, shippingAddress, shippingPostalCode, shippingCity } = body;
    if (!ticketId || !["pickup", "shipping"].includes(method)) {
      return NextResponse.json({ error: "Ugyldige opplysninger." }, { status: 400 });
    }
    if (method === "shipping" && (!shippingName || !shippingAddress || !shippingPostalCode || !shippingCity)) {
      return NextResponse.json({ error: "Fyll inn hele postadressen." }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: ticket, error: ticketError } = await db
      .from("tickets")
      .select("id,ticket_number,prize_id,fulfillment_status,orders(customer_name,phone),prizes(name)")
      .eq("id", ticketId)
      .single();
console.log("CLAIM TICKET ID:", ticketId);
console.log("CLAIM TICKET:", ticket);
console.log("CLAIM TICKET ERROR:", ticketError);
    if (ticketError || !ticket || !ticket.prize_id) {
      return NextResponse.json({ error: "Fant ikke gevinsten." }, { status: 404 });
    }

    const update = {
      fulfillment_method: method,
      fulfillment_status: method === "pickup" ? "AWAITING_PICKUP" : "TO_BE_SHIPPED",
      shipping_name: method === "shipping" ? shippingName : null,
      shipping_address: method === "shipping" ? shippingAddress : null,
      shipping_postal_code: method === "shipping" ? shippingPostalCode : null,
      shipping_city: method === "shipping" ? shippingCity : null,
      claimed_at: new Date().toISOString()
    };

    const { error: updateError } = await db.from("tickets").update(update).eq("id", ticketId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const order:any = Array.isArray(ticket.orders) ? ticket.orders[0] : ticket.orders;
    const prize:any = Array.isArray(ticket.prizes) ? ticket.prizes[0] : ticket.prizes;
    const methodText = method === "pickup"
      ? `Hentes. Vinneren er bedt om å kontakte ${PICKUP_PHONE}.`
      : `Sendes til: ${shippingName}, ${shippingAddress}, ${shippingPostalCode} ${shippingCity}.`;

    const subject = `Ny gevinst: ${prize?.name || "Premie"}`;
    const html = `
      <h2>Ny premie er vunnet</h2>
      <p><strong>Navn:</strong> ${order?.customer_name || "–"}</p>
      <p><strong>Telefon:</strong> ${order?.phone || "–"}</p>
      <p><strong>Premie:</strong> ${prize?.name || "–"}</p>
      <p><strong>Loddnummer:</strong> ${ticket.ticket_number || "–"}</p>
      <p><strong>Levering:</strong> ${methodText}</p>
    `;
    const notification = await sendNotification(subject, html);

    return NextResponse.json({ ok: true, notificationSent: notification.sent, pickupPhone: PICKUP_PHONE });
  } catch (error:any) {
    return NextResponse.json({ error: error?.message || "Ukjent feil." }, { status: 500 });
  }
}
