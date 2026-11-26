// Filtros partilhados (Resumo, Meta, Relatórios)
export type Filters = { account?: string; product?: string; source?: string; platform?: string; campaign?: string };

export function readFilters(sp: Record<string, string | undefined>): Filters {
  const f: Filters = {};
  for (const k of ["account", "product", "source", "platform", "campaign"] as const) if (sp[k]) f[k] = sp[k];
  return f;
}

const isMeta = (s?: string | null) => !s || /^(fb|facebook|meta|ig|instagram|an|msg|messenger)$/i.test(s.trim());

// Aplica os filtros às vendas e ao gasto. entities serve para saber a conta de cada campanha.
export function applyFilters(f: Filters, sales: any[], spend: any[], entities: any[]) {
  const campAcc = new Map<string, string>();
  for (const e of entities) if (e.campaign_id && e.account_id) campAcc.set(e.campaign_id, e.account_id);
  let S = sales, G = spend;
  if (f.account) {
    G = G.filter((x) => x.account_id === f.account);
    S = S.filter((x) => x.campaign_id && campAcc.get(x.campaign_id) === f.account);
  }
  if (f.campaign) { G = G.filter((x) => x.campaign_id === f.campaign); S = S.filter((x) => x.campaign_id === f.campaign); }
  if (f.product) S = S.filter((x) => (x.product_name || "Sem nome") === f.product);
  if (f.platform) S = S.filter((x) => x.provider === f.platform);
  if (f.source) {
    S = S.filter((x) => (f.source === "__none" ? !x.utm_source : x.utm_source === f.source));
    if (f.source === "__none" || !isMeta(f.source)) G = [];
  }
  return { sales: S, spend: G };
}

// Opções para os selects
export function filterOptions(sales: any[], entities: any[], ws: any) {
  const accounts = [...new Set([...String(ws.meta_ad_account_ids || "").split(/[,\s]+/).filter(Boolean).map((a) => (a.startsWith("act_") ? a : `act_${a}`)),
    ...entities.map((e) => e.account_id).filter(Boolean)])];
  const products = [...new Set(sales.map((s) => s.product_name || "Sem nome"))].sort();
  const sources = [...new Set(sales.map((s) => s.utm_source).filter(Boolean))].sort();
  const platforms = [...new Set(sales.map((s) => s.provider).filter(Boolean))].sort();
  return { accounts, products, sources, platforms };
}

export const METHOD_LABEL: Record<string, string> = { card: "Cartão", pix: "Pix", boleto: "Boleto", mbway: "MB WAY", paypal: "PayPal", outro: "Outro" };
