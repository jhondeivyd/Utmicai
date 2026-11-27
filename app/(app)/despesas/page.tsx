import Link from "next/link";
import { redirect } from "next/navigation";
import NoWs from "@/components/NoWs";
import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { fmt } from "@/lib/metrics";
import { resolveRange, todayIn } from "@/lib/dates";
import Icon from "@/components/Icon";
import ConfirmButton from "@/components/ConfirmButton";
import AutoSelect from "@/components/AutoSelect";
import { saveExpense, deleteExpense } from "./actions";

const CATEGORIES = ["Ferramentas", "Equipa", "Criativos", "Plataformas", "Impostos", "Contabilidade", "Infraestrutura", "Outros"];
const PERIODS: [string, string][] = [["month", "Este mês"], ["lastmonth", "Mês passado"], ["7d", "Últimos 7 dias"], ["30d", "Últimos 30 dias"], ["90d", "Últimos 90 dias"]];

export default async function Despesas({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return <NoWs />;
  if (!ctx.canEdit) redirect("/dashboard");
  const ws = ctx.ws;
  const p = PERIODS.some(([k]) => k === sp.p) ? sp.p : "month";
  const r = resolveRange({ p }, ws.timezone);
  let q = admin().from("expenses").select("*").eq("workspace_id", ws.id).order("date", { ascending: false }).limit(500);
  q = q.or(`and(date.gte.${r.from},date.lte.${r.to}),kind.eq.mensal`);
  if (sp.cat) q = q.eq("category", sp.cat);
  if (sp.q) q = q.ilike("description", `%${sp.q.replace(/[%,()]/g, "")}%`);
  const { data: rows } = await q;
  const total = (rows || []).reduce((a: number, x: any) => a + (x.kind === "mensal" && x.date > r.to ? 0 : Number(x.amount) || 0), 0);
  const editing: any = sp.edit === "new" ? { date: todayIn(ws.timezone), kind: "unica", category: "Outros" } : sp.edit ? (rows || []).find((x: any) => x.id === sp.edit) : null;
  const msg = sp.m ? decodeURIComponent(sp.m) : null;
  const H = <input type="hidden" name="ws" value={ws.id} />;
  const m = (v: number) => fmt(v, "money", ws.currency);
  const keep = (o: Record<string, string>) => "/despesas?" + new URLSearchParams(Object.fromEntries(Object.entries({ p, cat: sp.cat || "", q: sp.q || "", ...o }).filter(([, v]) => v)));

  return (
    <>
      {msg && <div className={"flash" + (msg.startsWith("e:") ? " e" : "")}>{msg.slice(msg.indexOf(":") + 1)}</div>}
      <div className="card">
        <div className="card-h"><div><h2>Despesas</h2><div className="note">Use esta tela para adicionar despesas personalizadas (ferramentas, equipa, criativos…). Entram no lucro do Resumo.</div></div>
          <Link className="btn" href={keep({ edit: "new" })}>Adicionar gasto</Link></div>
        <form method="get" action="/despesas" className="fb-row" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 12, marginTop: 14 }}>
          <label>Descrição<input className="input" name="q" defaultValue={sp.q || ""} placeholder="Procurar" /></label>
          <label>Categoria<AutoSelect name="cat" defaultValue={sp.cat || ""} options={[["", "Qualquer"], ...CATEGORIES.map((c) => [c, c] as [string, string])]} /></label>
          <label>Período de visualização<AutoSelect name="p" defaultValue={p} options={PERIODS} /></label>
        </form>
      </div>
      <div className="card tbl" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th className="n">Valor</th><th style={{ width: 90 }}>Mais</th></tr></thead>
          <tbody>
            {!(rows || []).length && <tr><td colSpan={6} className="empty">Nenhuma despesa neste período.</td></tr>}
            {(rows || []).map((x: any) => (
              <tr key={x.id}>
                <td>{x.date.split("-").reverse().join("/")}</td>
                <td>{x.kind === "mensal" ? "Mensal (recorrente)" : "Única"}</td>
                <td>{x.category}</td>
                <td className="name">{x.description || "—"}</td>
                <td className="n">{m(Number(x.amount))}</td>
                <td><div className="dash-act">
                  <Link className="icon-btn" href={keep({ edit: x.id })} title="Editar"><Icon name="edit" size={15} /></Link>
                  <form action={deleteExpense}>{H}<input type="hidden" name="id" value={x.id} /><ConfirmButton className="icon-btn" title="Apagar" msg="Apagar esta despesa?"><Icon name="trash" size={15} /></ConfirmButton></form>
                </div></td>
              </tr>
            ))}
          </tbody>
          {(rows || []).length > 0 && <tfoot><tr><td colSpan={4}><b>Total listado</b></td><td className="n"><b>{m(total)}</b></td><td /></tr></tfoot>}
        </table>
      </div>

      {editing && (
        <>
          <Link className="drawer-bg" href={keep({})} aria-label="Fechar" />
          <form action={saveExpense} className="drawer form">
            {H}{editing.id && <input type="hidden" name="id" value={editing.id} />}
            <div className="card-h"><h2>{editing.id ? "Editar gasto" : "Adicionar gasto"}</h2><Link className="icon-btn" href={keep({})}><Icon name="close" size={15} /></Link></div>
            <label>Data<input className="input" type="date" name="date" defaultValue={editing.date} required /></label>
            <label>Tipo<select className="input" name="kind" defaultValue={editing.kind}><option value="unica">Única</option><option value="mensal">Mensal (repete todos os meses a partir desta data)</option></select></label>
            <label>Categoria<select className="input" name="category" defaultValue={editing.category}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label>Descrição<input className="input" name="description" defaultValue={editing.description || ""} placeholder="Ex.: Assinatura da ferramenta X" /></label>
            <label>Valor ({ws.currency})<input className="input" name="amount" defaultValue={editing.amount ?? ""} placeholder="0,00" inputMode="decimal" required /></label>
            <button className="btn" style={{ justifyContent: "center" }}>Guardar</button>
          </form>
        </>
      )}
    </>
  );
}
