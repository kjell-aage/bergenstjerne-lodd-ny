import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getVippsToken,
  vippsHeaders,
  vippsBaseUrl,
} from "@/lib/vipps";

export async function GET(
  _: Request,
  context: { params: Promise<{ reference: string }> },
) {
  const { reference } = await context.params;

  try {
    const db = supabaseAdmin();

    const { data: order, error: orderError } = await db
      .from("orders")
      .select("*")
      .eq("reference", reference)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Ordren finnes ikke." },
        { status: 404 },
      );
    }

    // Hvis ordren allerede er ferdigbehandlet,
    // skal vi aldri opprette nye lodd igjen.
    if (order.status === "CAPTURED") {
      const { data: tickets, error: ticketReadError } = await db
        .from("tickets")
        .select(
          "id,prize_id,symbols,prizes(id,name,image_url,description,value_nok,is_consolation)",
        )
        .eq("order_id", order.id);

      if (ticketReadError) {
        throw ticketReadError;
      }

      return NextResponse.json({
        status: "CAPTURED",
        tickets: (tickets || []).map((ticket: any) => ({
          id: ticket.id,
          symbols: ticket.symbols || [],
          prize: ticket.prizes || null,
        })),
      });
    }

    const token = await getVippsToken();
    const base = vippsBaseUrl();

    const statusRes = await fetch(
      `${base}/epayment/v1/payments/${encodeURIComponent(reference)}`,
      {
        headers: vippsHeaders(token),
        cache: "no-store",
      },
    );

    const payment = await statusRes.json();

    if (!statusRes.ok) {
      throw new Error(
        `Vipps status error: ${statusRes.status} ${JSON.stringify(payment)}`,
      );
    }

    if (payment.state !== "AUTHORIZED") {
      return NextResponse.json({
        status: payment.state,
      });
    }

    const authorizedAmount = Number(
      payment.aggregate?.authorizedAmount?.value || 0,
    );

    const capturedAmount = Number(
      payment.aggregate?.capturedAmount?.value || 0,
    );

    const expectedAmount = Number(order.amount_ore || 0);

    // Viktig sikkerhetskontroll:
    // Vipps-beløpet må stemme med ordren vår.
    if (authorizedAmount !== expectedAmount) {
      throw new Error(
        `Beløpsavvik. Ordre=${expectedAmount}, Vipps=${authorizedAmount}`,
      );
    }

    const amountToCapture = authorizedAmount - capturedAmount;

    if (amountToCapture > 0) {
      const captureRes = await fetch(
        `${base}/epayment/v1/payments/${encodeURIComponent(reference)}/capture`,
        {
          method: "POST",
          headers: {
            ...vippsHeaders(token),
            "Idempotency-Key": `capture-${reference}`,
          },
          body: JSON.stringify({
            modificationAmount: {
              currency: "NOK",
              value: amountToCapture,
            },
          }),
        },
      );

      if (!captureRes.ok) {
        const text = await captureRes.text();

        throw new Error(
          `Vipps capture error: ${captureRes.status} ${text}`,
        );
      }
    }

    // Foreløpig beholder vi eksisterende loddlogikk,
    // men markerer ordren som klar for utstedelse.
    const { error: updateError } = await db
      .from("orders")
      .update({ status: "AUTHORIZED_AND_CAPTURED" })
      .eq("id", order.id)
      .neq("status", "CAPTURED");

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      status: "AUTHORIZED_AND_CAPTURED",
      reference,
    });
  } catch (error) {
    console.error("VIPPS STATUS ERROR:", error);

    return NextResponse.json(
      { error: "Kunne ikke kontrollere betalingen." },
      { status: 500 },
    );
  }
}