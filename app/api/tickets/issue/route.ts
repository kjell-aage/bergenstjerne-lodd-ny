import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { reference } = await req.json();

    if (!reference || typeof reference !== "string") {
      return NextResponse.json(
        { error: "Mangler betalingsreferanse." },
        { status: 400 },
      );
    }

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

    // Lodd skal bare kunne utstedes etter bekreftet betaling.
    if (
      order.status !== "AUTHORIZED_AND_CAPTURED" &&
      order.status !== "CAPTURED"
    ) {
      return NextResponse.json(
        { error: "Betalingen er ikke klar for loddutstedelse." },
        { status: 409 },
      );
    }

    // Viktig: Hvis lodd allerede eksisterer for ordren,
    // returnerer vi dem i stedet for å lage nye.
    const { data: existingTickets, error: existingTicketsError } = await db
      .from("tickets")
      .select(
        "id,prize_id,symbols,prizes(id,name,image_url,description,value_nok,is_consolation)",
      )
      .eq("order_id", order.id);

    if (existingTicketsError) {
      throw existingTicketsError;
    }

    if (
      existingTickets &&
      existingTickets.length === Number(order.ticket_count)
    ) {
      if (order.status !== "CAPTURED") {
        await db
          .from("orders")
          .update({ status: "CAPTURED" })
          .eq("id", order.id);
      }

      return NextResponse.json({
        status: "CAPTURED",
        tickets: existingTickets.map((ticket: any) => ({
          id: ticket.id,
          symbols: ticket.symbols || [],
          prize: ticket.prizes || null,
        })),
      });
    }

    // Hvis det finnes noen, men ikke riktig antall,
    // stopper vi i stedet for å risikere doble lodd.
    if (existingTickets && existingTickets.length > 0) {
      throw new Error(
        `Ordren har ${existingTickets.length} lodd, men forventer ${order.ticket_count}.`,
      );
    }

    const { data: prizes, error: prizesError } = await db
      .from("prizes")
      .select("*")
      .eq("active", true)
      .gt("quantity_remaining", 0)
      .order("sort_order");

    if (prizesError) {
      throw prizesError;
    }

    const allPrizes = prizes || [];

    const consolation =
      allPrizes.find(
        (prize: any) =>
          prize.is_consolation &&
          Number(prize.quantity_remaining) > 0,
      ) || null;

    const regularPrizes = allPrizes.filter(
      (prize: any) => !prize.is_consolation,
    );

    const symbolPool = allPrizes;
    const createdTickets: any[] = [];

    for (let index = 0; index < Number(order.ticket_count); index += 1) {
      let prize: any = null;

      if (
        order.package_type === "grass" &&
        index === 0 &&
        consolation &&
        Number(consolation.quantity_remaining) > 0
      ) {
        prize = consolation;
      } else {
        const roll = Math.random() * 100;
        let accumulatedChance = 0;

        for (const candidate of regularPrizes) {
          if (Number(candidate.quantity_remaining) <= 0) {
            continue;
          }

          accumulatedChance += Number(
            candidate.win_chance_percent || 0,
          );

          if (roll < accumulatedChance) {
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

          symbols.push(
            pickedPrize?.image_url || "/football.svg",
          );
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
          counts[imageUrl] =
            (counts[imageUrl] || 0) + 1;
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
        throw new Error(
          ticketError?.message ||
            "Kunne ikke opprette lodd.",
        );
      }

      if (prize) {
        const newRemaining =
          Number(prize.quantity_remaining) - 1;

        if (newRemaining < 0) {
          throw new Error(
            `Premien ${prize.name} har ikke flere eksemplarer igjen.`,
          );
        }

        const { error: prizeUpdateError } = await db
          .from("prizes")
          .update({
            quantity_remaining: newRemaining,
          })
          .eq("id", prize.id)
          .eq(
            "quantity_remaining",
            Number(prize.quantity_remaining),
          );

        if (prizeUpdateError) {
          throw prizeUpdateError;
        }

        prize.quantity_remaining = newRemaining;
      }

      createdTickets.push({
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

    const { error: finalOrderError } = await db
      .from("orders")
      .update({ status: "CAPTURED" })
      .eq("id", order.id)
      .eq("status", "AUTHORIZED_AND_CAPTURED");

    if (finalOrderError) {
      throw finalOrderError;
    }

    return NextResponse.json({
      status: "CAPTURED",
      tickets: createdTickets,
    });
  } catch (error) {
    console.error("TICKET ISSUE ERROR:", error);

    return NextResponse.json(
      { error: "Kunne ikke opprette loddene." },
      { status: 500 },
    );
  }
}