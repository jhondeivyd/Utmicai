import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { syncWorkspace } from "@/lib/meta";
import { cronAllowed } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

// Sincroniza gasto + campanhas de todas as workspaces com Meta configurado
export async function GET(req: NextRequest) {
  if (!(await cronAllowed(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days")) || 3, 1), 90);
  const { data: list } = await admin().from("workspaces").select("*").not("meta_access_token", "is", null);
  const results: any[] = [];
  for (const ws of list || []) results.push({ ws: ws.name, ...(await syncWorkspace(ws, days)) });
  return NextResponse.json({ ok: true, results });
}
