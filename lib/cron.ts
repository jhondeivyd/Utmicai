import { NextRequest } from "next/server";
import { admin } from "./supabase/admin";

// Aceita o CRON_SECRET (Vercel) ou o token interno guardado no banco (agendador do Supabase)
export async function cronAllowed(req: NextRequest) {
  const env = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const q = req.nextUrl.searchParams.get("secret");
  if (env && (auth === `Bearer ${env}` || q === env)) return true;
  if (!q) return false;
  const { data } = await admin().from("app_settings").select("value").eq("key", "cron_token").maybeSingle();
  return !!data?.value && data.value === q;
}
