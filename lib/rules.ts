// Regras automáticas: avalia métricas por campanha/conjunto/anúncio e age no Meta.
import { admin } from "./supabase/admin";
import { aggregate, costsFrom, fmt, METRICS, Row } from "./metrics";
import { setStatus, setDailyBudget, syncWorkspace } from "./meta";
import { sendTelegram } from "./integrations";
import { addDays, startOfDayIso, todayIn } from "./dates";

export const RULE_METRICS = ["spend", "sales", "revenue", "profit", "roas", "roi", "cpa", "ctr", "cpm", "cpc", "ic", "cost_ic", "lpv", "link_clicks", "pending"] as const;
export const OPS: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=" };
export const WINDOWS: Record<string, string> = { today: "Hoje", yesterday: "Ontem", last_3d: "Últimos 3 dias", last_7d: "Últimos 7 dias" };
export const ACTIONS: Record<string, string> = {
  pause: "Pausar", activate: "Ativar", budget_up: "Aumentar orçamento (%)", budget_down: "Diminuir orçamento (%)",
  budget_set: "Definir orçamento diário", notify: "Só avisar no Telegram"
};
export const LEVELS: Record<string, string> = { campaign: "Campanhas", adset: "Conjuntos", ad: "Anúncios" };

export function windowRange(w: string, tz: string) {
  const t = todayIn(tz);
  let from = t, to = t;
  if (w === "yesterday") from = to = addDays(t, -1);
  else if (w === "last_3d") from = addDays(t, -2);
  else if (w === "last_7d") from = addDays(t, -6);
  return { from, to, startIso: startOfDayIso(from, tz), endIso: startOfDayIso(addDays(to, 1), tz) };
}

function test(v: number, op: string, x: number) {
  switch (op) {
    case "gt": return v > x; case "gte": return v >= x; case "lt": return v < x; case "lte": return v <= x; case "eq": return v === x;
  }
  return false;
}

export function describeRule(r: any, currency: string) {
  const conds = (r.conditions || []).map((c: any) => {
    const m = METRICS[c.metric];
    const val = m?.fmt === "pct" ? `${c.value}%` : m?.fmt === "money" ? fmt(Number(c.value), "money", currency) : c.value;
    return `${m?.label || c.metric} ${OPS[c.op] || c.op} ${val}`;
  }).join(" e ");
  const act = r.action === "budget_set" ? `definir orçamento em ${fmt(Number(r.action_value), "money", currency)}`
    : r.action === "budget_up" ? `aumentar orçamento em ${r.action_value}%`
    : r.action === "budget_down" ? `diminuir orçamento em ${r.action_value}%`
    : ACTIONS[r.action]?.toLowerCase();
  return `Se ${conds} (${WINDOWS[r.time_window]?.toLowerCase()}) → ${act}`;
}

// valor da condição: % é guardado como número inteiro (ex: 1.5 = 1,5%)
const condValue = (metric: string, v: number) => (METRICS[metric]?.fmt === "pct" ? v / 100 : v);

