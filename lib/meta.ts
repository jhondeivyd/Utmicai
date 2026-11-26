// Meta Marketing API: leitura (gasto, campanhas) e gestão (status, orçamento, duplicar).
import { admin } from "./supabase/admin";

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;

// moedas sem casas decimais na API do Meta
const ZERO_DEC = new Set(["JPY", "KRW", "CLP", "PYG", "VND", "ISK", "HUF", "TWD", "COP", "IDR"]);
export const accountIds = (ws: any): string[] =>
  String(ws.meta_ad_account_ids || "").split(/[,\s]+/).filter(Boolean).map((a) => (a.startsWith("act_") ? a : `act_${a}`));

async function graphGet(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j?.error?.error_user_msg || j?.error?.message || `Meta ${r.status}`);
  return j;
}

async function graphAll(path: string, params: Record<string, string>, token: string) {
  let url: string | null = `${GRAPH()}/${path}?${new URLSearchParams({ ...params, access_token: token })}`;
  const out: any[] = [];
  let guard = 0;
  while (url && guard++ < 60) {
    const j = await graphGet(url);
    out.push(...(j.data || []));
    url = j.paging?.next || null;
  }
  return out;
}

async function graphPost(path: string, body: Record<string, any>, token: string) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) form.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  form.set("access_token", token);
  const r = await fetch(`${GRAPH()}/${path}`, { method: "POST", body: form });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j?.error?.error_user_msg || j?.error?.message || `Meta ${r.status}`);
  return j;
}

// ---------- gasto diário por anúncio ----------
const actionVal = (arr: any[] | undefined, types: string[]) =>
  (arr || []).filter((a) => types.includes(a.action_type)).reduce((s, a) => s + Number(a.value || 0), 0);

export async function fetchInsights(token: string, act: string, since: string, until: string) {
  const rows = await graphAll(`${act}/insights`, {
    level: "ad",
    fields: "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,inline_link_clicks,actions",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    limit: "500"
  }, token);
  return rows.map((x) => ({
    date: x.date_start, account_id: act,
    campaign_id: x.campaign_id, campaign_name: x.campaign_name,
    adset_id: x.adset_id, adset_name: x.adset_name,
    ad_id: x.ad_id, ad_name: x.ad_name,
    spend: Number(x.spend) || 0,
    impressions: Number(x.impressions) || 0,
    clicks: Number(x.clicks) || 0,
    link_clicks: Number(x.inline_link_clicks) || 0,
    lpv: actionVal(x.actions, ["landing_page_view", "omni_landing_page_view"]),
    ic: actionVal(x.actions, ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "omni_initiated_checkout"]),
    meta_purchases: actionVal(x.actions, ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"])
  }));
}

// ---------- campanhas / conjuntos / anúncios ----------
export async function fetchEntities(token: string, act: string, currency: string) {
  const div = ZERO_DEC.has((currency || "").toUpperCase()) ? 1 : 100;
  const money = (v: any) => (v === undefined || v === null || v === "" ? null : Number(v) / div);
  const [camps, sets, ads] = await Promise.all([
    graphAll(`${act}/campaigns`, { fields: "id,name,status,effective_status,daily_budget,lifetime_budget", limit: "500" }, token),
    graphAll(`${act}/adsets`, { fields: "id,name,status,effective_status,daily_budget,lifetime_budget,bid_amount,campaign_id", limit: "500" }, token),
    graphAll(`${act}/ads`, { fields: "id,name,status,effective_status,adset_id,campaign_id", limit: "500" }, token)
  ]);
  const base = (x: any, level: string) => ({
    id: x.id, level, account_id: act, name: x.name, status: x.status, effective_status: x.effective_status,
    campaign_id: level === "campaign" ? x.id : x.campaign_id || null,
    adset_id: level === "ad" ? x.adset_id : level === "adset" ? x.id : null,
    daily_budget: money(x.daily_budget), lifetime_budget: money(x.lifetime_budget), bid_amount: money(x.bid_amount)
  });
  return [...camps.map((x) => base(x, "campaign")), ...sets.map((x) => base(x, "adset")), ...ads.map((x) => base(x, "ad"))];
}

function ymd(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// Sincroniza gasto (N dias) + estrutura de campanhas de uma workspace
export async function syncWorkspace(ws: any, days = 3) {
  if (!ws.meta_access_token || !ws.meta_ad_account_ids) return { ok: false, msg: "Meta não configurado" };
  const db = admin();
  const until = ymd(new Date(), ws.timezone || "America/Sao_Paulo");
  const since = ymd(new Date(Date.now() - (days - 1) * 864e5), ws.timezone || "America/Sao_Paulo");
  let nIns = 0, nEnt = 0;
  const errors: string[] = [];
  for (const act of accountIds(ws)) {
    try {
      const [ins, ents] = await Promise.all([
        fetchInsights(ws.meta_access_token, act, since, until),
        fetchEntities(ws.meta_access_token, act, ws.currency)
      ]);
      const now = new Date().toISOString();
      for (let i = 0; i < ins.length; i += 500) {
        const { error } = await db.from("ad_spend").upsert(
          ins.slice(i, i + 500).map((r) => ({ ...r, workspace_id: ws.id, updated_at: now })),
          { onConflict: "workspace_id,date,ad_id" });
        if (error) throw new Error(error.message);
      }
      for (let i = 0; i < ents.length; i += 500) {
        const { error } = await db.from("ad_entities").upsert(
          ents.slice(i, i + 500).map((r) => ({ ...r, workspace_id: ws.id, updated_at: now })),
          { onConflict: "workspace_id,id" });
        if (error) throw new Error(error.message);
      }
      nIns += ins.length; nEnt += ents.length;
    } catch (e: any) {
      errors.push(`${act}: ${e?.message || e}`);
    }
  }
  await db.from("workspaces").update({ meta_last_sync_at: new Date().toISOString() }).eq("id", ws.id);
  return { ok: !errors.length, msg: errors.length ? errors.join(" · ") : `${nEnt} campanhas/conjuntos/anúncios e ${nIns} linhas de gasto sincronizadas` };
}

// ---------- ações ----------
export async function setStatus(ws: any, id: string, status: "ACTIVE" | "PAUSED") {
  await graphPost(id, { status }, ws.meta_access_token);
  await admin().from("ad_entities").update({ status, effective_status: status, updated_at: new Date().toISOString() })
    .eq("workspace_id", ws.id).eq("id", id);
}

export async function setDailyBudget(ws: any, id: string, value: number) {
  if (!(value > 0)) throw new Error("Orçamento inválido");
  const mult = ZERO_DEC.has((ws.currency || "").toUpperCase()) ? 1 : 100;
  await graphPost(id, { daily_budget: Math.round(value * mult) }, ws.meta_access_token);
  await admin().from("ad_entities").update({ daily_budget: Math.round(value * 100) / 100, updated_at: new Date().toISOString() })
    .eq("workspace_id", ws.id).eq("id", id);
}

export async function duplicate(ws: any, id: string, level: string) {
  const body: any = { status_option: "PAUSED" };
  if (level !== "ad") body.deep_copy = true;
  const r = await graphPost(`${id}/copies`, body, ws.meta_access_token);
  return r.copied_campaign_id || r.copied_adset_id || r.copied_ad_id || r.ad_object_ids?.[0]?.copied_id || null;
}
