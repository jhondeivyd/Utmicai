import { redirect } from "next/navigation";
import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { METRICS } from "@/lib/metrics";
import { RULE_METRICS, OPS, WINDOWS, ACTIONS, LEVELS, describeRule } from "@/lib/rules";
import ConfirmButton from "@/components/ConfirmButton";
import Icon from "@/components/Icon";
import { saveRule, toggleRule, deleteRule, testRule } from "./actions";

const TEMPLATES = [
  { name: "Pausar conjunto sem venda", level: "adset", time_window: "today", conditions: [{ metric: "spend", op: "gte", value: 60 }, { metric: "sales", op: "eq", value: 0 }], action: "pause", cooldown_hours: 12 },
  { name: "Pausar anúncio com ROAS baixo", level: "ad", time_window: "last_3d", conditions: [{ metric: "spend", op: "gte", value: 100 }, { metric: "roas", op: "lt", value: 1 }], action: "pause", cooldown_hours: 24 },
  { name: "Escalar campanha lucrativa (+20%)", level: "campaign", time_window: "yesterday", conditions: [{ metric: "roas", op: "gte", value: 2 }, { metric: "sales", op: "gte", value: 3 }], action: "budget_up", action_value: 20, cooldown_hours: 24 },
  { name: "Avisar CPA alto", level: "adset", time_window: "today", conditions: [{ metric: "cpa", op: "gt", value: 80 }], action: "notify", cooldown_hours: 6 }
];

