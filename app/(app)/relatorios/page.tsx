import NoWs from "@/components/NoWs";
import { getContext } from "@/lib/session";
import { resolveRange, addDays } from "@/lib/dates";
import { loadPeriod } from "@/lib/data";
import { totals, fmt, partsIn } from "@/lib/metrics";
import { readFilters, applyFilters, filterOptions } from "@/lib/filters";
import FilterBar from "@/components/FilterBar";
import CsvButton from "@/components/CsvButton";

const GROUPS: [string, string][] = [["day", "Dia"], ["week", "Semana"], ["month", "Mês"]];

export default async function Relatorios({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return <NoWs />;
  const ws = ctx.ws;
  const r = resolveRange({ ...sp, p: sp.p || "30d" }, ws.timezone);
  const g = GROUPS.some(([k]) => k === sp.g) ? sp.g : "day";
  const f = readFilters(sp);
  const all = await loadPeriod(ws, r);
  const opts = filterOptions(all.sales, all.entities, ws);
  const { sales, spend } = applyFilters(f, all.sales, all.spend, all.entities);

  const keyOf = (d: string) => {
    if (g === "month") return d.slice(0, 7);
    if (g === "week") { const wd = (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7; return addDays(d, -wd); }
    return d;
  };
  const buckets = new Map<string, { sales: any[]; spend: any[] }>();
  for (let d = r.from; d <= r.to && buckets.size < 400; d = addDays(d, 1)) if (!buckets.has(keyOf(d))) buckets.set(keyOf(d), { sales: [], spend: [] });
  for (const s of sales) buckets.get(keyOf(partsIn(ws.timezone, s.created_at).day))?.sales.push(s);
  for (const s of spend) buckets.get(keyOf(s.date))?.spend.push(s);
  const rows = [...buckets.entries()].reverse().map(([k, b]) => ({ k, t: totals(b.sales, b.spend, all.costs) }));
  const tot = totals(sales, spend, all.costs);
  const m = (v: number) => fmt(v, "money", ws.currency);
  const label = (k: string) => g === "month" ? k.split("-").reverse().join("/") : g === "week" ? "Semana de " + k.split("-").reverse().join("/") : k.split("-").reverse().join("/");
  const head = ["Período", "Vendas", "Faturamento", "Fat. líquido", "Gastos", "Lucro", "ROAS", "ROI", "CPA", "Ticket médio", "Pendentes", "Reembolsos"];
  const line = (k: string, t: any) => [k, t.sales, t.revenue, t.net, t.spend, t.profit, t.spend ? t.roas : 0, t.spend ? t.roi : 0, t.sales ? t.cpa : 0, t.sales ? t.ticket : 0, t.pending_amount, t.refund_amount];
  const csv = [head, ...rows.map((x) => line(label(x.k), x.t).map((v) => typeof v === "number" ? Math.round(v * 100) / 100 : v)), line("Total", tot).map((v) => typeof v === "number" ? Math.round(v * 100) / 100 : v)];
  const tone = (v: number) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
  const Row = ({ k, t, b }: { k: string; t: any; b?: boolean }) => (
    <tr className={b ? "total" : ""}>
      <td>{b ? <b>{k}</b> : k}</td><td className="n">{t.sales}</td><td className="n">{m(t.revenue)}</td><td className="n">{m(t.net)}</td><td className="n">{m(t.spend)}</td>
      <td className={"n " + tone(t.profit)}>{m(t.profit)}</td><td className="n">{t.spend ? fmt(t.roas, "x") : "N/A"}</td>
      <td className={"n " + tone(t.roi)}>{t.spend ? fmt(t.roi, "pct") : "N/A"}</td><td className="n">{t.sales ? m(t.cpa) : "N/A"}</td>
      <td className="n">{t.sales ? m(t.ticket) : "N/A"}</td><td className="n">{m(t.pending_amount)}</td><td className="n">{m(t.refund_amount)}</td>
    </tr>
  );

  return (
    <>
      <FilterBar base="/relatorios" values={{ p: r.p, from: r.from, to: r.to, ...(f as any) }} keep={{ ...(sp.g ? { g: sp.g } : {}) }}
        filters={[
          { key: "account", label: "Conta de anúncio", options: opts.accounts.map((a) => ({ value: a, label: a.replace("act_", "") })) },
          { key: "source", label: "Fonte de tráfego", options: [...opts.sources.map((v) => ({ value: v, label: v })), { value: "__none", label: "Sem rastreio" }] },
          { key: "product", label: "Produto", options: opts.products.map((v) => ({ value: v, label: v })) }
        ]} />
      <div className="card tbl" style={{ marginTop: 14 }}>
        <div className="card-h" style={{ padding: "14px 16px 6px" }}>
          <h2>Relatório</h2>
          <div className="inline">
            <div className="tabs">{GROUPS.map(([k, l]) => <a key={k} className={"tab" + (g === k ? " on" : "")} href={"/relatorios?" + new URLSearchParams({ ...sp, g: k })}>{l}</a>)}</div>
            <CsvButton name={`utmcai-relatorio-${r.from}-${r.to}.csv`} rows={csv} />
          </div>
        </div>
        <table>
          <thead><tr>{head.map((h, i) => <th key={h} className={i ? "n" : ""}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((x) => <Row key={x.k} k={label(x.k)} t={x.t} />)}
            <Row k="Total" t={tot} b />
          </tbody>
        </table>
      </div>
    </>
  );
}
