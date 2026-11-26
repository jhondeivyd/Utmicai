import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { syncWorkspaceSpend } from "@/lib/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

// Chamado pelo cron da Vercel (Authorization: Bearer CRON_SECRET)
// ou por um serviço externo: /api/cron/meta-sync?secret=CRON_SECRET&days=3
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const q = req.nextUrl.searchParams;
  if (!secret || (auth !== `Bearer ${secret}` && q.get("secret") !== secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const days = Math.min(Math.max(Number(q.get("days")) || 3, 1), 90);
  const { data: list } = await admin().from("workspaces").select("*").not("meta_access_token", "is", null);
  const results: any[] = [];
  for (const ws of list || []) results.push({ ws: ws.name, ...(await syncWorkspaceSpend(ws, days)) });
  return NextResponse.json({ ok: true, results });
}