export async function runRulesForWorkspace(ws: any, opts: { onlyRuleId?: string; forceDry?: boolean } = {}) {
  const db = admin();
  let q = db.from("rules").select("*").eq("workspace_id", ws.id);
  q = opts.onlyRuleId ? q.eq("id", opts.onlyRuleId) : q.eq("active", true);
  const { data: rules } = await q;
  if (!rules?.length) return [];

  // dados frescos do Meta (só se a última sincronização tiver mais de 10 min)
  if (!ws.meta_last_sync_at || Date.now() - new Date(ws.meta_last_sync_at).getTime() > 10 * 60e3) {
    await syncWorkspace(ws, 1).catch(() => null);
  }
  const { data: ents } = await db.from("ad_entities").select("*").eq("workspace_id", ws.id);
  const { data: prods } = await db.from("product_costs").select("*").eq("workspace_id", ws.id);
  const costs = costsFrom(ws, prods);
  const results: any[] = [];

  for (const rule of rules) {
    const r = windowRange(rule.time_window, ws.timezone);
    const [{ data: sales }, { data: spend }] = await Promise.all([
      db.from("sales").select("status,amount,product_name,customer_email,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name")
        .eq("workspace_id", ws.id).gte("created_at", r.startIso).lt("created_at", r.endIso).limit(20000),
      db.from("ad_spend").select("*").eq("workspace_id", ws.id).gte("date", r.from).lte("date", r.to).limit(50000)
    ]);
    const rows = aggregate(rule.level, sales || [], spend || [], ents || [], costs, { includeIdle: true })
      .filter((x) => x.id && (ents || []).some((e: any) => e.id === x.id));

    const wantStatus = rule.action === "activate" ? "PAUSED" : "ACTIVE";
    const conds = (rule.conditions || []) as { metric: string; op: string; value: number }[];
    const dry = rule.dry_run || opts.forceDry;
    const hits = rows.filter((x) => x.status === wantStatus && conds.length && conds.every((c) => test((x as any)[c.metric] ?? 0, c.op, condValue(c.metric, Number(c.value)))));

    // cooldown: não repetir a ação na mesma entidade dentro de N horas
    const since = new Date(Date.now() - (rule.cooldown_hours || 0) * 3600e3).toISOString();
    const { data: recent } = await db.from("rule_logs").select("entity_id").eq("rule_id", rule.id).eq("ok", true).eq("dry_run", false).gte("created_at", since);
    const cooled = new Set((recent || []).map((x: any) => x.entity_id));

    for (const x of hits) {
      if (!dry && cooled.has(x.id)) continue;
      let detail = describeRule(rule, ws.currency);
      let ok = true;
      try {
        if (!dry) detail = (await act(ws, rule, x, ents || [])) || detail;
        else detail = "[simulação] " + detail;
      } catch (e: any) { ok = false; detail = `Erro: ${e?.message || e}`; }
      await db.from("rule_logs").insert({ workspace_id: ws.id, rule_id: rule.id, entity_id: x.id, entity_name: x.name, action: rule.action, detail, ok, dry_run: !!dry });
      if (rule.notify && ok) {
        await sendTelegram(ws, `⚙️ <b>Regra:</b> ${esc(rule.name)}${dry ? " (simulação)" : ""}\n${esc(x.name)}\n${esc(detail)}\nGasto ${fmt(x.spend, "money", ws.currency)} · Vendas ${x.sales} · ROAS ${x.roas.toFixed(2)}`).catch(() => null);
      }
      results.push({ rule: rule.name, entity: x.name, ok, detail });
    }
    await db.from("rules").update({ last_run_at: new Date().toISOString() }).eq("id", rule.id);
  }
  return results;
}

const esc = (s: string) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

async function act(ws: any, rule: any, x: Row, ents: any[]) {
  if (rule.action === "pause") { await setStatus(ws, x.id!, "PAUSED"); return `Pausado: ${describeRule(rule, ws.currency)}`; }
  if (rule.action === "activate") { await setStatus(ws, x.id!, "ACTIVE"); return `Ativado: ${describeRule(rule, ws.currency)}`; }
  if (rule.action === "notify") return describeRule(rule, ws.currency);
  // orçamento: no próprio objeto ou, se for conjunto sem orçamento, na campanha (CBO)
  let target = ents.find((e) => e.id === x.id);
  if (target && !target.daily_budget && target.level === "adset") target = ents.find((e) => e.id === target.campaign_id);
  if (!target?.daily_budget) throw new Error("sem orçamento diário para alterar");
  const cur = Number(target.daily_budget);
  const v = Number(rule.action_value) || 0;
  const next = rule.action === "budget_set" ? v : rule.action === "budget_up" ? cur * (1 + v / 100) : cur * (1 - v / 100);
  await setDailyBudget(ws, target.id, Math.max(1, Math.round(next * 100) / 100));
  return `Orçamento ${fmt(cur, "money", ws.currency)} → ${fmt(next, "money", ws.currency)}${target.id !== x.id ? " (na campanha)" : ""}`;
}
