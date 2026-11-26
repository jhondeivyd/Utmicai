import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { resolveRange } from "@/lib/dates";
import { money } from "@/lib/integrations";
import RangeBar from "@/components/RangeBar";
import { syncNow } from "./actions";

type Row = { key: string; name: string; spend: number; sales: number; revenue: number; pending: number; refunds: number };
const LEVELS = { campaign: "Campanhas", adset: "Conjuntos", ad: "Anúncios", placement: "Posicionamentos", source: "Origem" } as const;
type Level = keyof typeof LEVELS;

async function fetchAll(q: any) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return <div className="card">Crie a primeira workspace em <a className="pos" href="/admin">Admin</a>.</div>;
  const ws = ctx.ws;
  const r = resolveRange(sp, ws.timezone);
  const level = (sp.l in LEVELS ? sp.l : "campaign") as Level;
  const db = admin();

  const sales = await fetchAll(() => db.from("sales")
    .select("status,amount,utm_source,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,placement")
    .eq("workspace_id", ws.id).gte("created_at", r.startIso).lt("created_at", r.endIso));
  const spend = await fetchAll(() => db.from("ad_spend")
    .select("campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,clicks")
    .eq("workspace_id", ws.id).gte("date", r.from).lte("date", r.to));

  // ---------- totais ----------
  const approved = sales.filter((s) => s.status === "approved");
  const revenue = approved.reduce((a, s) => a + Number(s.amount), 0);
  const totalSpend = spend.reduce((a, s) => a + Number(s.spend), 0);
  const profit = revenue - totalSpend;
  const roas = totalSpend > 0 ? revenue / totalSpend : 0;
  const pending = sales.filter((s) => s.status === "pending");
  const refunds = sales.filter((s) => s.status === "refunded" || s.status === "chargeback");
  const tracked = approved.filter((s) => s.utm_source || s.campaign_name || s.campaign_id).length;
  const cur = ws.currency;

  // ---------- tabela por nível ----------
  const keyOf = (x: any): [string, string] => {
    if (level === "source") return [x.utm_source || "—", x.utm_source || "Sem rastreio"];
    if (level === "placement") return [x.placement || "—", x.placement || "Sem posicionamento"];
    const id = x[`${level}_id`], name = x[`${level}_name`];
    return [id || (name ? "n:" + name : "—"), name || (id ? `#${id}` : "Sem rastreio")];
  };
  const map = new Map<string, Row>();
  const get = (k: string, n: string) => {
    if (!map.has(k)) map.set(k, { key: k, name: n, spend: 0, sales: 0, revenue: 0, pending: 0, refunds: 0 });
    const row = map.get(k)!; if (row.name.startsWith("#") && !n.startsWith("#")) row.name = n; return row;
  };
  if (level !== "source" && level !== "placement") for (const s of spend) { const [k, n] = keyOf(s); get(k, n).spend += Number(s.spend); }
  for (const s of sales) {
    const [k, n] = keyOf(s); const row = get(k, n);
    if (s.status === "approved") { row.sales++; row.revenue += Number(s.amount); }
    else if (s.status === "pending") row.pending++;
    else if (s.status === "refunded" || s.status === "chargeback") row.refunds++;
  }
  // nomes de sales sem id → junta com linha do gasto com mesmo nome
  for (const [k, row] of map) {
    if (!k.startsWith("n:")) continue;
    const twin = [...map.values()].find((x) => x !== row && !x.key.startsWith("n:") && x.name === row.name);
    if (twin) { twin.sales += row.sales; twin.revenue += row.revenue; twin.pending += row.pending; twin.refunds += row.refunds; map.delete(k); }
  }
  const rows = [...map.values()].sort((a, b) => b.revenue - a.revenue || b.spend - a.spend);
  const syncMsg = sp.sync ? decodeURIComponent(sp.sync) : null;

  return (
    <>
      <div className="top">
        <h1>Dashboard</h1>
        <RangeBar base="/dashboard" p={r.p} from={r.from} to={r.to} extra={{ l: level }} />
      </div>
      {syncMsg && <div className={"flash" + (syncMsg.startsWith("e:") ? " e" : "")}>{syncMsg.slice(syncMsg.indexOf(":") + 1)}</div>}

      <div className="grid kpis">
        <div className="card kpi"><div className="l">Faturamento</div><div className="v">{money(revenue, cur)}</div><div className="s">{approved.length} vendas aprovadas</div></div>
        <div className="card kpi"><div className="l">Gasto Meta Ads</div><div className="v">{money(totalSpend, cur)}</div>
          <div className="s">{ws.meta_last_sync_at ? "sync " + new Date(ws.meta_last_sync_at).toLocaleString("pt-BR", { timeZone: ws.timezone }) : "nunca sincronizado"}</div></div>
        <div className="card kpi"><div className="l">Lucro</div><div className={"v " + (profit >= 0 ? "pos" : "neg")}>{money(profit, cur)}</div></div>
        <div className="card kpi"><div className="l">ROAS</div><div className={"v " + (roas >= 1 ? "pos" : totalSpend ? "neg" : "")}>{roas.toFixed(2)}</div></div>
        <div className="card kpi"><div className="l">CPA</div><div className="v">{approved.length ? money(totalSpend / approved.length, cur) : "—"}</div></div>
        <div className="card kpi"><div className="l">Pendentes</div><div className="v warn">{pending.length}</div><div className="s">{money(pending.reduce((a, s) => a + Number(s.amount), 0), cur)}</div></div>
        <div className="card kpi"><div className="l">Reembolsos</div><div className="v neg">{refunds.length}</div></div>
        <div className="card kpi"><div className="l">Vendas rastreadas</div><div className={"v " + (approved.length && tracked / approved.length < 0.8 ? "warn" : "")}>{approved.length ? Math.round((tracked / approved.length) * 100) : 0}%</div><div className="s">com UTM</div></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="top" style={{ marginBottom: 12 }}>
          <div className="tabs">
            {(Object.keys(LEVELS) as Level[]).map((k) => (
              <a key={k} className={"tab" + (k === level ? " on" : "")} href={"/dashboard?" + new URLSearchParams({ p: r.p, from: r.from, to: r.to, l: k }).toString()}>{LEVELS[k]}</a>
            ))}
          </div>
          {ctx.canEdit && ws.meta_access_token && (
            <form action={syncNow}><input type="hidden" name="ws" value={ws.id} /><input type="hidden" name="days" value="7" />
              <button className="btn btn-ghost btn-sm">↻ Sincronizar gasto (7 dias)</button></form>
          )}
        </div>
        <div className="tbl">
          <table>
            <thead><tr><th>{LEVELS[level]}</th><th className="n">Gasto</th><th className="n">Vendas</th><th className="n">Faturamento</th>
              <th className="n">Lucro</th><th className="n">ROAS</th><th className="n">CPA</th><th className="n">Pend.</th><th className="n">Reemb.</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="mut">Sem dados no período.</td></tr>}
              {rows.map((x) => {
                const p = x.revenue - x.spend;
                return (
                  <tr key={x.key}>
                    <td className="name">{x.name}</td>
                    <td className="n">{money(x.spend, cur)}</td>
                    <td className="n">{x.sales}</td>
                    <td className="n">{money(x.revenue, cur)}</td>
                    <td className={"n " + (p >= 0 ? "pos" : "neg")}>{money(p, cur)}</td>
                    <td className="n">{x.spend ? (x.revenue / x.spend).toFixed(2) : "—"}</td>
                    <td className="n">{x.sales ? money(x.spend / x.sales, cur) : "—"}</td>
                    <td className="n warn">{x.pending || ""}</td>
                    <td className="n neg">{x.refunds || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
