import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

function authorized(request: Request) {
  return (
    request.headers.get("x-admin-password") ===
    process.env.ADMIN_PASSWORD
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function createUniqueSlug(
  db: ReturnType<typeof supabaseAdmin>,
  baseValue: string,
  excludeId?: string,
) {
  const base = slugify(baseValue) || "kampanje";
  let candidate = base;
  let counter = 2;

  while (true) {
    let query = db
      .from("campaign_settings")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    if (!data || data.id === excludeId) {
      return candidate;
    }

    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

async function getMetrics(
  db: ReturnType<typeof supabaseAdmin>,
  campaign: any,
) {
  let query = db
    .from("orders")
    .select("amount_ore,ticket_count,status,created_at,campaign_id")
    .in("status", ["CAPTURED", "AUTHORIZED_AND_CAPTURED"])
    .eq("campaign_id", campaign.id);

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

  const goalAmount = Math.max(
    0,
    Number(campaign.goal_amount || 0),
  );

  return {
    revenue_nok: revenueNok,
    sold_tickets: soldTickets,
    paid_orders: paidOrders.length,

    remaining_tickets: Math.max(
      0,
      Number(campaign.max_tickets || 0) -
        soldTickets,
    ),

    remaining_revenue_nok: Math.max(
      0,
      maxRevenue - revenueNok,
    ),

    revenue_percent:
      maxRevenue > 0
        ? (revenueNok / maxRevenue) * 100
        : 0,

    goal_remaining_nok: Math.max(
      0,
      goalAmount - revenueNok,
    ),

    goal_percent:
      goalAmount > 0
        ? (revenueNok / goalAmount) * 100
        : 0,
  };
}

function validateCampaign(body: any) {
  const ticketPrice = Number(body.ticket_price);
  const maxTickets = Number(body.max_tickets);
  const goalAmount = Number(body.goal_amount);
  const organizationName = String(
    body.organization_name || "",
  ).trim();

  if (!String(body.name || "").trim()) {
    return "Kampanjenavn må fylles ut.";
  }

  if (
    !Number.isFinite(ticketPrice) ||
    ticketPrice <= 0
  ) {
    return "Ugyldig loddpris.";
  }

  if (
    !Number.isInteger(maxTickets) ||
    maxTickets <= 0
  ) {
    return "Ugyldig antall lodd.";
  }

  if (
    !Number.isFinite(goalAmount) ||
    goalAmount <= 0 ||
    goalAmount > 200000
  ) {
    return "Kampanjemålet må være mellom 1 og 200 000 kr.";
  }

  if (!organizationName) {
    return "Organisasjonsnavn må fylles ut.";
  }

  if (ticketPrice * maxTickets > 200000) {
    return "Pris per lodd × maks antall lodd kan ikke overstige 200 000 kr i denne versjonen.";
  }

  const allowedStatuses = [
    "draft",
    "active",
    "ended",
  ];

  if (!allowedStatuses.includes(body.status)) {
    return "Ugyldig kampanjestatus.";
  }

  if (
    body.start_date &&
    body.end_date &&
    body.end_date < body.start_date
  ) {
    return "Sluttdato kan ikke være før startdato.";
  }

  return null;
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

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const { data: campaign, error } = await db
        .from("campaign_settings")
        .select("*")
        .eq("id", id)
        .is("archived_at", null)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 },
        );
      }

      if (!campaign) {
        return NextResponse.json(
          { error: "Fant ikke kampanjen." },
          { status: 404 },
        );
      }

      const metrics = await getMetrics(
        db,
        campaign,
      );

      return NextResponse.json({
        campaign,
        metrics,
      });
    }

    const { data: campaigns, error } =
      await db
        .from("campaign_settings")
        .select("*")
        .is("archived_at", null)
        .order("created_at", {
          ascending: false,
        });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    const result = await Promise.all(
      (campaigns || []).map(
        async (campaign) => ({
          ...campaign,
          metrics: await getMetrics(
            db,
            campaign,
          ),
        }),
      ),
    );

    return NextResponse.json({
      campaigns: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Kunne ikke hente kampanjene.",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Ikke autorisert" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();

    const validationError =
      validateCampaign(body);

    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 },
      );
    }

    const db = supabaseAdmin();

    const slug = await createUniqueSlug(
      db,
      String(body.name || ""),
    );

    const { data: campaign, error } =
      await db
        .from("campaign_settings")
        .insert({
          name: String(
            body.name || "",
          ).trim(),

          ticket_price: Number(
            body.ticket_price,
          ),

          max_tickets: Number(
            body.max_tickets,
          ),

          goal_amount: Number(
            body.goal_amount,
          ),

          organization_name: String(
            body.organization_name || "",
          ).trim(),

          team_name:
            String(
              body.team_name || "",
            ).trim() || null,

          purpose_text:
            String(
              body.purpose_text || "",
            ).trim() || null,

          start_date:
            body.start_date || null,

          end_date:
            body.end_date || null,

          status: body.status,

          slug,
          archived_at: null,
          updated_at:
            new Date().toISOString(),
        })
        .select("*")
        .single();

    if (error || !campaign) {
      return NextResponse.json(
        {
          error:
            error?.message ||
            "Kunne ikke opprette kampanjen.",
        },
        { status: 500 },
      );
    }

    const metrics = await getMetrics(
      db,
      campaign,
    );

    return NextResponse.json(
      {
        ok: true,
        campaign,
        metrics,
      },
      { status: 201 },
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Kunne ikke opprette kampanjen.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Ikke autorisert" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const id = body?.id;

    if (!id) {
      return NextResponse.json(
        { error: "Mangler kampanje-ID." },
        { status: 400 },
      );
    }

    const validationError =
      validateCampaign(body);

    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 },
      );
    }

    const db = supabaseAdmin();

    const slug = await createUniqueSlug(
      db,
      String(body.name || ""),
      id,
    );

    const { data: campaign, error } =
      await db
        .from("campaign_settings")
        .update({
          name: String(
            body.name || "",
          ).trim(),

          ticket_price: Number(
            body.ticket_price,
          ),

          max_tickets: Number(
            body.max_tickets,
          ),

          goal_amount: Number(
            body.goal_amount,
          ),

          organization_name: String(
            body.organization_name || "",
          ).trim(),

          team_name:
            String(
              body.team_name || "",
            ).trim() || null,

          purpose_text:
            String(
              body.purpose_text || "",
            ).trim() || null,

          start_date:
            body.start_date || null,

          end_date:
            body.end_date || null,

          status: body.status,

          slug,

          updated_at:
            new Date().toISOString(),
        })
        .eq("id", id)
        .is("archived_at", null)
        .select("*")
        .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    if (!campaign) {
      return NextResponse.json(
        { error: "Fant ikke kampanjen." },
        { status: 404 },
      );
    }

    const metrics = await getMetrics(
      db,
      campaign,
    );

    return NextResponse.json({
      ok: true,
      campaign,
      metrics,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Kunne ikke lagre kampanjen.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Ikke autorisert" },
      { status: 401 },
    );
  }

  try {
    const id =
      new URL(request.url).searchParams.get(
        "id",
      );

    if (!id) {
      return NextResponse.json(
        { error: "Mangler kampanje-ID." },
        { status: 400 },
      );
    }

    const db = supabaseAdmin();

    const { count, error: countError } =
      await db
        .from("orders")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("campaign_id", id);

    if (countError) {
      return NextResponse.json(
        { error: countError.message },
        { status: 500 },
      );
    }

    if (Number(count || 0) > 0) {
      const { error } = await db
        .from("campaign_settings")
        .update({
          archived_at:
            new Date().toISOString(),
          status: "ended",
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        archived: true,
      });
    }

    const { error } = await db
      .from("campaign_settings")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      deleted: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Kunne ikke slette kampanjen.",
      },
      { status: 500 },
    );
  }
}