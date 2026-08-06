import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getVippsToken, vippsHeaders } from "@/lib/vipps";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { name, phone, count, amount, packageType } = await req.json();
    const validAmount = packageType === "grass" ? amount === 60 && count === 5 : amount === count * 20;
    if (!name || !phone || !Number.isInteger(count) || count < 1 || !validAmount) {
      return NextResponse.json({ error: "Ugyldig bestilling." }, { status: 400 });
    }
    const reference = `BST-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const db = supabaseAdmin();
    const { error: orderError } = await db.from("orders").insert({
      reference, customer_name: name, phone, ticket_count: count, amount_ore: amount * 100, status: "PENDING", package_type: packageType || "regular"
    });
    if (orderError) throw orderError;

    const token = await getVippsToken();
    const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const response = await fetch(`${process.env.VIPPS_BASE_URL || "https://apitest.vipps.no"}/epayment/v1/payments`, {
      method: "POST",
      headers: { ...vippsHeaders(token), "Idempotency-Key": randomUUID() },
      body: JSON.stringify({
        amount: { currency: "NOK", value: amount * 100 },
        paymentMethod: { type: "WALLET" },
        customer: { phoneNumber: `47${phone.replace(/\D/g, "")}` },
        reference,
        returnUrl: `${site}/return?reference=${reference}`,
        userFlow: "WEB_REDIRECT",
        paymentDescription: `${count} skrapelodd – Bergenstjerne FK`
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    return NextResponse.json({ redirectUrl: data.redirectUrl, reference });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Kunne ikke opprette Vipps-betaling." }, { status: 500 });
  }
}
