import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

function authorized(request: Request) {
  return (
    request.headers.get("x-admin-password") ===
    process.env.ADMIN_PASSWORD
  );
}

async function getMetrics(db: ReturnType<typeof supabaseAdmin>, campaign: any) {
  let query = db
    .from("orders")
    .select("amount_ore,ticket_count,status,created_at")
    .in("status", ["CAPTURED", "AUTHORIZED_AND_CAPTURED"]);

  if (campaign.start_date) {
    query = query.gte("created_at", `${campaign.start_date}T00:00:00`);
  }

  if (campaign.end_date) {
    query = query.lte("created_at", `${campaign.end_date}T23:59:59.999`);
  }

  const { data: orders, error } = await query;

  if (error) {
    throw error;
  }

  const paidOrders = orders || [];

  const revenueOre = paidOrders.reduce(
    (sum: number, order: any) =>
      sum + Number(order.amount_ore || 0),
    0,
  );

  const soldTickets = paidOrders.reduce(
    (sum: number, order: any) =>
      sum + Number(order.ticket_count || 0),
    0,
  );

  const revenueNok = revenueOre / 100;
  const maxRevenue =
    Number(campaign.ticket_price || 0) *
    Number(campaign.max_tickets || 0);
  const goalAmount = Math.max(0, Number(campaign.goal_amount || 0));

  return {
    revenue_nok: revenueNok,
    sold_tickets: soldTickets,
    paid_orders: paidOrders.length,
    remaining_tickets: Math.max(
      0,
      Number(campaign.max_tickets || 0) - soldTickets,
    ),
    remaining_revenue_nok: Math.max(
      0,
      maxRevenue - revenueNok,
    ),
    revenue_percent:
      maxRevenue > 0
        ? (revenueNok / maxRevenue) * 100
        : 0,
    goal_remaining_nok: Math.max(0, goalAmount - revenueNok),
    goal_percent:
      goalAmount > 0
        ? (revenueNok / goalAmount) * 100
        : 0,
  };
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Ikke autorisert" },
      { status: 401 },
    );
  }

  try {
    const db = supabaseAdmin();

    const { data: campaign, error } = await db
      .from("campaign_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (error || !campaign) {
      return NextResponse.json(
        { error: error?.message || "Fant ikke kampanjen." },
        { status: 500 },
      );
    }

    const metrics = await getMetrics(db, campaign);

    return NextResponse.json({
      campaign,
      metrics,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Kunne ikke hente kampanjen." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Ikke autorisert" },
      { status: 401 },
    );
  }

  const body = await request.json();
  const id = body?.id;

  if (!id) {
    return NextResponse.json(
      { error: "Mangler kampanje-ID." },
      { status: 400 },
    );
  }

  const ticketPrice = Number(body.ticket_price);
  const maxTickets = Number(body.max_tickets);

  if (!Number.isFinite(ticketPrice) || ticketPrice <= 0) {
    return NextResponse.json(
      { error: "Ugyldig loddpris." },
      { status: 400 },
    );
  }

  if (!Number.isInteger(maxTickets) || maxTickets <= 0) {
    return NextResponse.json(
      { error: "Ugyldig antall lodd." },
      { status: 400 },
    );
  }

  const goalAmount = Number(body.goal_amount);
  const organizationName = String(body.organization_name || "").trim();

  if (!Number.isFinite(goalAmount) || goalAmount <= 0 || goalAmount > 200000) {
    return NextResponse.json(
      { error: "Kampanjemålet må være mellom 1 og 200 000 kr." },
      { status: 400 },
    );
  }

  if (!organizationName) {
    return NextResponse.json(
      { error: "Organisasjonsnavn må fylles ut." },
      { status: 400 },
    );
  }

  if (ticketPrice * maxTickets > 200000) {
    return NextResponse.json(
      { error: "Pris per lodd × maks antall lodd kan ikke overstige 200 000 kr i denne versjonen." },
      { status: 400 },
    );
  }

  const allowedStatuses = ["draft", "active", "ended"];

  if (!allowedStatuses.includes(body.status)) {
    return NextResponse.json(
      { error: "Ugyldig kampanjestatus." },
      { status: 400 },
    );
  }

  try {
    const db = supabaseAdmin();

    const { data: campaign, error } = await db
      .from("campaign_settings")
      .update({
        name: String(body.name || "").trim(),
        ticket_price: ticketPrice,
        max_tickets: maxTickets,
        goal_amount: goalAmount,
        organization_name: organizationName,
        team_name: String(body.team_name || "").trim() || null,
        purpose_text: String(body.purpose_text || "").trim() || null,
        start_date: body.start_date || null,
        end_date: body.end_date || null,
        status: body.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !campaign) {
      return NextResponse.json(
        { error: error?.message || "Kunne ikke lagre kampanjen." },
        { status: 500 },
      );
    }

    const metrics = await getMetrics(db, campaign);

    return NextResponse.json({
      ok: true,
      campaign,
      metrics,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Kunne ikke lagre kampanjen." },
      { status: 500 },
    );
  }
}