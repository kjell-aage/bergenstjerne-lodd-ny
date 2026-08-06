import LotteryClient from "@/components/LotteryClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = supabaseAdmin();
  const { data } = await db.from("prizes").select("id,name,image_url,quantity_remaining,description,value_nok,is_consolation").eq("active", true).order("sort_order");
  return <LotteryClient initialPrizes={data || []} />;
}
