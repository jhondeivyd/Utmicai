import { admin } from "./supabase/admin";
import { NormalizedSale, Utms, findClickId, findUtms, utmToAd } from "./normalize";
import { saleMessage, sendCapiPurchase, sendTelegram, fetchMetaSpend } from "./integrations";

export async function getWorkspaceByToken(token: string) {
  const db = admin();
  const { data } = await db.from("workspaces").select("*").eq("webhook_token", token).maybeSingle();
  return data;
}

export async function logWebhook(wsId: string | null, provider: string, payload: any, result: string) {
  try {
    await admin().from("webhook_logs").insert({ workspace_id: wsId, provider, payload, result });
  } catch {}
}

const RANK: Record<string, number> = { pending: 0, canceled: 1, approved: 2, refunded: 3, chargeback: 4 };

// Guarda/atualiza a venda, associa ao clique, envia CAPI e Telegram.
export async function ingestSale(ws: any, provider: string, sale: NormalizedSale, rawPayload: any) {
  const db = admin();

  // 1. clique (cid) → UTMs + dados do visitante
  const cid = findClickId(rawPayload);
  let click: any = null;
  if (cid) {
    const { data } = await db.from("clicks").select("*").eq("id", cid).eq("workspace_id", ws.id).maybeSingle();
    click = data;
  }
  let utms: Utms = click
    ? { utm_source: click.utm_source, utm_medium: click.utm_medium, utm_campaign: click.utm_campaign,
        utm_content: click.utm_content, utm_term: click.utm_term }
    : {};
  if (!utms.utm_source && !utms.utm_campaign) utms = findUtms(rawPayload); // fallback: UTMs no próprio payload

  // 2. venda existente → merge sem apagar dados nem "voltar" status
  const { data: existing } = await db.from("sales").select("*")
    .eq("workspace_id", ws.id).eq("provider", provider).eq("external_id", sale.external_id).maybeSingle();

  let status = sale.status;
  if (existing && RANK[existing.status] > RANK[status] && !(existing.status === "canceled" && status === "approved")) {
    status = existing.status;
  }

  const row: any = { workspace_id: ws.id, provider, external_id: sale.external_id, status, updated_at: new Date().toISOString() };
  const fields: any = {
    payment_ref: sale.payment_ref, amount: sale.amount || null, currency: sale.currency || ws.currency,
    product_name: sale.product_name, customer_email: sale.customer_email, customer_name: sale.customer_name,
    customer_phone: sale.customer_phone, customer_ip: sale.customer_ip,
    click_id: click?.id || null, ...utms, ...(utms.utm_source || utms.utm_campaign ? utmToAd(utms) : {})
  };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined && v !== "") row[k] = v;
    else if (!existing) row[k] = k === "amount" ? 0 : null;
  }
  if (status === "approved" && !existing?.approved_at) row.approved_at = sale.approved_at || new Date().toISOString();

  const { data: saved, error } = await db.from("sales")
    .upsert(row, { onConflict: "workspace_id,provider,external_id" }).select("*").single();
  if (error) throw new Error(error.message);

  // 3. ações só uma vez por venda aprovada
  if (saved.status === "approved") {
    if (!saved.capi_sent_at && ws.pixel_id && ws.capi_token) {
      const err = await sendCapiPurchase(ws, saved, click);
      await db.from("sales").update(err ? { capi_error: err } : { capi_sent_at: new Date().toISOString(), capi_error: null })
        .eq("id", saved.id);
    }
    if (!saved.notified_at && ws.telegram_bot_token && ws.telegram_chat_id) {
      const err = await sendTelegram(ws, saleMessage(ws, saved));
      if (!err) await db.from("sales").update({ notified_at: new Date().toISOString() }).eq("id", saved.id);
    }
  }
  return { id: saved.id, status: saved.status, tracked: !!(saved.utm_source || saved.utm_campaign), click: !!click };
}

// Atualiza status de uma venda já existente pela referência de pagamento (reembolsos, chargebacks)
export async function updateByPaymentRef(ws: any, provider: string, ref: string, status: "refunded" | "chargeback") {
  const { data, error } = await admin().from("sales").update({ status, updated_at: new Date().toISOString() })
    .eq("workspace_id", ws.id).eq("provider", provider).eq("payment_ref", ref).select("id");
  if (error) throw new Error(error.message);
  return data?.length || 0;
}

// ---------- sincronização do gasto Meta ----------
function ymd(d: Date) { return d.toISOString().slice(0, 10); }

export async function syncWorkspaceSpend(ws: any, days = 3) {
  if (!ws.meta_access_token || !ws.meta_ad_account_ids) return { ok: false, msg: "Meta não configurado" };
  const until = new Date();
  const since = new Date(Date.now() - (days - 1) * 864e5);
  const db = admin();
  let total = 0;
  const errors: string[] = [];
  for (const acc of String(ws.meta_ad_account_ids).split(/[,\s]+/).filter(Boolean)) {
    try {
      const rows = await fetchMetaSpend(ws.meta_access_token, acc, ymd(since), ymd(until));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, workspace_id: ws.id, updated_at: new Date().toISOString() }));
        const { error } = await db.from("ad_spend").upsert(chunk, { onConflict: "workspace_id,date,ad_id" });
        if (error) throw new Error(error.message);
      }
      total += rows.length;
    } catch (e: any) {
      errors.push(`${acc}: ${e?.message || e}`);
    }
  }
  await db.from("workspaces").update({ meta_last_sync_at: new Date().toISOString() }).eq("id", ws.id);
  return { ok: errors.length === 0, msg: errors.length ? errors.join(" · ") : `${total} linhas sincronizadas` };
}
