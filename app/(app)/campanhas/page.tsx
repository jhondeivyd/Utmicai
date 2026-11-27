import Link from "next/link";
import NoWs from "@/components/NoWs";
import { getContext } from "@/lib/session";
import { resolveRange } from "@/lib/dates";
import { loadPeriod } from "@/lib/data";
import { aggregate, totals, Level } from "@/lib/metrics";
import { readFilters, applyFilters, filterOptions } from "@/lib/filters";
import { admin } from "@/lib/supabase/admin";
import FilterBar from "@/components/FilterBar";
import MetaTable from "@/components/MetaTable";
import Icon from "@/components/Icon";
import AutoSelect from "@/components/AutoSelect";
import { toggleStatus, changeBudget, duplicateEntity, syncCampaigns } from "./actions";

const LV: Record<Level, string> = { account: "Contas", campaign: "Campanhas", adset: "Conjuntos", ad: "Anúncios" };
const ICON: Record<Level, string> = { account: "admin", campaign: "campaigns", adset: "dashboard", ad: "copy" };

export default async function Meta({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return <NoWs />;
  const ws = ctx.ws;
  const r = resolveRange(sp, ws.timezone);
  const level = (["account", "campaign", "adset", "ad"].includes(sp.l) ? sp.l : "campaign") as Level;
  const parent = sp.parent || null;
  const st = sp.st || "";
  const q = (sp.q || "").toLowerCase();
  const f = readFilters(sp);

  const all = await loadPeriod(ws, r);
  const opts = filterOptions(all.sales, all.entities, ws);
  const { entities, costs } = all;
  const campAcc = new Map<string, string>();
  for (const e of entities) if (e.campaign_id && e.account_id) campAcc.set(e.campaign_id, e.account_id);
  const fl = applyFilters(f, all.sales, all.spend, entities);
  const sales = fl.sales.map((s) => ({ ...s, account_id: s.campaign_id ? campAcc.get(s.campaign_id) || null : null }));
  const spend = fl.spend;

  let rows = aggregate(level, sales, spend, entities, costs, { parent, includeIdle: level !== "account" });
  if (level === "account") rows = rows.map((x) => ({ ...x, name: x.id ? `Conta ${String(x.id).replace("act_", "")}` : "Vendas sem conta identificada" }));
  if (f.account && level !== "account") rows = rows.filter((x) => !x.id || entities.find((e) => e.id === x.id)?.account_id === f.account || (x.spend || x.sales));
  if (st === "ACTIVE" || st === "PAUSED") rows = rows.filter((x) => x.status === st);
  if (st === "spend") rows = rows.filter((x) => x.spend > 0 || x.sales > 0);
  if (q) rows = rows.filter((x) => x.name.toLowerCase().includes(q));
  rows = rows.filter((x) => x.status !== "DELETED" && x.status !== "ARCHIVED");

  const inParent = (x: any) => !parent || x.campaign_id === parent || x.adset_id === parent;
  const tot = totals(sales.filter(inParent), spend.filter(inParent), costs);
  const totalRow: any = { ...tot, customers: undefined, daily_budget: rows.reduce((a, x) => a + (Number(x.daily_budget) || 0), 0) };

  // última alteração de cada item (manual ou por regra)
  const ids = rows.map((x) => x.id).filter(Boolean) as string[];
  const lastUpd: Record<string, any> = {};
  if (ids.length && level !== "account") {
    const db = admin();
    const [{ data: a1 }, { data: a2 }] = await Promise.all([
      db.from("action_logs").select("entity_id,action,detail,snapshot,created_at,user_email,ok").eq("workspace_id", ws.id).eq("ok", true).in("entity_id", ids.slice(0, 500)).order("created_at", { ascending: false }).limit(1000),
      db.from("rule_logs").select("entity_id,action,detail,snapshot,created_at,ok,dry_run").eq("workspace_id", ws.id).eq("ok", true).eq("dry_run", false).in("entity_id", ids.slice(0, 500)).order("created_at", { ascending: false }).limit(1000)
    ]);
    const NAMES: Record<string, string> = { pause: "Pausado (regra)", activate: "Ativado (regra)", budget_up: "Orçamento ↑ (regra)", budget_down: "Orçamento ↓ (regra)", budget_set: "Orçamento (regra)", notify: "Aviso (regra)" };
    for (const l of [...(a1 || []).map((x: any) => ({ ...x, by: x.user_email?.split("@")[0] })), ...(a2 || []).map((x: any) => ({ ...x, action: NAMES[x.action] || x.action, by: "regra" }))]) {
      const cur = lastUpd[l.entity_id];
      if (!cur || new Date(l.created_at) > new Date(cur.created_at)) lastUpd[l.entity_id] = { action: l.action.charAt(0).toUpperCase() + l.action.slice(1), detail: l.detail, snapshot: l.snapshot, created_at: l.created_at, by: l.by };
    }
  }

  const base: Record<string, string> = { p: r.p, ...(r.p === "custom" ? { from: r.from, to: r.to } : {}), ...(f as any), ...(st ? { st } : {}), ...(sp.q ? { q: sp.q } : {}) };
  const href = (o: Record<string, string | null>) => "/campanhas?" + new URLSearchParams(Object.fromEntries(Object.entries({ ...base, l: level, ...(parent ? { parent } : {}), ...o }).filter(([, v]) => v)) as any).toString();
  const child: Record<Level, Level | null> = { account: "campaign", campaign: "adset", adset: "ad", ad: null };
  const childHref: Record<string, string> = {};
  for (const x of rows) if (x.id && child[level]) childHref[x.id] = level === "account" ? href({ l: "campaign", account: x.id, parent: null }) : href({ l: child[level]!, parent: x.id });
  const ret = href({});
  const msg = sp.m ? decodeURIComponent(sp.m) : null;
  const approved = sales.filter((s) => s.status === "approved");
  const untracked = approved.filter((s) => !s.campaign_id && !s.campaign_name).length;
  const parentEnt = parent ? entities.find((e) => e.id === parent) : null;
  const campEnt = parentEnt?.level === "adset" ? entities.find((e) => e.id === parentEnt.campaign_id) : parentEnt;
  const lastSync = ws.meta_last_sync_at ? Math.round((Date.now() - new Date(ws.meta_last_sync_at).getTime()) / 60000) : null;
  const can = ctx.canEdit && !!ws.meta_access_token;
  const clean = (x: any) => { const { customers, ...rest } = x; return rest; };

  return (
    <>
      <div className="top">
        <div><h1>Meta</h1><div className="sub">Campanhas do Facebook e Instagram com as vendas reais do UtmCai</div></div>
      </div>
      {msg && <div className={"flash" + (msg.startsWith("e:") ? " e" : "")}>{msg.slice(msg.indexOf(":") + 1)}</div>}
      {!ws.meta_access_token && <div className="flash e">Ligue o Meta Ads em <Link className="pos" href="/config">Configurações</Link> para ver e gerir as campanhas.</div>}

      <div className="tabs" style={{ marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(4,1fr)" }}>
        {(Object.keys(LV) as Level[]).map((k) => (
          <Link key={k} className={"tab" + (k === level ? " on" : "")} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}
            href={"/campanhas?" + new URLSearchParams(Object.fromEntries(Object.entries({ ...base, l: k }).filter(([, v]) => v)) as any)}><Icon name={ICON[k]} size={15} />{LV[k]}</Link>
        ))}
      </div>

      <div className="statusbar">
        <span className={"pill " + (untracked ? "warn" : "ok")}>{approved.length === 0 ? "Sem vendas no período" : untracked ? `${untracked} venda(s) sem rastreio` : "✓ Todas as vendas trackeadas"}</span>
        <div className="inline">
          <span className="updated">{lastSync === null ? "Nunca sincronizado" : lastSync < 2 ? "Atualizado agora mesmo" : `Atualizado há ${lastSync < 60 ? lastSync + " min" : Math.round(lastSync / 60) + " h"}`}</span>
          {can && <form action={syncCampaigns}><input type="hidden" name="ws" value={ws.id} /><input type="hidden" name="ret" value={ret} /><button className="btn btn-sm">Atualizar</button></form>}
        </div>
      </div>

      <form method="get" action="/campanhas" className="filterbar" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 12, alignItems: "end", padding: "12px 16px" }}>
        {Object.entries({ ...base, l: level, ...(parent ? { parent } : {}) }).filter(([k]) => k !== "q" && k !== "st").map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)}
        <label className="fb-item">Nome {level === "account" ? "da conta" : level === "campaign" ? "da campanha" : level === "adset" ? "do conjunto" : "do anúncio"}<input className="input" name="q" placeholder="Filtrar por nome" defaultValue={sp.q || ""} /></label>
        <label className="fb-item">Status
          <AutoSelect name="st" defaultValue={st} options={[["", "Qualquer"], ["ACTIVE", "Ativas"], ["PAUSED", "Pausadas"], ["spend", "Com gasto ou venda"]]} />
        </label>
        <button className="btn btn-ghost btn-sm" style={{ display: "none" }}>Filtrar</button>
      </form>
      <FilterBar base="/campanhas" values={{ p: r.p, from: r.from, to: r.to, ...(f as any) }} keep={{ l: level, ...(parent ? { parent } : {}), ...(st ? { st } : {}), ...(sp.q ? { q: sp.q } : {}) }}
        filters={[
          { key: "account", label: "Conta de anúncio", options: opts.accounts.map((a) => ({ value: a, label: a.replace("act_", "") })) },
          { key: "product", label: "Produto", options: opts.products.map((v) => ({ value: v, label: v })) }
        ]} />

      {(parent || f.account) && (
        <div className="crumbs">
          <Link href={"/campanhas?" + new URLSearchParams({ p: r.p, l: "campaign" })}>Todas as campanhas</Link>
          {f.account && <><Icon name="chevron" size={12} /><span>Conta {f.account.replace("act_", "")}</span></>}
          {campEnt && <><Icon name="chevron" size={12} /><Link href={href({ l: "adset", parent: campEnt.id })}>{campEnt.name}</Link></>}
          {parentEnt?.level === "adset" && <><Icon name="chevron" size={12} /><span>{parentEnt.name}</span></>}
        </div>
      )}

      <MetaTable level={level as any} rows={rows.map(clean)} total={totalRow} currency={ws.currency} can={can} wsId={ws.id} ret={ret} tz={ws.timezone}
        childHref={childHref} lastUpd={lastUpd} toggleStatus={toggleStatus} changeBudget={changeBudget} duplicateEntity={duplicateEntity} />
    </>
  );
}
