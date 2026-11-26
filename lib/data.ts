import { admin } from "./supabase/admin";
import { costsFrom } from "./metrics";

async function all(q: () => any) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Carrega tudo o que o dashboard / campanhas precisam para um período
export async function loadPeriod(ws: any, r: { from: string; to: string; startIso: string; endIso: string }) {
  const db = admin();
  const [sales, spend, entities, prods, fees] = await Promise.all([
    all(() => db.from("sales").select("status,amount,product_name,customer_email,created_at,utm_source,placement,provider,payment_method,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name")
      .eq("workspace_id", ws.id).gte("created_at", r.startIso).lt("created_at", r.endIso).order("created_at")),
    all(() => db.from("ad_spend").select("*").eq("workspace_id", ws.id).gte("date", r.from).lte("date", r.to).order("date")),
    all(() => db.from("ad_entities").select("*").eq("workspace_id", ws.id).order("id")),
    db.from("product_costs").select("*").eq("workspace_id", ws.id).then((x: any) => x.data || []),
    db.from("fees").select("*").eq("workspace_id", ws.id).then((x: any) => x.data || [])
  ]);
  return { sales, spend, entities, prods, costs: costsFrom(ws, prods, fees) };
}

// Despesas do período: únicas pela data, mensais (e custos mensais de produto) proporcionais aos dias
export async function loadExtraCosts(ws: any, r: { from: string; to: string }, prods: any[] = []) {
  const db = admin();
  const { data } = await db.from("expenses").select("*").eq("workspace_id", ws.id).lte("date", r.to);
  const days = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 864e5) + 1;
  let total = 0;
  for (const e of data || []) {
    if (e.kind === "mensal") {
      const start = e.date > r.from ? e.date : r.from;
      const d = Math.round((Date.parse(r.to) - Date.parse(start)) / 864e5) + 1;
      total += (Number(e.amount) || 0) * 12 / 365 * Math.max(0, d);
    }
    else if (e.date >= r.from && e.date <= r.to) total += Number(e.amount) || 0;
  }
  for (const p of prods) if (p.kind === "mensal") total += (Number(p.cost) || 0) * 12 / 365 * days;
  return total;
}
