import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVippsToken, vippsHeaders } from "@/lib/vipps";

export async function GET(
  _: Request,
  context: { params: Promise<{ reference: string }> },
) {
  const { reference } = await context.params;

  try {
    const db = supabaseAdmin();

    const { data: order } = await db
      .from("orders")
      .select("*")
      .eq("reference", reference)
      .single();

    if (!order) {
      return NextResponse.json(
        { error: "Ordren finnes ikke." },
        { status: 404 },
      );
    }

    if (order.status === "CAPTURED") {
      const { data: tickets } = await db
        .from("tickets")
        .select(
          "id,prize_id,symbols,prizes(id,name,image_url,description,value_nok,is_consolation)",
        )
        .eq("order_id", order.id);

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
    const base =
      process.env.VIPPS_BASE_URL || "https://apitest.vipps.no";

    const statusRes = await fetch(
      `${base}/epayment/v1/payments/${reference}`,
      {
        headers: vippsHeaders(token),
      },
    );

    const payment = await statusRes.json();

    if (!statusRes.ok) {
      throw new Error(JSON.stringify(payment));
    }

    if (payment.state === "AUTHORIZED") {
     const authorizedAmount = Number(
  payment.aggregate?.authorizedAmount?.value || 0,
);

const capturedAmount = Number(
  payment.aggregate?.capturedAmount?.value || 0,
);

const amountToCapture = authorizedAmount - capturedAmount;

if (amountToCapture > 0) {
  const captureRes = await fetch(
    `${base}/epayment/v1/payments/${reference}/capture`,
    {
      method: "POST",
      headers: {
        ...vippsHeaders(token),
        "Idempotency-Key": randomUUID(),
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
    console.log("VIPPS CAPTURE ERROR:");
    console.log(text);
    throw new Error(text);
  }
}

      const { data: prizes } = await db
        .from("prizes")
        .select("*")
        .eq("active", true)
        .gt("quantity_remaining", 0)
        .order("sort_order");

      const allPrizes = prizes || [];

      const consolation =
        allPrizes.find(
          (prize: any) =>
            prize.is_consolation &&
            prize.quantity_remaining > 0,
        ) || null;

      const regularPrizes = allPrizes.filter(
        (prize: any) => !prize.is_consolation,
      );

      const symbolPool = allPrizes.length ? allPrizes : [];
      const tickets = [];

      for (let index = 0; index < order.ticket_count; index += 1) {
        let prize: any = null;

        if (
          order.package_type === "grass" &&
          index === 0 &&
          consolation
        ) {
          prize = consolation;
        } else {
          const roll = Math.random() * 100;
          let accumulatedChance = 0;

          for (const candidate of regularPrizes) {
            accumulatedChance += Number(
              candidate.win_chance_percent || 0,
            );

            if (
              roll < accumulatedChance &&
              candidate.quantity_remaining > 0
            ) {
              prize = candidate;
              break;
            }
          }
        }

        const symbols: string[] = [];

        if (prize) {
          symbols.push(
            prize.image_url,
            prize.image_url,
            prize.image_url,
          );

          while (symbols.length < 9) {
            const candidates = symbolPool.filter(
              (candidate: any) => candidate.id !== prize.id,
            );

            const pickedPrize = candidates.length
              ? candidates[
                  Math.floor(Math.random() * candidates.length)
                ]
              : prize;

            symbols.push(pickedPrize.image_url);
          }

          for (
            let symbolIndex = symbols.length - 1;
            symbolIndex > 0;
            symbolIndex -= 1
          ) {
            const randomIndex = Math.floor(
              Math.random() * (symbolIndex + 1),
            );

            [symbols[symbolIndex], symbols[randomIndex]] = [
              symbols[randomIndex],
              symbols[symbolIndex],
            ];
          }
        } else {
          const counts: Record<string, number> = {};

          while (symbols.length < 9) {
            const candidates = symbolPool.filter(
              (candidate: any) =>
                (counts[candidate.image_url] || 0) < 2,
            );

            const pickedPrize = candidates.length
              ? candidates[
                  Math.floor(Math.random() * candidates.length)
                ]
              : null;

            const imageUrl =
              pickedPrize?.image_url || "/football.svg";

            symbols.push(imageUrl);
            counts[imageUrl] = (counts[imageUrl] || 0) + 1;
          }
        }

        const { data: ticket, error: ticketError } = await db
          .from("tickets")
          .insert({
            order_id: order.id,
            prize_id: prize?.id || null,
            ticket_number: `BST-${randomUUID()
              .slice(0, 8)
              .toUpperCase()}`,
            symbols,
          })
          .select("id,prize_id,symbols")
          .single();

        if (ticketError || !ticket) {
          console.error(
            "Kunne ikke opprette lodd:",
            ticketError,
          );

          throw new Error(
            ticketError?.message ||
              "Kunne ikke opprette lodd.",
          );
        }

        if (prize) {
          await db
            .from("prizes")
            .update({
              quantity_remaining:
                prize.quantity_remaining - 1,
            })
            .eq("id", prize.id);

          prize.quantity_remaining -= 1;
        }

        tickets.push({
          id: ticket.id,
          symbols,
          prize: prize
            ? {
                id: prize.id,
                name: prize.name,
                image_url: prize.image_url,
                description: prize.description,
                value_nok: prize.value_nok,
                is_consolation: prize.is_consolation,
              }
            : null,
        });
      }

      await db
        .from("orders")
        .update({ status: "CAPTURED" })
        .eq("id", order.id);

      return NextResponse.json({
        status: "CAPTURED",
        tickets,
      });
    }

    return NextResponse.json({
      status: payment.state,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Kunne ikke kontrollere betalingen." },
      { status: 500 },
    );
  }
}
