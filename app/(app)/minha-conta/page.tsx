import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { saveProfile, changePassword } from "./actions";

export default async function MinhaConta({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const { data: prof } = await admin().from("profiles").select("full_name").eq("user_id", ctx.user.id).maybeSingle();
  const msg = sp.m ? decodeURIComponent(sp.m) : null;
  return (
    <>
      {msg && <div className={"flash" + (msg.startsWith("e:") ? " e" : "")}>{msg.slice(msg.indexOf(":") + 1)}</div>}
      <div className="grid g-adv">
        <form action={saveProfile} className="card form">
          <h2>Detalhes da conta</h2>
          <div className="row2">
            <label>Nome<input className="input" name="full_name" defaultValue={(prof as any)?.full_name || ""} placeholder="O seu nome" /></label>
            <label>E-mail<input className="input" value={ctx.user.email || ""} readOnly /></label>
          </div>
          <label>Tipo de acesso<input className="input" value={ctx.isAdmin ? "Administrador" : "Utilizador"} readOnly /></label>
          <div><button className="btn">Guardar</button></div>
        </form>
        <form action={changePassword} className="card form">
          <h2>Trocar senha</h2>
          <label>Senha atual<input className="input" name="current" type="password" autoComplete="current-password" required /></label>
          <label>Nova senha<input className="input" name="new" type="password" autoComplete="new-password" required /></label>
          <label>Confirmar nova senha<input className="input" name="confirm" type="password" autoComplete="new-password" required /></label>
          <div className="note">Requisitos: 8 a 50 caracteres, pelo menos uma letra maiúscula e um número.</div>
          <div><button className="btn">Trocar senha</button></div>
        </form>
      </div>
    </>
  );
}
