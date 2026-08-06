import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Ikke tilgang." }, { status: 401 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Mangler fil." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Kun bildefiler er tillatt." }, { status: 400 });
  if (file.size > 5_000_000) return NextResponse.json({ error: "Maks 5 MB." }, { status: 400 });

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${randomUUID()}.${ext}`;
  const db = supabaseAdmin();
  const { error } = await db.storage.from("prize-images").upload(path, file, { contentType: file.type });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data } = db.storage.from("prize-images").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
