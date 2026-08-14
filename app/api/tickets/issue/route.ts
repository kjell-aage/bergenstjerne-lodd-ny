import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

/*
  Lager noen nøytrale reservesymboler direkte i systemet.

  Disse brukes bare for å sikre at et taperlodd aldri får
  tre like symboler dersom det foreløpig finnes få premier.

  Fotballen bruker bildet vårt i /public/football.svg.
*/
function makeNeutralSvg(symbol: string, label: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
      <rect width="220" height="220" rx="28" fill="white"/>
      <text
        x="110"
        y="112"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="92"
        font-family="Arial, sans-serif"
      >${symbol}</text>
      <text
        x="110"
        y="185"
        text-anchor="middle"
        font-size="20"
        font-family="Arial, sans-serif"
        fill="#143246"
      >${label}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const NEUTRAL_SYMBOLS = [
  "/football.svg",
  makeNeutralSvg("★", "Stjerne"),
  makeNeutralSvg("🏆", "Pokal"),
  makeNeutralSvg("⚽", "Kamp"),
  makeNeutralSvg("👟", "Fotball"),
];

function shuffle<T>(items: T[]) {
  const array = [...items];

  for (let index = array.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));

    [array[index], array[randomIndex]] = [
      array[randomIndex],
      array[index],
    ];
  }

  return array;
}

/*
  Fyller et lodd med symboler hvor hvert tilgjengelig
  symbol maksimalt kan brukes to ganger.

  exclude gjør at vinnersymbolet ikke blir brukt blant
  reservesymbolene på et vinnerlodd.
*/
function createSafeFill(
  availableSymbols: string[],
  amount: number,
  exclude?: string,
) {
  const uniqueSymbols = Array.from(
    new Set(
      availableSymbols.filter(
        (symbol) => symbol && symbol !== exclude,
      ),
    ),
  );

  const counts: Record<string, number> = {};
  const result: string[] = [];

  while (result.length < amount) {
    const candidates = uniqueSymbols.filter(
      (symbol) => (counts[symbol] || 0) < 2,
    );

    if (candidates.length === 0) {
      throw new Error(
        "Ikke nok forskjellige symboler til å lage et sikkert skrapelodd.",
      );
    }

    const picked =
      candidates[
        Math.floor(Math.random() * candidates.length)
      ];

    result.push(picked);
    counts[picked] = (counts[picked] || 0) + 1;
  }

  return result;
}

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

    /*
      Lodd skal bare kunne utstedes etter at betalingen
      faktisk er bekreftet.
    */
    if (
      order.status !== "AUTHORIZED_AND_CAPTURED" &&
      order.status !== "CAPTURED"
    ) {
      return NextResponse.json(
        {
          error:
            "Betalingen er ikke klar for loddutstedelse.",
        },
        { status: 409 },
      );
    }

    /*
      Hvis loddene allerede eksisterer, returnerer vi
      de samme loddene. Vi lager aldri nye lodd for
      samme betaling.
    */
    const {
      data: existingTickets,
      error: existingTicketsError,
    } = await db
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

    /*
      Hvis bare noen av loddene eksisterer, stopper vi.

      Dette beskytter mot doble lodd dersom noe skulle
      ha blitt avbrutt midt under opprettelsen.
    */
    if (
      existingTickets &&
      existingTickets.length > 0
    ) {
      throw new Error(
        `Ordren har ${existingTickets.length} lodd, men forventer ${order.ticket_count}.`,
      );
    }

    /*
      Hent aktive premier som fortsatt finnes på lager.
    */
    const { data: prizes, error: prizesError } =
      await db
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

    /*
      Alle aktive premielogoer kan brukes som symboler.

      I tillegg har vi nøytrale symboler slik at systemet
      også fungerer dersom klubben foreløpig bare har
      én eller to premier.
    */
    const prizeSymbols = allPrizes
      .map((prize: any) => prize.image_url)
      .filter(Boolean);

    const symbolPool = Array.from(
      new Set([
        ...prizeSymbols,
        ...NEUTRAL_SYMBOLS,
      ]),
    );

    const createdTickets: any[] = [];

    for (
      let index = 0;
      index < Number(order.ticket_count);
      index += 1
    ) {
      let prize: any = null;

      /*
        Grasrotpakken kan ha garantert trøstepremie
        på første lodd.
      */
      if (
        order.package_type === "grass" &&
        index === 0 &&
        consolation &&
        Number(consolation.quantity_remaining) > 0
      ) {
        prize = consolation;
      } else {
        /*
          Vanlig premietrekning.
        */
        const roll = Math.random() * 100;
        let accumulatedChance = 0;

        for (const candidate of regularPrizes) {
          if (
            Number(candidate.quantity_remaining) <= 0
          ) {
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

      let symbols: string[] = [];

      /*
        VINNERLODD

        Nøyaktig tre symboler av vinnerpremien.

        De resterende seks symbolene får aldri forekomme
        mer enn to ganger.

        Dermed finnes det bare én vinnende kombinasjon
        på loddet.
      */
      if (prize) {
        const winnerImage =
          prize.image_url || "/football.svg";

        const fillerSymbols = createSafeFill(
          symbolPool,
          6,
          winnerImage,
        );

        symbols = shuffle([
          winnerImage,
          winnerImage,
          winnerImage,
          ...fillerSymbols,
        ]);
      }

      /*
        TAPERLODD

        Alle ni symbolene lages med maks to forekomster
        av hvert symbol.

        Det er derfor matematisk umulig å få tre like
        symboler på et taperlodd.
      */
      else {
        symbols = shuffle(
          createSafeFill(
            symbolPool,
            9,
          ),
        );
      }

      /*
        Opprett loddet.
      */
      const {
        data: ticket,
        error: ticketError,
      } = await db
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

      /*
        Hvis loddet vant, trekk ett eksemplar
        fra tilgjengelig premieantall.
      */
      if (prize) {
        const newRemaining =
          Number(prize.quantity_remaining) - 1;

        if (newRemaining < 0) {
          throw new Error(
            `Premien ${prize.name} har ikke flere eksemplarer igjen.`,
          );
        }

        const { error: prizeUpdateError } =
          await db
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
              is_consolation:
                prize.is_consolation,
            }
          : null,
      });
    }

    /*
      Ordren er nå ferdig behandlet.
    */
    const { error: finalOrderError } =
      await db
        .from("orders")
        .update({
          status: "CAPTURED",
        })
        .eq("id", order.id)
        .eq(
          "status",
          "AUTHORIZED_AND_CAPTURED",
        );

    if (finalOrderError) {
      throw finalOrderError;
    }

    return NextResponse.json({
      status: "CAPTURED",
      tickets: createdTickets,
    });
  } catch (error) {
    console.error(
      "TICKET ISSUE ERROR:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Kunne ikke opprette loddene.",
      },
      {
        status: 500,
      },
    );
  }
}