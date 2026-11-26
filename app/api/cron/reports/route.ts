import { NextRequest, NextResponse } from "next/server";
import { cronAllowed } from "@/lib/cron";
import { runReports } from "@/lib/reports";

export const runtime = "nodejs";
export const maxDuration = 60;

// Envia os relatórios das 08h/12h/18h/23h (chamado a cada hora)
export async function GET(req: NextRequest) {
  if (!(await cronAllowed(req))) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, out: await runReports() });
}
