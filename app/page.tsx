import LotteryClient from "@/components/LotteryClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = supabaseAdmin();

  const { data: campaign, error: campaignError } = await db
    .from("campaign_settings")
    .select("id,name,ticket_price")
    .eq("status", "active")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (campaignError) {
    throw new Error(
      `Kunne ikke hente aktiv kampanje: ${campaignError.message}`
    );
  }

  const { data: prizes, error: prizeError } = await db
    .from("prizes")
    .select(
      "id,name,image_url,quantity_remaining,description,value_nok,is_consolation"
    )
    .eq("active", true)
    .order("sort_order");

  if (prizeError) {
    throw new Error(
      `Kunne ikke hente premier: ${prizeError.message}`
    );
  }

  return (
    <LotteryClient
      initialPrizes={prizes || []}
      campaignId={campaign?.id || ""}
      ticketPrice={Number(campaign?.ticket_price || 25)}
    />
  );
}