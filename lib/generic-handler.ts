import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceByToken, ingestSale, logWebhook } from "./ingest";
import { normalizeGeneric } from "./normalize";

export async function handleGeneric(req: NextRequest, token: string, provider: string) {
  const ws = await getWorkspaceByToken(token);
  if (!ws) return NextResponse.json({ ok: false, error: "token inválido" }, { status: 404 });

  const raw = await req.text();
  let payload: any;
  try { payload = JSON.parse(raw); }
  catch { payload = Object.fromEntries(new URLSearchParams(raw)); } // form-urlencoded

  const sale = normalizeGeneric(payload, ws.generic_mapping);
  if (!sale) {
    await logWebhook(ws.id, provider, payload, "ignorado: sem id da venda");
    return NextResponse.json({ ok: true, ignored: true });
  }
  try {
    const r = await ingestSale(ws, provider, sale, payload);
    await logWebhook(ws.id, provider, payload, `ok: ${r.status}${r.tracked ? " · rastreada" : " · sem UTM"}`);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    await logWebhook(ws.id, provider, payload, `erro: ${e?.message}`);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

