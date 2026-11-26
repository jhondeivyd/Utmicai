// Motor de métricas: junta vendas (UtmCai) com gasto (Meta) e custos da operação.

export type Costs = { tax: number; fee: number; fixed: number; products: Record<string, number> };
export type Level = "campaign" | "adset" | "ad";

export type M = {
  spend: number; impressions: number; clicks: number; link_clicks: number; lpv: number; ic: number; meta_purchases: number;
  sales: number; revenue: number; pending: number; pending_amount: number; refunds: number; refund_amount: number; chargebacks: number;
  taxes: number; fees: number; product_costs: number; fixed_costs: number; customers: Set<string>;
};
export type Derived = M & {
  net: number; profit: number; roas: number; roi: number; margin: number; cpa: number; ticket: number; arpu: number;
  ctr: number; cpm: number; cpc: number; cost_ic: number; conv: number;
};

export const emptyM = (): M => ({
  spend: 0, impressions: 0, clicks: 0, link_clicks: 0, lpv: 0, ic: 0, meta_purchases: 0,
  sales: 0, revenue: 0, pending: 0, pending_amount: 0, refunds: 0, refund_amount: 0, chargebacks: 0,
  taxes: 0, fees: 0, product_costs: 0, fixed_costs: 0, customers: new Set()
});

export function costsFrom(ws: any, productRows: any[] | null): Costs {
  const products: Record<string, number> = {};
  for (const p of productRows || []) products[String(p.product_name).toLowerCase().trim()] = Number(p.cost) || 0;
  return { tax: Number(ws.tax_percent) || 0, fee: Number(ws.gateway_fee_percent) || 0, fixed: Number(ws.fixed_cost_per_sale) || 0, products };
}

export function addSpend(m: M, s: any) {
  m.spend += Number(s.spend) || 0;
  m.impressions += Number(s.impressions) || 0;
  m.clicks += Number(s.clicks) || 0;
  m.link_clicks += Number(s.link_clicks) || 0;
  m.lpv += Number(s.lpv) || 0;
  m.ic += Number(s.ic) || 0;
  m.meta_purchases += Number(s.meta_purchases) || 0;
}

export function addSale(m: M, s: any, c: Costs) {
  const amt = Number(s.amount) || 0;
  if (s.status === "approved") {
    m.sales++; m.revenue += amt;
    m.taxes += (amt * c.tax) / 100;
    m.fees += (amt * c.fee) / 100;
    m.fixed_costs += c.fixed;
    m.product_costs += c.products[String(s.product_name || "").toLowerCase().trim()] || 0;
    if (s.customer_email) m.customers.add(s.customer_email);
  } else if (s.status === "pending") { m.pending++; m.pending_amount += amt; }
  else if (s.status === "refunded") { m.refunds++; m.refund_amount += amt; }
  else if (s.status === "chargeback") { m.chargebacks++; m.refund_amount += amt; }
}

const div = (a: number, b: number) => (b ? a / b : 0);
export function derive(m: M): Derived {
  const net = m.revenue - m.taxes - m.fees;
  const profit = net - m.product_costs - m.fixed_costs - m.spend;
  return {
    ...m, net, profit,
    roas: div(m.revenue, m.spend),
    roi: div(profit, m.spend),
    margin: div(profit, m.revenue),
    cpa: div(m.spend, m.sales),
    ticket: div(m.revenue, m.sales),
    arpu: div(m.revenue, m.customers.size || m.sales),
    ctr: div(m.link_clicks || m.clicks, m.impressions),
    cpm: div(m.spend * 1000, m.impressions),
    cpc: div(m.spend, m.link_clicks || m.clicks),
    cost_ic: div(m.spend, m.ic),
    conv: div(m.sales, m.lpv || m.link_clicks)
  };
}

export function totals(sales: any[], spend: any[], c: Costs) {
  const m = emptyM();
  for (const s of spend) addSpend(m, s);
  for (const s of sales) addSale(m, s, c);
  return derive(m);
}

// ---------- agrupamento por campanha / conjunto / anúncio ----------
export type Row = Derived & {
  key: string; id: string | null; name: string; level: Level;
  status?: string | null; effective_status?: string | null; daily_budget?: number | null; lifetime_budget?: number | null;
  campaign_id?: string | null; adset_id?: string | null; budget_owner?: string | null;
};

export function aggregate(level: Level, sales: any[], spend: any[], entities: any[], c: Costs, opts: { parent?: string | null; includeIdle?: boolean } = {}) {
  const ents = new Map<string, any>();
  for (const e of entities) ents.set(e.id, e);
  const map = new Map<string, { m: M; id: string | null; name: string }>();
  const get = (id: string | null, name: string | null) => {
    const key = id || (name ? "n:" + name : "—");
    if (!map.has(key)) map.set(key, { m: emptyM(), id, name: name || (id ? `#${id}` : "Sem rastreio") });
    const r = map.get(key)!;
    if (name && r.name.startsWith("#")) r.name = name;
    return r;
  };
  const parentOk = (x: any) => !opts.parent || x.campaign_id === opts.parent || x.adset_id === opts.parent;

  for (const s of spend) if (parentOk(s)) addSpend(get(s[`${level}_id`], s[`${level}_name`]).m, s);
  for (const s of sales) if (parentOk(s)) addSale(get(s[`${level}_id`], s[`${level}_name`]).m, s, c);
  if (opts.includeIdle) for (const e of entities) if (e.level === level && parentOk(e)) get(e.id, e.name);

  // vendas que só têm nome (sem id) → junta à linha com o mesmo nome
  for (const [k, r] of map) {
    if (!k.startsWith("n:")) continue;
    const twin = [...map.values()].find((x) => x !== r && x.id && x.name === r.name);
    if (twin) {
      const a = twin.m, b = r.m;
      for (const f of ["sales", "revenue", "pending", "pending_amount", "refunds", "refund_amount", "chargebacks", "taxes", "fees", "product_costs", "fixed_costs"] as const) (a as any)[f] += (b as any)[f];
      b.customers.forEach((x) => a.customers.add(x));
      map.delete(k);
    }
  }

  const rows: Row[] = [];
  for (const [key, r] of map) {
    const e = r.id ? ents.get(r.id) : null;
    // orçamento: no conjunto (ABO) ou na campanha (CBO)
    let owner: string | null = null;
    if (e && (e.daily_budget || e.lifetime_budget)) owner = e.id;
    rows.push({
      ...derive(r.m), key, id: r.id, name: e?.name || r.name, level,
      status: e?.status ?? null, effective_status: e?.effective_status ?? null,
      daily_budget: e?.daily_budget ?? null, lifetime_budget: e?.lifetime_budget ?? null,
      campaign_id: e?.campaign_id ?? null, adset_id: e?.adset_id ?? null, budget_owner: owner
    });
  }
  return rows;
}

