import NoWs from "@/components/NoWs";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { METRICS, fmt } from "@/lib/metrics";
import { RULE_METRICS, OPS, WINDOWS, ACTIONS, LEVELS, FREQS } from "@/lib/rules";
import ConfirmButton from "@/components/ConfirmButton";
import Icon from "@/components/Icon";
import { saveRule, toggleRule, deleteRule, testRule } from "./actions";

const TEMPLATES = [
  { name: "Pausar conjunto sem venda", level: "adset", time_window: "today", conditions: [{ metric: "spend", op: "gte", value: 60 }, { metric: "sales", op: "eq", value: 0 }], action: "pause", frequency_min: 15 },
  { name: "Diminuir orçamento — CPA alto", level: "campaign", time_window: "today", conditions: [{ metric: "cpa", op: "gte", value: 15 }], action: "budget_down", action_value: 20, frequency_min: 15, daily_limit: 2 },
  { name: "Subir 30% — CPA baixo", level: "campaign", time_window: "today", conditions: [{ metric: "cpa", op: "lt", value: 7 }, { metric: "sales", op: "gte", value: 2 }], action: "budget_up", action_value: 30, frequency_min: 120, daily_limit: 3 },
  { name: "Pausar anúncio com ROAS baixo", level: "ad", time_window: "last_3d", conditions: [{ metric: "spend", op: "gte", value: 100 }, { metric: "roas", op: "lt", value: 1 }], action: "pause", frequency_min: 60 },
  { name: "Reativar campanha lucrativa de manhã", level: "campaign", time_window: "yesterday", conditions: [{ metric: "roi", op: "gte", value: 30 }], action: "activate", frequency_min: 1440, hour_from: 0, hour_to: 2 },
  { name: "Avisar quando o lucro do dia ficar negativo", level: "campaign", time_window: "today", conditions: [{ metric: "profit", op: "lt", value: 0 }, { metric: "spend", op: "gte", value: 30 }], action: "notify", frequency_min: 60, daily_limit: 1 }
];
const ACT_LABEL: Record<string, string> = { activate: "Ativar", pause: "Pausar", budget_up: "Aumentar orçamento", budget_down: "Diminuir orçamento", budget_set: "Definir orçamento", notify: "Só avisar no Telegram" };
const LV_ACTIVE: Record<string, string> = { campaign: "Campanhas ativas", adset: "Conjuntos ativos", ad: "Anúncios ativos" };
const LV_ON: Record<string, string> = { campaign: "Campanhas", adset: "Conjuntos", ad: "Anúncios" };

