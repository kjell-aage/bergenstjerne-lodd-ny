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
    const {
      name,
      phone,
      count,
      amount,
      packageType,
      campaignId,
    } = await req.json();

    const cleanPhone = String(phone || "").replace(/\D/g, "");

    if (
      !name ||
      cleanPhone.length !== 8 ||
      !Number.isInteger(count) ||
      count < 1 ||
      !Number.isInteger(amount) ||
      amount < 1
    ) {
      return NextResponse.json(
        { error: "Ugyldig bestilling." },
        { status: 400 },
      );
    }

    const db = supabaseAdmin();

    let campaignQuery = db
      .from("campaign_settings")
      .select("*")
      .is("archived_at", null);

    if (campaignId) {
      campaignQuery = campaignQuery.eq("id", campaignId);
    } else {
      campaignQuery = campaignQuery.eq("status", "active");
    }

    const { data: campaigns, error: campaignError } =
      await campaignQuery.order("created_at", {
        ascending: false,
      });

    if (campaignError) {
      throw new Error(
        `Kunne ikke hente kampanje: ${campaignError.message}`,
      );
    }

    const campaign = campaigns?.[0];

    if (!campaign) {
      return NextResponse.json(
        { error: "Fant ingen aktiv kampanje." },
        { status: 400 },
      );
    }

    const ticketPrice = Number(campaign.ticket_price || 0);

    if (!Number.isFinite(ticketPrice) || ticketPrice <= 0) {
      return NextResponse.json(
        { error: "Kampanjen har ugyldig loddpris." },
        { status: 400 },
      );
    }

    const expectedAmount =
      packageType === "grass"
        ? 75
        : count * ticketPrice;

    const validAmount =
      packageType === "grass"
        ? count === 5 && amount === 75
        : amount === expectedAmount;

    if (!validAmount) {
      return NextResponse.json(
        { error: "Ugyldig bestilling." },
        { status: 400 },
      );
    }

    const reference = `BST-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const idempotencyKey = randomUUID();

    const { error: orderError } = await db
      .from("orders")
      .insert({
        reference,
        customer_name: String(name).trim(),
        phone: cleanPhone,
        ticket_count: count,
        amount_ore: amount * 100,
        status: "PENDING",
        package_type: packageType || "regular",
        campaign_id: campaign.id,
      });

    if (orderError) {
      throw new Error(
        `Kunne ikke opprette ordre: ${orderError.message}`,
      );
    }

    const token = await getVippsToken();

    const site =
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://lodd.bergensi.no";

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

          paymentDescription:
            packageType === "grass"
              ? `Grasrotpakken – ${campaign.name}`
              : `${count} lodd – ${campaign.name}`,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      await db
        .from("orders")
        .update({
          status: "VIPPS_CREATE_FAILED",
        })
        .eq("reference", reference);

      throw new Error(
        `Vipps create payment error: ${response.status} ${JSON.stringify(
          data,
        )}`,
      );
    }

    if (!data.redirectUrl) {
      throw new Error(
        "Vipps returnerte ingen redirectUrl.",
      );
    }

    return NextResponse.json({
      redirectUrl: data.redirectUrl,
      reference,
      campaignId: campaign.id,
    });
  } catch (error) {
    console.error("VIPPS CREATE ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kunne ikke opprette Vipps-betaling.",
      },
      { status: 500 },
    );
  }
}