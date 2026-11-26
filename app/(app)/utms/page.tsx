import NoWs from "@/components/NoWs";
import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { resolveRange } from "@/lib/dates";
import { fmt } from "@/lib/metrics";
import FilterBar from "@/components/FilterBar";
import CsvButton from "@/components/CsvButton";

const PARAMS: [string, string][] = [["utm_source", "Origem (source)"], ["utm_campaign", "Campanha"], ["utm_medium", "Meio / Conjunto"], ["utm_content", "Conteúdo / Anúncio"], ["utm_term", "Termo / Posicionamento"]];
const clean = (v: string | null) => (v ? v.split("|")[0].trim() : "");

export default async function Utms({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return <NoWs />;
  const ws = ctx.ws;
  const r = resolveRange({ ...sp, p: sp.p || "7d" }, ws.timezone);
  const by = PARAMS.some(([k]) => k === sp.by) ? sp.by : "utm_source";
  const db = admin();
  const [{ data: sales }, { data: clicks }] = await Promise.all([
    db.from("sales").select("status,amount,utm_source,utm_medium,utm_campaign,utm_content,utm_term").eq("workspace_id", ws.id).gte("created_at", r.startIso).lt("created_at", r.endIso).limit(20000),
    db.from("clicks").select("utm_source,utm_medium,utm_campaign,utm_content,utm_term").eq("workspace_id", ws.id).gte("created_at", r.startIso).lt("created_at", r.endIso).limit(50000)
  ]);
  const map = new Map<string, { clicks: number; sales: number; revenue: number; pending: number; refunds: number }>();
  const get = (k: string) => { if (!map.has(k)) map.set(k, { clicks: 0, sales: 0, revenue: 0, pending: 0, refunds: 0 }); return map.get(k)!; };
  for (const c of clicks || []) get(clean((c as any)[by]) || "(sem UTM)").clicks++;
  for (const s of sales || []) {
    const x = get(clean((s as any)[by]) || "(sem UTM)");
    if (s.status === "approved") { x.sales++; x.revenue += Number(s.amount) || 0; }
    else if (s.status === "pending") x.pending++;
    else if (s.status === "refunded" || s.status === "chargeback") x.refunds++;
  }
  const rows = [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue || b[1].clicks - a[1].clicks);
  const m = (v: number) => fmt(v, "money", ws.currency);
  const csv = [["Valor", "Cliques", "Vendas", "Conversão", "Faturamento", "Pendentes", "Reembolsos"], ...rows.map(([k, x]) => [k, x.clicks, x.sales, x.clicks ? Math.round((x.sales / x.clicks) * 10000) / 100 : 0, Math.round(x.revenue * 100) / 100, x.pending, x.refunds])];

  return (
    <>
      <FilterBar base="/utms" values={{ p: r.p, from: r.from, to: r.to }} keep={{ by }} filters={[]} />
      <div className="subtabs" style={{ marginTop: 14 }}>
        {PARAMS.map(([k, l]) => <a key={k} className={k === by ? "on" : ""} href={"/utms?" + new URLSearchParams({ ...sp, by: k })}>{l}</a>)}
      </div>
      <div className="card tbl">
        <div className="card-h" style={{ padding: "14px 16px 6px" }}>
          <div><h2>UTMs</h2><div className="note">Cliques registados pelo script e vendas recebidas, agrupados por {PARAMS.find(([k]) => k === by)?.[1].toLowerCase()}.</div></div>
          <CsvButton name={`utmcai-utms-${by}-${r.from}-${r.to}.csv`} rows={csv} />
        </div>
        <table>
          <thead><tr><th>{PARAMS.find(([k]) => k === by)?.[1]}</th><th className="n">Cliques</th><th className="n">Vendas</th><th className="n">Conversão</th><th className="n">Faturamento</th><th className="n">Pendentes</th><th className="n">Reembolsos</th></tr></thead>
          <tbody>
            {!rows.length && <tr><td colSpan={7} className="empty">Sem cliques nem vendas neste período.</td></tr>}
            {rows.map(([k, x]) => (
              <tr key={k}><td className="name">{k}</td><td className="n">{x.clicks}</td><td className="n">{x.sales}</td>
                <td className="n">{x.clicks ? fmt(x.sales / x.clicks, "pct") : "N/A"}</td><td className="n">{m(x.revenue)}</td><td className="n">{x.pending}</td><td className="n">{x.refunds}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
