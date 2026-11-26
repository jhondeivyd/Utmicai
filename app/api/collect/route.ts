import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const CID = /^uc[a-z0-9]{18}$/;
const s = (v: any, max = 500) => (typeof v === "string" && v ? v.slice(0, max) : null);

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }

// Recebe o clique enviado pelo utmcai.js (sendBeacon, text/plain)
export async function POST(req: NextRequest) {
  let b: any;
  try { b = JSON.parse(await req.text()); } catch { return NextResponse.json({ ok: false }, { status: 400, headers: cors }); }
  if (!b?.k || !CID.test(b?.cid || "")) return NextResponse.json({ ok: false }, { status: 400, headers: cors });

  const db = admin();
  const { data: ws } = await db.from("workspaces").select("id").eq("public_key", b.k).maybeSingle();
  if (!ws) return NextResponse.json({ ok: false }, { status: 404, headers: cors });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip");
  const { data: existing } = await db.from("clicks").select("id, workspace_id").eq("id", b.cid).maybeSingle();

  if (existing) {
    if (existing.workspace_id !== ws.id) return NextResponse.json({ ok: false }, { status: 409, headers: cors });
    // visita repetida do mesmo clique: só completa fbp/fbc
    const upd: any = {};
    if (s(b.fbp)) upd.fbp = s(b.fbp);
    if (s(b.fbc)) upd.fbc = s(b.fbc);
    if (Object.keys(upd).length) await db.from("clicks").update(upd).eq("id", b.cid);
  } else {
    await db.from("clicks").insert({
      id: b.cid, workspace_id: ws.id,
      utm_source: s(b.utm_source), utm_medium: s(b.utm_medium), utm_campaign: s(b.utm_campaign),
      utm_content: s(b.utm_content), utm_term: s(b.utm_term), utm_id: s(b.utm_id),
      fbclid: s(b.fbclid), fbc: s(b.fbc), fbp: s(b.fbp),
      ip, user_agent: s(req.headers.get("user-agent")), landing_url: s(b.url, 1000), referrer: s(b.ref, 1000)
    });
  }
  return NextResponse.json({ ok: true }, { headers: cors });
}
