import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  getVippsToken,
  vippsHeaders,
  vippsBaseUrl,
} from "@/lib/vipps";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { name, phone, count, amount, packageType } = await req.json();

    const cleanPhone = String(phone || "").replace(/\D/g, "");
    const validAmount =
      packageType === "grass"
        ? amount === 60 && count === 5
        : amount === count * 20;

    if (
      !name ||
      cleanPhone.length !== 8 ||
      !Number.isInteger(count) ||
      count < 1 ||
      !Number.isInteger(amount) ||
      amount < 1 ||
      !validAmount
    ) {
      return NextResponse.json(
        { error: "Ugyldig bestilling." },
        { status: 400 }
      );
    }

    const reference = `BST-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const idempotencyKey = randomUUID();

    const db = supabaseAdmin();

    const { error: orderError } = await db.from("orders").insert({
      reference,
      customer_name: name.trim(),
      phone: cleanPhone,
      ticket_count: count,
      amount_ore: amount * 100,
      status: "PENDING",
      package_type: packageType || "regular",
    });

    if (orderError) {
      throw new Error(`Kunne ikke opprette ordre: ${orderError.message}`);
    }

    const token = await getVippsToken();

    const site =
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://bergenstjerne-lodd-ny.vercel.app";

    const response = await fetch(
      `${vippsBaseUrl()}/epayment/v1/payments`,
      {
        method: "POST",
        headers: {
          ...vippsHeaders(token),
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          amount: {
            currency: "NOK",
            value: amount * 100,
          },
          paymentMethod: {
            type: "WALLET",
          },
          customer: {
            phoneNumber: `47${cleanPhone}`,
          },
          reference,
          returnUrl: `${site}/return?reference=${encodeURIComponent(reference)}`,
          userFlow: "WEB_REDIRECT",
          paymentDescription: `${count} lodd – Bergenstjerne FK`,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      await db
        .from("orders")
        .update({ status: "VIPPS_CREATE_FAILED" })
        .eq("reference", reference);

      throw new Error(
        `Vipps create payment error: ${response.status} ${JSON.stringify(data)}`
      );
    }

    if (!data.redirectUrl) {
      throw new Error("Vipps returnerte ingen redirectUrl.");
    }

    return NextResponse.json({
      redirectUrl: data.redirectUrl,
      reference,
    });
  } catch (error) {
    console.error("VIPPS CREATE ERROR:", error);

    return NextResponse.json(
      { error: "Kunne ikke opprette Vipps-betaling." },
      { status: 500 }
    );
  }
}
