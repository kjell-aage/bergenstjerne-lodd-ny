import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

function authorized(request: Request) {
  return (
    request.headers.get("x-admin-password") ===
    process.env.ADMIN_PASSWORD
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Ikke autorisert" },
      { status: 401 },
    );
  }

  const db = supabaseAdmin();

  const { data, error } = await db
    .from("campaign_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
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

  if (
    !Number.isFinite(ticketPrice) ||
    ticketPrice <= 0
  ) {
    return NextResponse.json(
      { error: "Ugyldig loddpris." },
      { status: 400 },
    );
  }

  if (
    !Number.isInteger(maxTickets) ||
    maxTickets <= 0
  ) {
    return NextResponse.json(
      { error: "Ugyldig antall lodd." },
      { status: 400 },
    );
  }

  const allowedStatuses = [
    "draft",
    "active",
    "ended",
  ];

  if (!allowedStatuses.includes(body.status)) {
    return NextResponse.json(
      { error: "Ugyldig kampanjestatus." },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  const { data, error } = await db
    .from("campaign_settings")
    .update({
      name: String(body.name || "").trim(),
      ticket_price: ticketPrice,
      max_tickets: maxTickets,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      status: body.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    campaign: data,
  });
}