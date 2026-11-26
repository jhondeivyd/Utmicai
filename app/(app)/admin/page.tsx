import { redirect } from "next/navigation";
import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { createWorkspace, addUser, removeMember } from "./actions";

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.isAdmin) redirect("/dashboard");
  const db = admin();
  const { data: wss } = await db.from("workspaces").select("id,name,currency,created_at").order("name");
  const { data: mem } = await db.from("members").select("workspace_id,user_id,role");
  const { data: profs } = await db.from("profiles").select("user_id,email");
  const email = (id: string) => profs?.find((p) => p.user_id === id)?.email || id;
  const msg = sp.m ? decodeURIComponent(sp.m) : null;

  return (
    <>
      <div className="top"><h1>Admin</h1></div>
      {msg && <div className={"flash" + (msg.startsWith("e:") ? " e" : "")}>{msg.slice(msg.indexOf(":") + 1)}</div>}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <form action={createWorkspace} className="card form">
          <h2>Nova workspace (cliente / operação)</h2>
          <label>Nome<input className="input" name="name" required /></label>
          <div className="row2">
            <label>Moeda<input className="input" name="currency" defaultValue="BRL" /></label>
            <label>Fuso<input className="input" name="timezone" defaultValue="America/Sao_Paulo" /></label>
          </div>
          <div><button className="btn">Criar</button></div>
        </form>
        <form action={addUser} className="card form">
          <h2>Dar acesso a um utilizador</h2>
          <label>E-mail<input className="input" name="email" type="email" required /></label>
          <label>Senha (só para utilizador novo)<input className="input" name="password" type="text" autoComplete="off" /></label>
          <div className="row2">
            <label>Workspace<select className="input" name="ws">{(wss || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
            <label>Permissão<select className="input" name="role"><option value="viewer">Ver dashboard</option><option value="owner">Ver e configurar</option></select></label>
          </div>
          <div><button className="btn">Adicionar</button></div>
        </form>
      </div>
      <div className="card tbl" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Workspace</th><th>Moeda</th><th>Utilizadores</th></tr></thead>
          <tbody>
            {(wss || []).map((w) => (
              <tr key={w.id}>
                <td>{w.name}</td><td>{w.currency}</td>
                <td className="name">
                  {(mem || []).filter((m) => m.workspace_id === w.id).map((m) => (
                    <form key={m.user_id} action={removeMember} style={{ display: "inline-flex", gap: 4, marginRight: 10, alignItems: "center" }}>
                      <input type="hidden" name="ws" value={w.id} /><input type="hidden" name="user" value={m.user_id} />
                      {email(m.user_id)} <span className="mut">({m.role === "owner" ? "configura" : "vê"})</span>
                      <button className="btn btn-ghost btn-sm" title="Remover acesso">×</button>
                    </form>
                  ))}
                  {!(mem || []).some((m) => m.workspace_id === w.id) && <span className="mut">só você (admin)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
