import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getWorkspaceByToken, ingestSale, logWebhook, updateByPaymentRef } from "@/lib/ingest";
import { NormalizedSale, findClickId, normalizeMethod } from "@/lib/normalize";

export const runtime = "nodejs";

const ZERO_DECIMAL = new Set(["bif","clp","djf","gnf","jpy","kmf","krw","mga","pyg","rwf","ugx","vnd","vuv","xaf","xof","xpf"]);
const amt = (v: number, cur: string) => (ZERO_DECIMAL.has((cur || "").toLowerCase()) ? v : v / 100);

function verify(raw: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"];
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const ws = await getWorkspaceByToken(token);
  if (!ws) return NextResponse.json({ ok: false }, { status: 404 });

  const raw = await req.text();
  if (ws.stripe_webhook_secret && !verify(raw, req.headers.get("stripe-signature"), ws.stripe_webhook_secret)) {
    await logWebhook(ws.id, "stripe", { raw: raw.slice(0, 2000) }, "erro: assinatura inválida");
    return NextResponse.json({ ok: false, error: "assinatura inválida" }, { status: 400 });
  }
  const evt = JSON.parse(raw);
  const o = evt?.data?.object || {};
  let result = "ignorado";

  try {
    switch (evt.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed": {
        const status = evt.type.endsWith("failed") ? "canceled"
          : (o.payment_status === "paid" || o.payment_status === "no_payment_required") ? "approved" : "pending";
        const sale: NormalizedSale = {
          external_id: o.payment_intent || o.subscription || o.id,
          payment_ref: o.payment_intent || null,
          status,
          amount: amt(o.amount_total || 0, o.currency),
          currency: (o.currency || "").toUpperCase(),
          product_name: o.metadata?.product_name || null,
          customer_email: o.customer_details?.email?.toLowerCase() || o.customer_email || null,
          customer_name: o.customer_details?.name || null,
          customer_phone: o.customer_details?.phone || null,
          payment_method: normalizeMethod(o.payment_method_types?.[0] || "card")
        };
        const r = await ingestSale(ws, "stripe", sale, o);
        result = `ok: ${r.status}${r.tracked ? " · rastreada" : " · sem UTM"}`;
        break;
      }
      case "payment_intent.succeeded": {
        // Pagamentos sem Checkout Session (Elements/API): só conta se o metadata tiver o utmcai_cid.
        // Pagamentos feitos via Checkout Session já entram pelo evento checkout.session.completed.
        if (!findClickId(o.metadata || {})) { result = "ignorado: sem utmcai_cid no metadata"; break; }
        const sale: NormalizedSale = {
          external_id: o.id, payment_ref: o.id, status: "approved",
          amount: amt(o.amount_received || o.amount || 0, o.currency),
          currency: (o.currency || "").toUpperCase(),
          product_name: o.metadata?.product_name || o.description || null,
          customer_email: o.receipt_email?.toLowerCase() || null,
          payment_method: normalizeMethod(o.payment_method_types?.[0] || "card")
        };
        const r = await ingestSale(ws, "stripe", sale, o);
        result = `ok: ${r.status}${r.tracked ? " · rastreada" : " · sem UTM"}`;
        break;
      }
      case "charge.refunded": {
        if (o.refunded && o.payment_intent) result = `reembolso: ${await updateByPaymentRef(ws, "stripe", o.payment_intent, "refunded")} venda(s)`;
        else result = "reembolso parcial ignorado";
        break;
      }
      case "charge.dispute.created": {
        if (o.payment_intent) result = `chargeback: ${await updateByPaymentRef(ws, "stripe", o.payment_intent, "chargeback")} venda(s)`;
        break;
      }
    }
    await logWebhook(ws.id, "stripe", { type: evt.type, object: o }, result);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    await logWebhook(ws.id, "stripe", { type: evt.type, object: o }, `erro: ${e?.message}`);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
