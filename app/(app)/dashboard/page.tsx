import { getContext } from "@/lib/session";
import { resolveRange, addDays } from "@/lib/dates";
import { loadPeriod } from "@/lib/data";
import { totals, aggregate, byDay, byHour, groupCount, placementLabel, fmt } from "@/lib/metrics";
import RangeBar from "@/components/RangeBar";
import KpiGrid from "@/components/KpiGrid";
import { DailyChart, HourChart, HBars, Funnel } from "@/components/Charts";
import Icon from "@/components/Icon";
import { syncNow } from "./actions";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return <div className="card">Crie a primeira workspace em <a className="pos" href="/admin">Admin</a>.</div>;
  const ws = ctx.ws, cur = ws.currency;
  const r = resolveRange(sp, ws.timezone);
  const { sales, spend, entities, costs } = await loadPeriod(ws, r);

  const t = totals(sales, spend, costs);
  const approved = sales.filter((s) => s.status === "approved");
  const tracked = approved.filter((s) => s.utm_source || s.campaign_id || s.campaign_name).length;
  const m = (v: number, k: "money" | "int" | "x" | "pct") => fmt(v, k, cur);
  const tone = (v: number) => (v > 0 ? "pos" : v < 0 ? "neg" : "") as any;

  const tiles = [
    { key: "revenue", label: "Faturamento", value: m(t.revenue, "money"), sub: `${t.sales} vendas aprovadas`, hero: true },
    { key: "spend", label: "Gasto Meta Ads", value: m(t.spend, "money"), sub: ws.meta_last_sync_at ? "sync " + new Date(ws.meta_last_sync_at).toLocaleString("pt-BR", { timeZone: ws.timezone, dateStyle: "short", timeStyle: "short" }) : "nunca sincronizado" },
    { key: "profit", label: "Lucro", value: m(t.profit, "money"), tone: tone(t.profit), sub: `margem ${m(t.margin, "pct")}` },
    { key: "roas", label: "ROAS", value: m(t.roas, "x"), tone: t.spend ? (t.roas >= 1 ? "pos" : "neg") : "" },
    { key: "roi", label: "ROI", value: m(t.roi, "pct"), tone: tone(t.roi) },
    { key: "sales", label: "Vendas", value: m(t.sales, "int"), sub: `${t.customers.size} clientes` },
    { key: "cpa", label: "CPA", value: t.sales ? m(t.cpa, "money") : "—" },
    { key: "ticket", label: "Ticket médio", value: t.sales ? m(t.ticket, "money") : "—" },
    { key: "arpu", label: "ARPU", value: t.sales ? m(t.arpu, "money") : "—", sub: "receita por cliente" },
    { key: "net", label: "Receita líquida", value: m(t.net, "money"), sub: "após impostos e taxas" },
    { key: "pending", label: "Pendentes", value: m(t.pending, "int"), tone: "warn", sub: m(t.pending_amount, "money") },
    { key: "refunds", label: "Reembolsos", value: m(t.refunds + t.chargebacks, "int"), tone: t.refunds + t.chargebacks ? "neg" : "", sub: m(t.refund_amount, "money") },
    { key: "conv", label: "Conversão", value: m(t.conv, "pct"), sub: "vendas / vis. página" },
    { key: "tracked", label: "Vendas rastreadas", value: approved.length ? `${Math.round((100 * tracked) / approved.length)}%` : "—", tone: approved.length && tracked / approved.length < 0.8 ? "warn" : "", sub: "com UTM" },
    { key: "cpm", label: "CPM", value: m(t.cpm, "money") },
    { key: "ctr", label: "CTR", value: m(t.ctr, "pct") },
    { key: "cpc", label: "CPC", value: m(t.cpc, "money") },
    { key: "ic", label: "Checkouts iniciados", value: m(t.ic, "int"), sub: t.ic ? `${m(t.cost_ic, "money")} por checkout` : "" },
    { key: "taxes", label: "Impostos + taxas", value: m(t.taxes + t.fees, "money") },
    { key: "product_costs", label: "Custos de produto", value: m(t.product_costs + t.fixed_costs, "money") },
    { key: "meta_purchases", label: "Compras (Meta)", value: m(t.meta_purchases, "int"), sub: "o que o Pixel reportou" }
  ];

  const days: string[] = [];
  for (let d = r.from; d <= r.to && days.length < 400; d = addDays(d, 1)) days.push(d);
  const daily = byDay(sales, spend, days, ws.timezone);
  const hours = byHour(sales, ws.timezone);
  const placements = groupCount(sales, (s) => placementLabel(s.placement));
  const products = groupCount(sales, (s) => s.product_name || "Sem nome");
  const top = aggregate("campaign", sales, spend, entities, costs).filter((x) => x.spend || x.sales).sort((a, b) => b.profit - a.profit).slice(0, 6);
  const sync = sp.sync ? decodeURIComponent(sp.sync) : null;

  return (
    <>
      <div className="top">
        <div><h1>Dashboard</h1><div className="sub">{ws.name} · {r.from === r.to ? r.from.split("-").reverse().join("/") : `${r.from.split("-").reverse().join("/")} a ${r.to.split("-").reverse().join("/")}`}</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <RangeBar base="/dashboard" p={r.p} from={r.from} to={r.to} />
          {ctx.canEdit && ws.meta_access_token && (
            <form action={syncNow}><input type="hidden" name="ws" value={ws.id} /><input type="hidden" name="days" value="7" />
              <button className="icon-btn" title="Sincronizar Meta agora"><Icon name="sync" size={16} /></button></form>
          )}
        </div>
      </div>
      {sync && <div className={"flash" + (sync.startsWith("e:") ? " e" : "")}>{sync.slice(sync.indexOf(":") + 1)}</div>}

      <KpiGrid tiles={tiles} />

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="top" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Faturamento x Gasto</h2>
            <div className="legend"><span><i style={{ background: "#7c5cff" }} />Faturamento</span><span><i style={{ background: "#ff6b81" }} />Gasto</span></div></div>
          <DailyChart data={daily} currency={cur} />
        </div>
        <div className="card">
          <h2>Funil</h2>
          <Funnel steps={[
            { label: "Impressões", value: t.impressions },
            { label: "Cliques no link", value: t.link_clicks },
            { label: "Visualizações da página", value: t.lpv },
            { label: "Checkouts iniciados", value: t.ic },
            { label: "Vendas", value: t.sales }
          ]} />
          <div className="note" style={{ marginTop: 10 }}>Impressões, cliques, visualizações e checkouts vêm do Meta; vendas vêm dos seus checkouts.</div>
        </div>
      </div>

      <div className="grid g3" style={{ marginTop: 14 }}>
        <div className="card" style={{ gridColumn: "span 2" }}><h2>Vendas por hora</h2><HourChart data={hours} /></div>
        <div className="card">
          <h2>Para onde foi o dinheiro</h2>
          <div className="hbar">
            {[
              ["Gasto em anúncios", t.spend], ["Impostos", t.taxes], ["Taxas do checkout", t.fees],
              ["Custo de produto", t.product_costs + t.fixed_costs], ["Lucro", Math.max(0, t.profit)]
            ].map(([l, v]: any) => (
              <div className="r" key={l}><span>{l}</span><span className="t"><i style={{ width: `${t.revenue ? Math.min(100, (100 * v) / t.revenue) : 0}%`, background: l === "Lucro" ? "var(--pos)" : undefined }} /></span><span style={{ textAlign: "right" }}>{m(v, "money")}</span></div>
            ))}
          </div>
          <div className="note" style={{ marginTop: 10 }}>Impostos, taxas e custos configuram-se em <a className="pos" href="/config">Configurações</a>.</div>
        </div>
      </div>

      <div className="grid g3" style={{ marginTop: 14 }}>
        <div className="card"><h2>Vendas por posicionamento</h2><HBars rows={placements} currency={cur} /></div>
        <div className="card"><h2>Vendas por produto</h2><HBars rows={products} currency={cur} /></div>
        <div className="card">
          <h2>Estado das vendas</h2>
          <div className="hbar">
            {[["Aprovadas", t.sales, "var(--pos)"], ["Pendentes", t.pending, "var(--warn)"], ["Reembolsadas", t.refunds, "var(--neg)"], ["Chargebacks", t.chargebacks, "var(--neg)"]].map(([l, v, c]: any) => (
              <div className="r" key={l}><span>{l}</span><span className="t"><i style={{ width: `${sales.length ? (100 * v) / sales.length : 0}%`, background: c }} /></span><span style={{ textAlign: "right" }}>{v}</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14, padding: 0 }}>
        <div className="top" style={{ padding: "16px 18px 0" }}><h2 style={{ margin: 0 }}>Campanhas com mais lucro</h2><a className="btn btn-ghost btn-sm" href={`/campanhas?p=${r.p}&from=${r.from}&to=${r.to}`}>Ver todas</a></div>
        <div className="tbl" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Campanha</th><th className="n">Gasto</th><th className="n">Vendas</th><th className="n">Faturamento</th><th className="n">Lucro</th><th className="n">ROAS</th><th className="n">CPA</th></tr></thead>
            <tbody>
              {!top.length && <tr><td colSpan={7} className="empty">Sem dados no período.</td></tr>}
              {top.map((x) => (
                <tr key={x.key}>
                  <td className="name">{x.status && <span className={"badge b-" + x.status} style={{ marginRight: 8 }}>{x.status === "ACTIVE" ? "Ativa" : "Pausada"}</span>}{x.name}</td>
                  <td className="n">{m(x.spend, "money")}</td><td className="n">{x.sales}</td><td className="n">{m(x.revenue, "money")}</td>
                  <td className={"n " + tone(x.profit)}>{m(x.profit, "money")}</td><td className="n">{x.spend ? m(x.roas, "x") : "—"}</td><td className="n">{x.sales ? m(x.cpa, "money") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