// ---------- séries ----------
function partsIn(tz: string, iso: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return { day: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) };
}

export function byDay(sales: any[], spend: any[], days: string[], tz: string) {
  const m = new Map(days.map((d) => [d, { day: d, revenue: 0, spend: 0, sales: 0 }]));
  for (const s of spend) { const r = m.get(s.date); if (r) r.spend += Number(s.spend) || 0; }
  for (const s of sales) if (s.status === "approved") {
    const r = m.get(partsIn(tz, s.created_at).day); if (r) { r.revenue += Number(s.amount) || 0; r.sales++; }
  }
  return [...m.values()];
}

export function byHour(sales: any[], tz: string) {
  const h = Array.from({ length: 24 }, (_, i) => ({ hour: i, sales: 0, revenue: 0 }));
  for (const s of sales) if (s.status === "approved") { const x = h[partsIn(tz, s.created_at).hour]; x.sales++; x.revenue += Number(s.amount) || 0; }
  return h;
}

const PLACEMENT_LABEL: Record<string, string> = {
  facebook_mobile_feed: "Facebook Feed", facebook_desktop_feed: "Facebook Feed (PC)", instagram_feed: "Instagram Feed",
  instagram_stories: "Instagram Stories", instagram_reels: "Instagram Reels", facebook_reels: "Facebook Reels",
  facebook_stories: "Facebook Stories", instagram_explore: "Instagram Explorar", facebook_marketplace: "Marketplace",
  audience_network_classic: "Audience Network", messenger_inbox: "Messenger", facebook_instream_video: "Vídeo in-stream",
  facebook_right_column: "Coluna direita", facebook_search: "Pesquisa Facebook", threads_feed: "Threads"
};
export const placementLabel = (p?: string | null) => (p ? PLACEMENT_LABEL[p.toLowerCase()] || p.replace(/_/g, " ") : "Sem posicionamento");

export function groupCount(sales: any[], keyFn: (s: any) => string) {
  const m = new Map<string, { label: string; sales: number; revenue: number }>();
  for (const s of sales) if (s.status === "approved") {
    const k = keyFn(s);
    if (!m.has(k)) m.set(k, { label: k, sales: 0, revenue: 0 });
    const r = m.get(k)!; r.sales++; r.revenue += Number(s.amount) || 0;
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue);
}

// ---------- métricas disponíveis (dashboard, tabelas e regras) ----------
export const METRICS: Record<string, { label: string; fmt: "money" | "int" | "x" | "pct" }> = {
  spend: { label: "Gasto", fmt: "money" },
  revenue: { label: "Faturamento", fmt: "money" },
  net: { label: "Receita líquida", fmt: "money" },
  profit: { label: "Lucro", fmt: "money" },
  roas: { label: "ROAS", fmt: "x" },
  roi: { label: "ROI", fmt: "pct" },
  margin: { label: "Margem", fmt: "pct" },
  sales: { label: "Vendas", fmt: "int" },
  cpa: { label: "CPA", fmt: "money" },
  ticket: { label: "Ticket médio", fmt: "money" },
  arpu: { label: "ARPU", fmt: "money" },
  pending: { label: "Vendas pendentes", fmt: "int" },
  refunds: { label: "Reembolsos", fmt: "int" },
  impressions: { label: "Impressões", fmt: "int" },
  link_clicks: { label: "Cliques no link", fmt: "int" },
  ctr: { label: "CTR", fmt: "pct" },
  cpm: { label: "CPM", fmt: "money" },
  cpc: { label: "CPC", fmt: "money" },
  lpv: { label: "Vis. página", fmt: "int" },
  ic: { label: "Checkouts iniciados", fmt: "int" },
  cost_ic: { label: "Custo por checkout", fmt: "money" },
  conv: { label: "Conversão", fmt: "pct" },
  taxes: { label: "Impostos", fmt: "money" },
  fees: { label: "Taxas", fmt: "money" },
  product_costs: { label: "Custo de produto", fmt: "money" }
};

export function fmt(v: number, kind: "money" | "int" | "x" | "pct", currency = "BRL") {
  if (!isFinite(v)) v = 0;
  if (kind === "money") {
    try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v); } catch { return v.toFixed(2); }
  }
  if (kind === "int") return new Intl.NumberFormat("pt-BR").format(Math.round(v));
  if (kind === "x") return v.toFixed(2);
  return (v * 100).toFixed(1).replace(".", ",") + "%";
}
