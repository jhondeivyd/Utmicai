import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { TIMEZONES, CURRENCIES, VIEW_TYPES, tzLabel, curLabel, viewLabel } from "@/lib/options";
import Icon from "@/components/Icon";
import ConfirmButton from "@/components/ConfirmButton";
import { saveDashboard, deleteDashboard, addCollaborator, removeCollaborator } from "./actions";

const YN = ({ name, value }: { name: string; value: boolean }) => (
  <select className="input" name={name} defaultValue={value ? "1" : "0"}><option value="1">Habilitado</option><option value="0">Não habilitado</option></select>
);

export default async function Avancado({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const db = admin();
  const ids = ctx.workspaces.map((w) => w.id);
  const [{ data: wss }, { data: mem }] = await Promise.all([
    ids.length ? db.from("workspaces").select("id,name,description,timezone,currency,view_type,count_shipping,count_interest,meta_cache").in("id", ids).order("created_at") : Promise.resolve({ data: [] as any[] }),
    ids.length ? db.from("members").select("workspace_id,user_id,role").in("workspace_id", ids) : Promise.resolve({ data: [] as any[] })
  ]);
  const uids = [...new Set((mem || []).map((m: any) => m.user_id))];
  const { data: profs } = uids.length ? await db.from("profiles").select("user_id,email").in("user_id", uids) : { data: [] as any[] };
  const email = (u: string) => (profs || []).find((p: any) => p.user_id === u)?.email || u.slice(0, 8);
  const manageable = ctx.workspaces.filter((w) => ctx.isAdmin || w.role === "owner");
  const editing: any = sp.edit ? (wss || []).find((w: any) => w.id === sp.edit) : sp.new && ctx.isAdmin ? { timezone: "Europe/Lisbon", currency: "EUR", view_type: "normal", count_interest: true, meta_cache: true } : null;
  const msg = sp.m ? decodeURIComponent(sp.m) : null;

  return (
    <>
      {msg && <div className={"flash" + (msg.startsWith("e:") ? " e" : "")}>{msg.slice(msg.indexOf(":") + 1)}</div>}
      <div className="grid g-adv">
        <div className="card">
          <div className="card-h"><h2>Dashboards</h2></div>
          <p className="note">Gerencie os seus dashboards. Cada um tem o seu fuso horário, moeda e ligações.</p>
          <div className="dash-list">
            {(wss || []).map((w: any) => (
              <div key={w.id} className={"dash-card" + (w.id === ctx.ws?.id ? " cur" : "")}>
                <div>
                  <b>{w.name}</b>
                  {w.description && <div className="note">{w.description}</div>}
                  <div className="dash-meta">
                    <span>{viewLabel(w.view_type)}</span><span>{tzLabel(w.timezone)}</span><span>{curLabel(w.currency)}</span>
                    <span>Contabilizar juros: {w.count_interest ? "habilitado" : "não habilitado"}</span>
                  </div>
                </div>
                <div className="dash-act">
                  <a className="btn btn-ghost btn-sm" href={`/api/ws?id=${w.id}&to=/dashboard`}>Abrir</a>
                  {manageable.some((m) => m.id === w.id) && <a className="icon-btn" title="Editar" href={`/avancado?edit=${w.id}`}><Icon name="edit" size={15} /></a>}
                  {ctx.isAdmin && (
                    <form action={deleteDashboard}><input type="hidden" name="id" value={w.id} />
                      <ConfirmButton className="icon-btn" title="Apagar" msg={`Apagar o dashboard "${w.name}" e TODOS os dados dele (vendas, campanhas, regras)? Isto não se pode desfazer.`}><Icon name="trash" size={15} /></ConfirmButton>
                    </form>
                  )}
                </div>
              </div>
            ))}
            {!(wss || []).length && <p className="mut">Ainda não há dashboards.</p>}
          </div>
          {ctx.isAdmin && <a className="btn" href="/avancado?new=1" style={{ marginTop: 14 }}>Novo Dashboard</a>}
        </div>

        <div className="card">
          <div className="card-h"><h2>Colaboradores</h2></div>
          <p className="note">Dê acesso a clientes ou à sua equipa. “Ver” só consulta; “Ver e configurar” também mexe em campanhas, regras e ligações.</p>
          {manageable.length > 0 ? (
            <form action={addCollaborator} className="form" style={{ marginTop: 10 }}>
              <div className="row2">
                <label>E-mail<input className="input" name="email" type="email" required /></label>
                <label>Senha inicial <span className="note">(só se for um utilizador novo)</span><input className="input" name="password" type="text" autoComplete="off" /></label>
              </div>
              <div className="row2">
                <label>Dashboard<select className="input" name="ws" defaultValue={ctx.ws?.id}>{manageable.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
                <label>Permissão<select className="input" name="role"><option value="viewer">Ver</option><option value="owner">Ver e configurar</option></select></label>
              </div>
              <div><button className="btn">Novo Colaborador</button></div>
            </form>
          ) : <p className="mut">Só o dono do dashboard pode adicionar colaboradores.</p>}
          <div className="collab-list">
            {(mem || []).map((m: any) => (
              <form key={m.workspace_id + m.user_id} action={removeCollaborator} className="collab">
                <input type="hidden" name="ws" value={m.workspace_id} /><input type="hidden" name="user" value={m.user_id} />
                <div><b>{email(m.user_id)}</b><div className="note">{(wss || []).find((w: any) => w.id === m.workspace_id)?.name} · {m.role === "owner" ? "Ver e configurar" : "Ver"}</div></div>
                {manageable.some((w) => w.id === m.workspace_id) && <ConfirmButton className="btn btn-ghost btn-sm" msg="Remover o acesso deste colaborador?">Remover</ConfirmButton>}
              </form>
            ))}
          </div>
        </div>
      </div>

      {editing && (
        <>
          <a className="drawer-bg" href="/avancado" aria-label="Fechar" />
          <form action={saveDashboard} className="drawer form">
            <div className="card-h"><h2>{editing.id ? "Editar Dashboard" : "Novo Dashboard"}</h2><a className="icon-btn" href="/avancado"><Icon name="close" size={15} /></a></div>
            {editing.id && <input type="hidden" name="id" value={editing.id} />}
            <label>Nome<input className="input" name="name" defaultValue={editing.name || ""} placeholder="Ex.: Loja Itália" required /></label>
            <label>Descrição<input className="input" name="description" defaultValue={editing.description || ""} placeholder="Ex.: Contém apenas as vendas do Produto X" /></label>
            <label>Tipo de Visualização
              <select className="input" name="view_type" defaultValue={editing.view_type}>{VIEW_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <span className="note">Normal: mostra o faturamento líquido (depois de taxas). Total: mostra o valor bruto pago pelo cliente.</span>
            </label>
            <label>Fuso horário
              <select className="input" name="timezone" defaultValue={editing.timezone}>{TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <span className="note">Use o mesmo fuso da conta de anúncios do Meta, para “hoje” bater certo.</span>
            </label>
            <label>Moeda da conta
              <select className="input" name="currency" defaultValue={editing.currency}>{CURRENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <label>Contabilizar frete<YN name="count_shipping" value={!!editing.count_shipping} /></label>
            <label>Contabilizar juros<YN name="count_interest" value={!!editing.count_interest} /></label>
            <label>Cache da Meta<YN name="meta_cache" value={!!editing.meta_cache} />
              <span className="note">Habilitado: o painel abre mais rápido usando a última sincronização (atualiza a cada hora ou no botão Atualizar).</span></label>
            <button className="btn" style={{ justifyContent: "center" }}>Salvar Dashboard</button>
          </form>
        </>
      )}
    </>
  );
}
