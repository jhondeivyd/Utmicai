import { getContext } from "@/lib/session";
import { resolveRange } from "@/lib/dates";
import { loadPeriod } from "@/lib/data";
import { aggregate, totals, fmt, Level } from "@/lib/metrics";
import { admin } from "@/lib/supabase/admin";
import RangeBar from "@/components/RangeBar";
import BudgetCell from "@/components/BudgetCell";
import ConfirmButton from "@/components/ConfirmButton";
import Icon from "@/components/Icon";
import { toggleStatus, changeBudget, duplicateEntity, syncCampaigns } from "./actions";

const LV: Record<Level, string> = { campaign: "Campanhas", adset: "Conjuntos", ad: "Anúncios" };
const SORTS: Record<string, string> = { profit: "Lucro", spend: "Gasto", revenue: "Faturamento", sales: "Vendas", roas: "ROAS", cpa: "CPA" };

export default async function Campanhas({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return null;
  const ws = ctx.ws, cur = ws.currency;
  const r = resolveRange(sp, ws.timezone);
  const level = (["campaign", "adset", "ad"].includes(sp.l) ? sp.l : "campaign") as Level;
  const parent = sp.parent || null;
  const st = sp.st || "all";
  const sort = SORTS[sp.sort] ? sp.sort : "spend";
  const q = (sp.q || "").toLowerCase();

  const { sales, spend, entities, costs } = await loadPeriod(ws, r);
  let rows = aggregate(level, sales, spend, entities, costs, { parent, includeIdle: true });
  if (st === "active") rows = rows.filter((x) => x.status === "ACTIVE");
  if (st === "paused") rows = rows.filter((x) => x.status === "PAUSED");
  if (st === "spend") rows = rows.filter((x) => x.spend > 0 || x.sales > 0);
  if (q) rows = rows.filter((x) => x.name.toLowerCase().includes(q));
  rows = rows.filter((x) => x.status !== "DELETED" && x.status !== "ARCHIVED");
  rows.sort((a, b) => sort === "cpa" ? (a.cpa || 1e12) - (b.cpa || 1e12) : (b as any)[sort] - (a as any)[sort]);
  const tot = totals(
    sales.filter((s) => !parent || s.campaign_id === parent || s.adset_id === parent),
    spend.filter((s) => !parent || s.campaign_id === parent || s.adset_id === parent), costs);

  const parentEnt = parent ? entities.find((e) => e.id === parent) : null;
  const campEnt = parentEnt?.level === "adset" ? entities.find((e) => e.id === parentEnt.campaign_id) : parentEnt;
  const { data: logs } = await admin().from("action_logs").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(8);

  const base = { p: r.p, from: r.from, to: r.to, st, sort, ...(sp.q ? { q: sp.q } : {}) };
  const link = (o: Record<string, string | null>) => "/campanhas?" + new URLSearchParams(Object.fromEntries(Object.entries({ ...base, l: level, ...(parent ? { parent } : {}), ...o }).filter(([, v]) => v != null)) as any).toString();
  const ret = link({});
  const msg = sp.m ? decodeURIComponent(sp.m) : null;
  const m = (v: number, k: "money" | "int" | "x" | "pct") => fmt(v, k, cur);
  const child: Record<Level, Level | null> = { campaign: "adset", adset: "ad", ad: null };
  const can = ctx.canEdit && !!ws.meta_access_token;
  const H = (x: any) => <><input type="hidden" name="ws" value={ws.id} /><input type="hidden" name="id" value={x.id} /><input type="hidden" name="name" value={x.name} /><input type="hidden" name="ret" value={ret} /></>;
  const budget = (x: any) => x.daily_budget ? m(x.daily_budget, "money") + "/dia" : x.lifetime_budget ? m(x.lifetime_budget, "money") + " total" : level === "ad" ? "—" : "CBO/ABO";

  return (
    <>
      <div className="top">
        <div><h1>Campanhas</h1><div className="sub">Gestão do Meta Ads com as vendas reais do UtmCai</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <RangeBar base="/campanhas" p={r.p} from={r.from} to={r.to} extra={{ l: level, st, sort, ...(parent ? { parent } : {}) }} />
          {can && <form action={syncCampaigns}><input type="hidden" name="ws" value={ws.id} /><input type="hidden" name="ret" value={ret} />
            <button className="icon-btn" title="Sincronizar com o Meta"><Icon name="sync" size={16} /></button></form>}
        </div>
      </div>
      {msg && <div className={"flash" + (msg.startsWith("e:") ? " e" : "")}>{msg.slice(msg.indexOf(":") + 1)}</div>}
      {!ws.meta_access_token && <div className="flash e">Ligue o Meta Ads em <a className="pos" href="/config">Configurações</a> para ver e gerir as campanhas.</div>}

      <div className="top" style={{ marginBottom: 10 }}>
        <div className="tabs">
          {(Object.keys(LV) as Level[]).map((k) => <a key={k} className={"tab" + (k === level ? " on" : "")} href={"/campanhas?" + new URLSearchParams({ ...base, l: k } as any)}>{LV[k]}</a>)}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div className="chips">
            {[["all", "Todas"], ["active", "Ativas"], ["paused", "Pausadas"], ["spend", "Com gasto"]].map(([k, l]) => <a key={k} className={"chip" + (st === k ? " on" : "")} href={link({ st: k })}>{l}</a>)}
          </div>
          <form method="get" action="/campanhas" className="inline">
            {Object.entries({ ...base, l: level, ...(parent ? { parent } : {}) }).filter(([k]) => k !== "q").map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)}
            <input className="input" name="q" placeholder="Procurar por nome" defaultValue={sp.q || ""} style={{ width: 190 }} />
          </form>
        </div>
      </div>

      {parent && (
        <div className="crumbs">
          <a href={"/campanhas?" + new URLSearchParams({ ...base, l: "campaign" } as any)}>Todas as campanhas</a>
          {campEnt && <><Icon name="chevron" size={12} /><a href={link({ l: "adset", parent: campEnt.id })}>{campEnt.name}</a></>}
          {parentEnt?.level === "adset" && <><Icon name="chevron" size={12} /><span>{parentEnt.name}</span></>}
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                {can && <th style={{ width: 44 }}></th>}
                <th>{LV[level].slice(0, -1)}</th>
                {level !== "ad" && <th>Orçamento</th>}
                {Object.entries({ spend: "Gasto", sales: "Vendas", revenue: "Faturamento", profit: "Lucro", roas: "ROAS", cpa: "CPA" }).map(([k, l]) => (
                  <th key={k} className="n"><a href={link({ sort: k })} style={{ color: sort === k ? "#fff" : undefined }}>{l}{sort === k ? " ↓" : ""}</a></th>
                ))}
                <th className="n">CPM</th><th className="n">CTR</th><th className="n">Checkouts</th><th className="n">Custo/IC</th><th className="n">Pend.</th>
                {can && <th></th>}
              </tr>
            </thead>
            <tbody>
              {!rows.length && <tr><td colSpan={16} className="empty">Nada para mostrar. {ws.meta_access_token ? "Clique em sincronizar para buscar as campanhas do Meta." : ""}</td></tr>}
              {rows.map((x) => {
                const pr = x.profit;
                return (
                  <tr key={x.key}>
                    {can && <td>{x.id && x.status && (x.status === "ACTIVE" || x.status === "PAUSED") && (
                      <form action={toggleStatus}>{H(x)}<input type="hidden" name="to" value={x.status === "ACTIVE" ? "PAUSED" : "ACTIVE"} />
                        <ConfirmButton className={"switch" + (x.status === "ACTIVE" ? " on" : "")} title={x.status === "ACTIVE" ? "Pausar" : "Ativar"}
                          msg={`${x.status === "ACTIVE" ? "Pausar" : "Ativar"} "${x.name}" no Meta?`}>{""}</ConfirmButton>
                      </form>)}</td>}
                    <td className="name">
                      {x.id && child[level] ? <a href={link({ l: child[level]!, parent: x.id })} style={{ fontWeight: 600 }}>{x.name}</a> : <span style={{ fontWeight: 600 }}>{x.name}</span>}
                      <div className="note">{x.effective_status && x.effective_status !== x.status ? x.effective_status.replace(/_/g, " ").toLowerCase() : x.status === "ACTIVE" ? "ativa" : x.status === "PAUSED" ? "pausada" : x.id ? "" : "vendas sem ID do anúncio"}</div>
                    </td>
                    {level !== "ad" && <td>
                      <BudgetCell action={changeBudget} editable={can && !!x.id && !!x.daily_budget} value={x.daily_budget ?? null} display={budget(x)}
                        hidden={{ ws: ws.id, id: x.id || "", name: x.name, ret, old: String(x.daily_budget ?? "") }} />
                    </td>}
                    <td className="n">{m(x.spend, "money")}</td>
                    <td className="n">{x.sales || ""}</td>
                    <td className="n">{x.revenue ? m(x.revenue, "money") : ""}</td>
                    <td className={"n " + (pr > 0 ? "pos" : pr < 0 ? "neg" : "")}>{pr ? m(pr, "money") : ""}</td>
                    <td className={"n " + (x.spend ? (x.roas >= 1 ? "pos" : "neg") : "")}>{x.spend ? m(x.roas, "x") : "—"}</td>
                    <td className="n">{x.sales ? m(x.cpa, "money") : "—"}</td>
                    <td className="n">{x.impressions ? m(x.cpm, "money") : "—"}</td>
                    <td className="n">{x.impressions ? m(x.ctr, "pct") : "—"}</td>
                    <td className="n">{x.ic || ""}</td>
                    <td className="n">{x.ic ? m(x.cost_ic, "money") : "—"}</td>
                    <td className="n warn">{x.pending || ""}</td>
                    {can && <td>{x.id && (
                      <form action={duplicateEntity}>{H(x)}<input type="hidden" name="level" value={level} />
                        <ConfirmButton className="icon-btn" title="Duplicar (a cópia fica pausada)" msg={`Duplicar "${x.name}" no Meta? A cópia é criada pausada.`}><Icon name="copy" size={15} /></ConfirmButton>
                      </form>)}</td>}
                  </tr>
                );
              })}
              {rows.length > 0 && (
                <tr className="total">
                  {can && <td></td>}<td>Total ({rows.length})</td>{level !== "ad" && <td></td>}
                  <td className="n">{m(tot.spend, "money")}</td><td className="n">{tot.sales}</td><td className="n">{m(tot.revenue, "money")}</td>
                  <td className={"n " + (tot.profit >= 0 ? "pos" : "neg")}>{m(tot.profit, "money")}</td><td className="n">{tot.spend ? m(tot.roas, "x") : "—"}</td>
                  <td className="n">{tot.sales ? m(tot.cpa, "money") : "—"}</td><td className="n">{m(tot.cpm, "money")}</td><td className="n">{m(tot.ctr, "pct")}</td>
                  <td className="n">{tot.ic}</td><td className="n">{tot.ic ? m(tot.cost_ic, "money") : "—"}</td><td className="n warn">{tot.pending || ""}</td>{can && <td></td>}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {ctx.canEdit && (logs || []).length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Últimas ações no Meta</h2>
          <table><tbody>
            {(logs || []).map((l: any) => (
              <tr key={l.id}><td className="mut">{new Date(l.created_at).toLocaleString("pt-BR", { timeZone: ws.timezone, dateStyle: "short", timeStyle: "short" })}</td>
                <td>{l.action}</td><td className="name">{l.entity_name}</td><td className={l.ok ? "mut" : "err"}>{l.detail}</td><td className="mut">{l.user_email}</td></tr>
            ))}
          </tbody></table>
        </div>
      )}
    </>
  );
}
