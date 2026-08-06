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
      { status: 401 }
    );
  }

  const db = supabaseAdmin();

  const { data, error } = await db
    .from("tickets")
    .select(`
      id,
      ticket_number,
      fulfillment_status,
      fulfillment_method,
      shipping_name,
      shipping_address,
      shipping_postal_code,
      shipping_city,
      claimed_at,
      orders(customer_name, phone),
      prizes(name)
    `)
    .not("prize_id", "is", null)
    .order("claimed_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data || []);
}

export async function PATCH(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Ikke autorisert" },
      { status: 401 }
    );
  }

  const body = await request.json();
  const id = body?.id;
  const fulfillmentStatus = body?.fulfillmentStatus;

  if (!id || !fulfillmentStatus) {
    return NextResponse.json(
      { error: "Mangler ID eller status." },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  const { data, error } = await db
    .from("tickets")
    .update({
      fulfillment_status: fulfillmentStatus,
    })
    .eq("id", id)
    .select("id, fulfillment_status")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    ticket: data,
  });
}