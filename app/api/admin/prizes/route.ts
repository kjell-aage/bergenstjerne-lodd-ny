import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function authorized(req: Request) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return jsonError("Ikke tilgang.", 401);
  }

  try {
    const { data, error } = await supabaseAdmin()
      .from("prizes")
      .select("*")
      .eq("active", true)
      .order("sort_order");

    if (error) {
      return jsonError(error.message);
    }

    return NextResponse.json(data || []);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ukjent serverfeil"
    );
  }
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return jsonError("Ikke tilgang.", 401);
  }

  try {
    const body = await req.json();
    const quantityTotal = Number(body.quantity_total);

    const payload = {
      name: body.name,
      level: body.level,
      image_url: body.image_url,
      quantity_total: quantityTotal,
      quantity_remaining: quantityTotal,
      win_chance_percent: Number(body.win_chance_percent),
      sort_order: Number(body.sort_order || 0),
      active: Boolean(body.active),
      description: body.description || null,
      value_nok: body.value_nok ? Number(body.value_nok) : null,
      is_consolation: Boolean(body.is_consolation),
    };

    const { data, error } = await supabaseAdmin()
      .from("prizes")
      .insert(payload)
      .select()
      .single();

    if (error) {
      return jsonError(error.message);
    }

    return NextResponse.json(data);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ukjent serverfeil"
    );
  }
}

export async function PATCH(req: Request) {
  if (!authorized(req)) {
    return jsonError("Ikke tilgang.", 401);
  }

  try {
    const body = await req.json();
    const id = body?.id;

    if (!id) {
      return jsonError("Mangler premie-ID.", 400);
    }

    const db = supabaseAdmin();

    const { data: currentPrize, error: readError } = await db
      .from("prizes")
      .select("quantity_total, quantity_remaining")
      .eq("id", id)
      .maybeSingle();

    if (readError) {
      return jsonError(readError.message);
    }

    if (!currentPrize) {
      return jsonError("Fant ikke premien.", 404);
    }

    const oldTotal = Number(currentPrize.quantity_total || 0);
    const oldRemaining = Number(currentPrize.quantity_remaining || 0);
    const alreadyWon = Math.max(0, oldTotal - oldRemaining);

    const newTotal = Number(body.quantity_total);
    const newRemaining = Math.max(0, newTotal - alreadyWon);

    const payload = {
      name: body.name,
      level: body.level,
      image_url: body.image_url,
      quantity_total: newTotal,
      quantity_remaining: newRemaining,
      win_chance_percent: Number(body.win_chance_percent),
      sort_order: Number(body.sort_order || 0),
      active: Boolean(body.active),
      description: body.description || null,
      value_nok: body.value_nok ? Number(body.value_nok) : null,
      is_consolation: Boolean(body.is_consolation),
    };

    const { data, error } = await db
      .from("prizes")
      .update(payload)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      return jsonError(error.message);
    }

    if (!data) {
      return jsonError("Premien ble ikke oppdatert.", 404);
    }

    return NextResponse.json(data);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ukjent serverfeil"
    );
  }
}

export async function DELETE(req: Request) {
  if (!authorized(req)) {
    return jsonError("Ikke tilgang.", 401);
  }

  try {
    const id = new URL(req.url).searchParams.get("id");

    if (!id) {
      return jsonError("Mangler premie-ID.", 400);
    }

    const { data, error } = await supabaseAdmin()
      .from("prizes")
      .update({ active: false })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      return jsonError(error.message);
    }

    if (!data) {
      return jsonError("Fant ikke premien.", 404);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ukjent serverfeil"
    );
  }
}