export default async function Regras({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return <NoWs />;
  if (!ctx.canEdit) redirect("/dashboard");
  const ws = ctx.ws;
  const db = admin();
  const [{ data: rules }, { data: logs }, { data: prodRows }] = await Promise.all([
    db.from("rules").select("*").eq("workspace_id", ws.id).order("created_at"),
    db.from("rule_logs").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(30),
    db.from("sales").select("product_name").eq("workspace_id", ws.id).not("product_name", "is", null).order("created_at", { ascending: false }).limit(1000)
  ]);
  const products = [...new Set((prodRows || []).map((x: any) => x.product_name))].sort();
  const tpl = sp.tpl !== undefined ? TEMPLATES[Number(sp.tpl)] : null;
  const editing: any = sp.edit ? (rules || []).find((r: any) => r.id === sp.edit) : tpl ? { ...tpl, dry_run: true, notify: true } : sp.new ? { level: "campaign", time_window: "today", conditions: [], action: "pause", frequency_min: 15, notify: true, dry_run: true } : null;
  const conds = editing ? [...(editing.conditions || []), {}, {}, {}, {}].slice(0, 4) : [];
  const msg = sp.m ? decodeURIComponent(sp.m) : null;
  const H = <input type="hidden" name="ws" value={ws.id} />;
  const ruleName = (id: string) => (rules || []).find((r: any) => r.id === id)?.name || "—";
  const condTxt = (r: any) => (r.conditions || []).map((c: any) => {
    const m = METRICS[c.metric];
    const val = m?.fmt === "pct" ? `${c.value}%` : m?.fmt === "money" ? fmt(Number(c.value), "money", ws.currency) : c.value;
    return `${m?.label || c.metric} ${OPS[c.op] === "≥" ? "maior ou igual a" : OPS[c.op] === ">" ? "maior que" : OPS[c.op] === "≤" ? "menor ou igual a" : OPS[c.op] === "<" ? "menor que" : "igual a"} ${val}`;
  }).join(" e ");
  const actTxt = (r: any) => {
    const where = LV_ON[r.level]?.slice(0, -1).toLowerCase().replace("conjunto", "conjuntos").replace("campanha", "campanhas").replace("anúncio", "anúncios");
    if (r.action.startsWith("budget")) return `${ACT_LABEL[r.action]} em ${where}${r.action === "budget_set" ? ` para ${fmt(Number(r.action_value), "money", ws.currency)}` : ` ${r.action_value}%`}`;
    return `${ACT_LABEL[r.action]} ${r.action === "notify" ? "" : where}`;
  };
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <>
      {msg && <div className={"flash" + (msg.startsWith("e:") ? " e" : "")}>{msg.slice(msg.indexOf(":") + 1)}</div>}
      {!ws.meta_access_token && <div className="flash e">Ligue o Meta Ads em <a className="pos" href="/integracoes">Integrações</a> antes de criar regras.</div>}
      <div className="subtabs"><a className="on" href="/regras"><Icon name="meta" size={16} />Meta</a></div>

      <div className="card tbl" style={{ padding: 0 }}>
        <div className="card-h" style={{ padding: "14px 16px" }}>
          <h2>Regras <span className="info" title="O UtmCai verifica as regras com as vendas reais e age no Meta por si">ⓘ</span></h2>
          <div className="inline"><a className="btn btn-ghost btn-sm" href="/regras?mais=1">Mais</a><a className="btn btn-sm" href="/regras?new=1">Criar regra</a></div>
        </div>
        <table>
          <thead><tr><th style={{ width: 70 }}>Status</th><th>Nome e produto</th><th>Aplicada a</th><th>Ação e condição</th><th>Frequência e período</th><th style={{ width: 120 }}>Mais</th></tr></thead>
          <tbody>
            {!(rules || []).length && <tr><td colSpan={6} className="empty">Ainda não há regras. Clique em “Criar regra” ou veja modelos em “Mais”.</td></tr>}
            {(rules || []).map((r: any) => (
              <tr key={r.id}>
                <td><form action={toggleRule}>{H}<input type="hidden" name="id" value={r.id} /><input type="hidden" name="to" value={r.active ? "off" : "on"} />
                  <button className={"switch" + (r.active ? " on" : "")} title={r.active ? "Desligar" : "Ligar"} /></form></td>
                <td className="name"><b>{r.name}</b> {r.dry_run && <span className="badge b-pending">simulação</span>}<div className="note">{r.product || "Todos os produtos"}</div></td>
                <td>{r.action === "activate" ? LV_ON[r.level] + " pausad" + (r.level === "campaign" ? "as" : "os") : LV_ACTIVE[r.level]}<div className="note">{r.name_filter ? `Nome contém: ${r.name_filter}` : "Todas as contas de anúncio"}</div></td>
                <td>{actTxt(r)}<div className="note">Se {condTxt(r)}{r.cond_level === "campaign" && r.level !== "campaign" ? " (na campanha)" : ""}</div></td>
                <td>{FREQS[String(r.frequency_min || 15)] || `A cada ${r.frequency_min} min`}
                  <div className="note">Período: {WINDOWS[r.time_window]}{r.hour_from != null ? ` · das ${r.hour_from}h às ${r.hour_to}h` : ""}{r.daily_limit ? ` · máx. ${r.daily_limit}/dia` : ""}</div></td>
                <td><div className="inline">
                  <form action={testRule}>{H}<input type="hidden" name="id" value={r.id} /><button className="icon-btn" title="Simular agora (não muda nada no Meta)"><Icon name="play" size={14} /></button></form>
                  <a className="icon-btn" href={`/regras?edit=${r.id}`} title="Editar"><Icon name="edit" size={14} /></a>
                  <form action={deleteRule}>{H}<input type="hidden" name="id" value={r.id} /><ConfirmButton className="icon-btn" title="Apagar" msg={`Apagar a regra "${r.name}"?`}><Icon name="trash" size={14} /></ConfirmButton></form>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Histórico</h2>
        {!(logs || []).length && <div className="empty">Nenhuma ação ainda.</div>}
        <table><tbody>
          {(logs || []).map((l: any) => (
            <tr key={l.id}>
              <td className="mut">{new Date(l.created_at).toLocaleString("pt-BR", { timeZone: ws.timezone, dateStyle: "short", timeStyle: "short" })}</td>
              <td>{ruleName(l.rule_id)}</td><td className="name">{l.entity_name}</td>
              <td className={l.ok ? (l.dry_run ? "warn" : "ok") : "err"}>{l.detail}</td>
            </tr>
          ))}
        </tbody></table>
      </div>

      {sp.mais && (
        <>
          <a className="drawer-bg" href="/regras" aria-label="Fechar" />
          <div className="drawer form">
            <div className="card-h"><h2>Modelos de regra</h2><a className="icon-btn" href="/regras"><Icon name="close" size={15} /></a></div>
            <p className="note">Escolha um modelo para começar. Abre em modo simulação para poder ver o que faria antes de mexer no Meta.</p>
            {TEMPLATES.map((t, i) => (
              <a key={i} href={`/regras?tpl=${i}`} className="int-row" style={{ display: "block" }}>
                <b>{t.name}</b><div className="note">{actTxt(t)} · se {condTxt(t)} · {FREQS[String(t.frequency_min)]}</div>
              </a>
            ))}
          </div>
        </>
      )}

      {editing && (
        <>
          <a className="drawer-bg" href="/regras" aria-label="Fechar" />
          <form action={saveRule} className="drawer form" style={{ width: "min(560px,100vw)" }}>
            {H}{editing.id && <input type="hidden" name="id" value={editing.id} />}
            <div className="card-h"><div><h2>{editing.id ? "Editar regra" : "Criar regra personalizada"}</h2><div className="note">Atualize campanhas, conjuntos ou anúncios por meio de regras automatizadas.</div></div>
              <a className="icon-btn" href="/regras"><Icon name="close" size={15} /></a></div>
            <label>Nome da regra<input className="input" name="name" defaultValue={editing.name || ""} placeholder="Ex.: CPA + 15 Euros" required /></label>
            <label>Aplicar regra a<select className="input" name="level" defaultValue={editing.level}>{Object.keys(LEVELS).map((k) => <option key={k} value={k}>{LV_ACTIVE[k]}</option>)}</select>
              <span className="note">Com a ação “Ativar”, a regra procura os que estão pausados.</span></label>
            <label>Filtrar por nome<input className="input" name="name_filter" defaultValue={editing.name_filter || ""} placeholder="Qualquer — ou parte do nome, ex.: [ESCALA], TESTE" />
              <span className="note">Vários separados por vírgula. Vazio = todos.</span></label>
            <label>Produto<select className="input" name="product" defaultValue={editing.product || ""}><option value="">Qualquer</option>{products.map((p) => <option key={p}>{p}</option>)}</select>
              <span className="note">Conta só as vendas deste produto nas condições.</span></label>
            <div className="row2">
              <label>Ação<select className="input" name="action" defaultValue={editing.action}>{Object.keys(ACTIONS).map((k) => <option key={k} value={k}>{ACT_LABEL[k]}</option>)}</select></label>
              <label>Valor (para orçamento)<input className="input" name="action_value" defaultValue={editing.action_value ?? ""} placeholder="20 (%) ou 150 (valor)" inputMode="decimal" /></label>
            </div>
            <label>Nível das Condições<select className="input" name="cond_level" defaultValue={editing.cond_level || "object"}>
              <option value="object">Nível do Objeto (campanha/conjunto/anúncio)</option><option value="campaign">Nível da Campanha</option></select></label>
            <div>
              <div className="note" style={{ marginBottom: 6 }}>Condições — todas têm de ser verdadeiras. Percentagens em %: CTR 1,5 = 1,5%; ROI 20 = 20%.</div>
              <div className="grid" style={{ gap: 8 }}>
                {conds.map((c: any, i: number) => (
                  <div key={i} className="row3" style={{ gridTemplateColumns: "1.4fr .8fr 1fr" }}>
                    <select className="input" name={`c${i}_metric`} defaultValue={c.metric || ""}><option value="">{i ? "+ (opcional)" : "Escolha a métrica"}</option>{RULE_METRICS.map((k) => <option key={k} value={k}>{METRICS[k].label}</option>)}</select>
                    <select className="input" name={`c${i}_op`} defaultValue={c.op || "gte"}>{Object.entries(OPS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    <input className="input" name={`c${i}_value`} defaultValue={c.value ?? ""} placeholder="valor" inputMode="decimal" />
                  </div>
                ))}
              </div>
            </div>
            <label>Período de Cálculo<select className="input" name="time_window" defaultValue={editing.time_window}>{Object.entries(WINDOWS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label>Frequência<select className="input" name="frequency_min" defaultValue={String(editing.frequency_min || 15)}>{Object.entries(FREQS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <span className="note">De quanto em quanto tempo a regra é verificada (e o tempo mínimo entre duas ações no mesmo item).</span></label>
            <div className="row2">
              <label>Intervalo de Execução — das<select className="input" name="hour_from" defaultValue={editing.hour_from ?? ""}><option value="">Qualquer hora</option>{hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></label>
              <label>até às<select className="input" name="hour_to" defaultValue={editing.hour_to ?? ""}><option value="">Qualquer hora</option>{hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:59</option>)}</select></label>
            </div>
            <label>Limite de Execuções Diária<select className="input" name="daily_limit" defaultValue={editing.daily_limit ?? ""}><option value="">Sem Limite</option>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <label className="inline" style={{ display: "inline-flex" }}><input type="checkbox" name="dry_run" defaultChecked={!!editing.dry_run} /> Modo simulação (só regista e avisa, não mexe no Meta)</label>
            <label className="inline" style={{ display: "inline-flex" }}><input type="checkbox" name="notify" defaultChecked={editing.notify !== false} /> Avisar no Telegram quando agir</label>
            <div className="inline" style={{ justifyContent: "flex-end" }}><a className="btn btn-ghost" href="/regras">Cancelar</a><button className="btn">Salvar</button></div>
          </form>
        </>
      )}
    </>
  );
}
