import Link from "next/link";
import NoWs from "@/components/NoWs";
import { getContext } from "@/lib/session";
import { resolveRange, addDays } from "@/lib/dates";
import { loadPeriod, loadExtraCosts } from "@/lib/data";
import { totals, aggregate, byDay, byHour, groupCount, placementLabel, fmt } from "@/lib/metrics";
import { readFilters, applyFilters, filterOptions, METHOD_LABEL } from "@/lib/filters";
import FilterBar from "@/components/FilterBar";
import { DailyChart, HourChart, HBars, Funnel } from "@/components/Charts";
import { syncNow } from "./actions";

function Tile({ label, value, sub, tone = "", tip, hero, className = "" }: { label: string; value: string; sub?: string; tone?: string; tip?: string; hero?: boolean; className?: string }) {
  return (
    <div className={`card kpi ${hero ? "hero" : ""} ${className}`}>
      <div className="l">{label}{tip && <span className="info" title={tip}>ⓘ</span>}</div>
      <div className={"v " + tone}>{value}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

const pct = (a: number, b: number) => (b ? a / b : 0);

export default async function Resumo({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return <NoWs />;
  const ws = ctx.ws, cur = ws.currency;
  const r = resolveRange(sp, ws.timezone);
  const f = readFilters(sp);
  const all = await loadPeriod(ws, r);
  const opts = filterOptions(all.sales, all.entities, ws);
  const { sales, spend } = applyFilters(f, all.sales, all.spend, all.entities);
  const { entities, costs } = all;

  const t0 = totals(sales, spend, costs);
  const extra = f.product || f.source || f.campaign ? 0 : await loadExtraCosts(ws, r, all.prods);
  const t = { ...t0, profit: t0.profit - extra, roi: t0.spend ? (t0.profit - extra) / t0.spend : 0, margin: t0.revenue ? (t0.profit - extra) / t0.revenue : 0 };
  const gross = ws.view_type === "total";
  const m = (v: number, k: "money" | "int" | "x" | "pct") => fmt(v, k, cur);
  const tone = (v: number) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
  const approved = sales.filter((s) => s.status === "approved");
  const tracked = approved.filter((s) => s.utm_source || s.campaign_id || s.campaign_name).length;
  const closed = t.sales + t.refunds + t.chargebacks;

  // taxa de aprovação por forma de pagamento (aprovadas / aprovadas + recusadas)
  const methods = ["card", "pix", "boleto"].concat([...new Set(sales.map((s) => s.payment_method).filter((x) => x && !["card", "pix", "boleto"].includes(x)))] as string[]);
  const approval = methods.map((k) => {
    const ofM = sales.filter((s) => s.payment_method === k);
    const ok = ofM.filter((s) => ["approved", "refunded", "chargeback"].includes(s.status)).length;
    const no = ofM.filter((s) => s.status === "canceled").length;
    return { k, label: METHOD_LABEL[k] || k, rate: ok + no ? ok / (ok + no) : null, n: ofM.length };
  }).filter((x) => ["card", "pix", "boleto"].includes(x.k) || x.n);

  const byProduct = groupCount(sales, (s) => s.product_name || "Sem nome");
  const byMethod = groupCount(sales, (s) => METHOD_LABEL[s.payment_method] || "Não informado");
  const bySource = groupCount(sales, (s) => s.utm_source || "Sem rastreio");
  const days: string[] = [];
  for (let d = r.from; d <= r.to && days.length < 400; d = addDays(d, 1)) days.push(d);
  const daily = byDay(sales, spend, days, ws.timezone);
  const hours = byHour(sales, ws.timezone);
  const placements = groupCount(sales, (s) => placementLabel(s.placement));
  const top = aggregate("campaign", sales, spend, entities, costs).filter((x) => x.spend || x.sales).sort((a, b) => b.profit - a.profit).slice(0, 6);
  const syncMsg = sp.sync ? decodeURIComponent(sp.sync) : null;
  const lastSync = ws.meta_last_sync_at ? Math.round((Date.now() - new Date(ws.meta_last_sync_at).getTime()) / 60000) : null;

  const values: Record<string, string> = { p: r.p, from: r.from, to: r.to, ...(f as any) };
  const products = opts.products.map((v) => ({ value: v, label: v }));

  return (
    <>
      <div className="top">
        <div><h1>Resumo</h1><div className="sub">{ws.name}</div></div>
        <div className="inline">
          <span className="updated">{lastSync === null ? "Meta nunca sincronizado" : lastSync < 2 ? "Atualizado agora mesmo" : `Atualizado há ${lastSync < 60 ? lastSync + " min" : Math.round(lastSync / 60) + " h"}`}</span>
          {ctx.canEdit && ws.meta_access_token && (
            <form action={syncNow}><input type="hidden" name="ws" value={ws.id} /><input type="hidden" name="days" value="3" /><button className="btn btn-sm">Atualizar</button></form>
          )}
        </div>
      </div>
      {syncMsg && <div className={"flash" + (syncMsg.startsWith("e:") ? " e" : "")}>{syncMsg.slice(syncMsg.indexOf(":") + 1)}</div>}

      <FilterBar base="/dashboard" values={values}
        filters={[
          { key: "account", label: "Conta de anúncio", options: opts.accounts.map((a) => ({ value: a, label: a.replace("act_", "") })) },
          { key: "source", label: "Fonte de tráfego", options: [...opts.sources.map((s) => ({ value: s, label: s })), { value: "__none", label: "Sem rastreio" }] },
          { key: "platform", label: "Plataforma", options: opts.platforms.map((p) => ({ value: p, label: p === "kashpay" ? "KashPay" : p === "stripe" ? "Stripe" : p })) },
          { key: "product", label: "Produto", options: products }
        ]}
        more={[{ key: "campaign", label: "Campanha", options: entities.filter((e) => e.level === "campaign").map((e) => ({ value: e.id, label: e.name })) }]}
      />

      <div className="tile-grid">
        {gross
          ? <Tile hero label="Faturamento total" value={m(t.revenue, "money")} sub={`Líquido ${m(t.net, "money")}`} tip="Valor bruto pago pelos clientes nas vendas aprovadas" />
          : <Tile hero label="Faturamento líquido" value={m(t.net, "money")} sub={`Bruto ${m(t.revenue, "money")}`} tip="Faturamento das vendas aprovadas menos impostos e taxas" />}
        <Tile label="Gastos com anúncios" value={m(t.spend, "money")} />
        <Tile label="ROAS" value={t.spend ? m(t.roas, "x") : "0,00"} tone={t.spend ? (t.roas >= 1 ? "pos" : "neg") : ""} tip="Faturamento ÷ gasto" />
        <Tile label="Lucro" value={m(t.profit, "money")} tone={tone(t.profit)} tip="Faturamento líquido − gasto − custos de produto − despesas adicionais" />

        <div className="card span2 row2">
          <h2>Vendas por produto <span className="info" title="Vendas aprovadas no período">ⓘ</span></h2>
          {byProduct.length ? <HBars rows={byProduct} currency={cur} /> : <div className="empty">Nenhuma venda por aqui</div>}
        </div>
        <Tile label="Vendas pendentes" value={m(t.pending_amount, "money")} sub={`${t.pending} vendas`} tone="warn" />
        <Tile label="ROI" value={t.spend ? m(t.roi, "pct") : "0,0%"} tone={tone(t.roi)} tip="Lucro ÷ gasto" />
        <Tile label="Vendas reembolsadas" value={m(t.refund_amount, "money")} sub={`${t.refunds + t.chargebacks} vendas`} tone={t.refunds ? "neg" : ""} />
        <Tile label="Taxas" value={m(t.taxes + t.fees, "money")} sub="impostos + checkout" />

        <Tile label="Margem" value={t.revenue ? m(t.margin, "pct") : "N/A"} tone={tone(t.margin)} tip="Lucro ÷ faturamento" />
        <Tile label="Despesas adicionais" value={m(extra + t.product_costs + t.fixed_costs, "money")} sub={extra ? `custos de produto ${m(t.product_costs + t.fixed_costs, "money")}` : "custos de produto e despesas"} tip="Custos de produto + despesas registadas em Despesas (as mensais são divididas pelos dias)" />
        <Tile label="Reembolso" value={m(pct(t.refunds, closed), "pct")} tone={t.refunds ? "neg" : ""} tip="Vendas reembolsadas ÷ vendas concluídas" />
        <Tile label="Chargeback" value={m(pct(t.chargebacks, closed), "pct")} tone={t.chargebacks ? "neg" : ""} />

        <div className="card">
          <h2>Taxa de aprovação</h2>
          {approval.map((a) => (
            <div className="ring" key={a.k}><span>{a.label}</span><span className="mut">{a.n || ""}</span><b>{a.rate === null ? "N/A" : m(a.rate, "pct")}</b></div>
          ))}
        </div>
        <Tile label="Vendas" value={m(t.sales, "int")} sub={`${t.customers.size} clientes`} />
        <Tile label="CPA" value={t.sales ? m(t.cpa, "money") : "N/A"} />
        <Tile label="Ticket médio" value={t.sales ? m(t.ticket, "money") : "N/A"} sub={t.sales ? `ARPU ${m(t.arpu, "money")}` : undefined} />

        <div className="card span2">
          <h2>Vendas por pagamento</h2>
          {byMethod.length ? <HBars rows={byMethod} currency={cur} /> : <div className="empty">Nenhuma venda por aqui</div>}
        </div>
        <div className="card span2">
          <h2>Vendas por fonte</h2>
          {bySource.length ? <HBars rows={bySource} currency={cur} /> : <div className="empty">Nenhuma venda por aqui</div>}
        </div>

        <Tile label="Vendas rastreadas" value={approved.length ? `${Math.round((100 * tracked) / approved.length)}%` : "N/A"} tone={approved.length && tracked / approved.length < 0.8 ? "warn" : ""} sub="com UTM" />
        <Tile label="Checkouts iniciados" value={m(t.ic, "int")} sub={t.ic ? `${m(t.cost_ic, "money")} por checkout` : undefined} />
        <Tile label="CPM / CTR" value={m(t.cpm, "money")} sub={`CTR ${m(t.ctr, "pct")} · CPC ${m(t.cpc, "money")}`} />
        <Tile label="Compras (Pixel)" value={m(t.meta_purchases, "int")} sub="o que o Meta reportou" />
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="top" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Faturamento x Gasto</h2>
            <div className="legend"><span><i style={{ background: "#7c5cff" }} />Faturamento</span><span><i style={{ background: "#ff6b81" }} />Gasto</span></div></div>
          <DailyChart data={daily} currency={cur} />
        </div>
        <div className="card">
          <h2>Funil</h2>
          <Funnel steps={[
            { label: "Impressões", value: t.impressions }, { label: "Cliques no link", value: t.link_clicks },
            { label: "Visualizações da página", value: t.lpv }, { label: "Checkouts iniciados", value: t.ic }, { label: "Vendas", value: t.sales }
          ]} />
        </div>
      </div>

      <div className="grid g3" style={{ marginTop: 14 }}>
        <div className="card" style={{ gridColumn: "span 2" }}><h2>Vendas por hora</h2><HourChart data={hours} /></div>
        <div className="card"><h2>Vendas por posicionamento</h2><HBars rows={placements} currency={cur} /></div>
      </div>

      <div className="card" style={{ marginTop: 14, padding: 0 }}>
        <div className="top" style={{ padding: "16px 18px 0" }}><h2 style={{ margin: 0 }}>Campanhas com mais lucro</h2><Link className="btn btn-ghost btn-sm" href={`/campanhas?p=${r.p}&from=${r.from}&to=${r.to}`}>Ver todas</Link></div>
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