export default async function Regras({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return null;
  if (!ctx.canEdit) redirect("/dashboard");
  const ws = ctx.ws;
  const db = admin();
  const [{ data: rules }, { data: logs }] = await Promise.all([
    db.from("rules").select("*").eq("workspace_id", ws.id).order("created_at"),
    db.from("rule_logs").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(30)
  ]);
  const tpl = sp.tpl !== undefined ? TEMPLATES[Number(sp.tpl)] : null;
  const editing: any = sp.edit ? (rules || []).find((r: any) => r.id === sp.edit) : tpl ? { ...tpl, dry_run: true, notify: true } : null;
  const f: any = editing || { level: "adset", time_window: "today", conditions: [], action: "pause", cooldown_hours: 6, notify: true, dry_run: true };
  const conds = [...(f.conditions || []), {}, {}, {}, {}].slice(0, 4);
  const msg = sp.m ? decodeURIComponent(sp.m) : null;
  const H = <input type="hidden" name="ws" value={ws.id} />;
  const ruleName = (id: string) => (rules || []).find((r: any) => r.id === id)?.name || "—";

  return (
    <>
      <div className="top">
        <div><h1>Regras automáticas</h1><div className="sub">O UtmCai verifica as regras a cada 15 minutos com as vendas reais e age no Meta por si.</div></div>
      </div>
      {msg && <div className={"flash" + (msg.startsWith("e:") ? " e" : "")}>{msg.slice(msg.indexOf(":") + 1)}</div>}
      {!ws.meta_access_token && <div className="flash e">Ligue o Meta Ads em <a className="pos" href="/config">Configurações</a> antes de criar regras.</div>}

      <div className="grid g2">
        <div className="card" style={{ padding: 0 }}>
          <div className="top" style={{ padding: "16px 18px 0" }}><h2 style={{ margin: 0 }}>As suas regras</h2><a className="btn btn-sm" href="/regras?new=1#form">+ Nova regra</a></div>
          <div className="tbl" style={{ marginTop: 12 }}>
            <table>
              <tbody>
                {!(rules || []).length && <tr><td className="empty">Ainda não há regras. Comece por um modelo ao lado.</td></tr>}
                {(rules || []).map((r: any) => (
                  <tr key={r.id}>
                    <td style={{ width: 50 }}>
                      <form action={toggleRule}>{H}<input type="hidden" name="id" value={r.id} /><input type="hidden" name="to" value={r.active ? "off" : "on"} />
                        <button className={"switch" + (r.active ? " on" : "")} title={r.active ? "Desligar" : "Ligar"} /></form>
                    </td>
                    <td className="name">
                      <b>{r.name}</b> {r.dry_run && <span className="badge b-pending">simulação</span>}
                      <div className="note">{LEVELS[r.level]} · {describeRule(r, ws.currency)}{r.cooldown_hours ? ` · espera ${r.cooldown_hours}h entre ações` : ""}</div>
                      <div className="note">{r.last_run_at ? "última verificação " + new Date(r.last_run_at).toLocaleString("pt-BR", { timeZone: ws.timezone, dateStyle: "short", timeStyle: "short" }) : "ainda não correu"}</div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="inline">
                        <form action={testRule}>{H}<input type="hidden" name="id" value={r.id} /><button className="icon-btn" title="Simular agora (não muda nada no Meta)"><Icon name="play" size={14} /></button></form>
                        <a className="btn btn-ghost btn-sm" href={`/regras?edit=${r.id}#form`}>Editar</a>
                        <form action={deleteRule}>{H}<input type="hidden" name="id" value={r.id} /><ConfirmButton className="icon-btn" title="Apagar" msg={`Apagar a regra "${r.name}"?`}><Icon name="trash" size={14} /></ConfirmButton></form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>Modelos prontos</h2>
          <div className="grid">
            {TEMPLATES.map((t, i) => (
              <a key={i} href={`/regras?tpl=${i}#form`} className="card" style={{ padding: 12, boxShadow: "none" }}>
                <b>{t.name}</b><div className="note">{describeRule(t, ws.currency)}</div>
              </a>
            ))}
          </div>
        </div>
      </div>

      <form id="form" action={saveRule} className="card form" style={{ marginTop: 14 }}>
        {H}{editing?.id && <input type="hidden" name="id" value={editing.id} />}
        <h2>{editing?.id ? `Editar: ${editing.name}` : "Nova regra"}</h2>
        <div className="row3">
          <label>Nome<input className="input" name="name" defaultValue={f.name || ""} placeholder="Ex.: Pausar conjunto sem venda" required /></label>
          <label>Aplicar a<select className="input" name="level" defaultValue={f.level}>{Object.entries(LEVELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label>Período analisado<select className="input" name="time_window" defaultValue={f.time_window}>{Object.entries(WINDOWS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        </div>
        <div>
          <div className="note" style={{ marginBottom: 6 }}>Condições (todas têm de ser verdadeiras). Percentagens em %: CTR 1,5 = 1,5%. ROI 20 = 20%.</div>
          <div className="grid" style={{ gap: 8 }}>
            {conds.map((c: any, i: number) => (
              <div key={i} className="row3" style={{ gridTemplateColumns: "1.4fr .7fr 1fr" }}>
                <select className="input" name={`c${i}_metric`} defaultValue={c.metric || ""}><option value="">{i ? "— (opcional)" : "Escolha a métrica"}</option>{RULE_METRICS.map((k) => <option key={k} value={k}>{METRICS[k].label}</option>)}</select>
                <select className="input" name={`c${i}_op`} defaultValue={c.op || "gte"}>{Object.entries(OPS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <input className="input" name={`c${i}_value`} defaultValue={c.value ?? ""} placeholder="valor" inputMode="decimal" />
              </div>
            ))}
          </div>
        </div>
        <div className="row3">
          <label>Então<select className="input" name="action" defaultValue={f.action}>{Object.entries(ACTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label>Valor (só para orçamento)<input className="input" name="action_value" defaultValue={f.action_value ?? ""} placeholder="ex.: 20 (%) ou 150 (valor)" inputMode="decimal" /></label>
          <label>Esperar entre ações (horas)<input className="input" name="cooldown_hours" defaultValue={f.cooldown_hours ?? 6} inputMode="numeric" /></label>
        </div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <label className="inline" style={{ display: "inline-flex" }}><input type="checkbox" name="dry_run" defaultChecked={!!f.dry_run} /> Modo simulação (só regista e avisa, não mexe no Meta)</label>
          <label className="inline" style={{ display: "inline-flex" }}><input type="checkbox" name="notify" defaultChecked={f.notify !== false} /> Avisar no Telegram</label>
        </div>
        <div className="inline"><button className="btn">{editing?.id ? "Guardar alterações" : "Criar regra"}</button>{editing && <a className="btn btn-ghost" href="/regras">Cancelar</a>}</div>
        <div className="note">Dica: crie a regra em modo simulação, veja no histórico o que ela faria durante um dia e só depois desligue a simulação.</div>
      </form>

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
    </>
  );
}
