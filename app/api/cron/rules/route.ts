import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { runRulesForWorkspace } from "@/lib/rules";
import { cronAllowed } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

// Corre as regras automáticas de todas as workspaces (chamado a cada 15 min)
export async function GET(req: NextRequest) {
  if (!(await cronAllowed(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const db = admin();
  const { data: wsIds } = await db.from("rules").select("workspace_id").eq("active", true);
  const ids = [...new Set((wsIds || []).map((r: any) => r.workspace_id))];
  const out: any[] = [];
  for (const id of ids) {
    const { data: ws } = await db.from("workspaces").select("*").eq("id", id).single();
    if (!ws?.meta_access_token) continue;
    try { out.push({ ws: ws.name, actions: await runRulesForWorkspace(ws) }); }
    catch (e: any) { out.push({ ws: ws.name, error: e?.message }); }
  }
  return NextResponse.json({ ok: true, out });
}
