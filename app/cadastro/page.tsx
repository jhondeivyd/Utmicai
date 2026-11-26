import { signup } from "./actions";
import { Logo } from "@/components/Icon";
import { admin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function Cadastro({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const sp = await searchParams;
  const { data: st } = await admin().from("app_settings").select("value").eq("key", "signup_open").maybeSingle();
  const open = st?.value === "true";
  return (
    <div className="login">
      <form action={signup} className="card form">
        <div className="brand" style={{ margin: "0 0 6px" }}><Logo /><b>Utm<span>Cai</span></b></div>
        <div><h2 style={{ margin: 0 }}>Criar conta grátis</h2><div className="note">Rastreie as vendas do Facebook Ads com precisão.</div></div>
        {sp.e && <div className="flash e">{sp.e}</div>}
        {!open ? <div className="flash e">O cadastro está fechado de momento. Peça um convite ao administrador.</div> : (
          <>
            <label>Nome<input className="input" name="name" required autoComplete="name" /></label>
            <label>E-mail<input className="input" name="email" type="email" required autoComplete="email" /></label>
            <label>Senha<input className="input" name="password" type="password" required autoComplete="new-password" /></label>
            <label>Confirmar senha<input className="input" name="confirm" type="password" required autoComplete="new-password" /></label>
            <input name="website" tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} aria-hidden />
            <div className="note">Mínimo 8 caracteres, com uma letra maiúscula e um número.</div>
            <button className="btn" style={{ justifyContent: "center" }}>Criar conta</button>
          </>
        )}
        <div className="note" style={{ textAlign: "center" }}>Já tem conta? <a className="pos" href="/login">Entrar</a></div>
      </form>
    </div>
  );
}
