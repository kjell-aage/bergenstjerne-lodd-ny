import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  const password = req.headers.get("x-admin-password");

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }

  const db = supabaseAdmin();

  const { data, error } = await db
    .from("tickets")
    .select(`
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}