import { login } from "./actions";
export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="login">
      <form action={login} className="card form">
        <div className="logo" style={{ margin: 0 }}>Utm<span>Cai</span></div>
        {sp.e && <div className="flash e">E-mail ou senha inválidos.</div>}
        <label>E-mail<input className="input" name="email" type="email" required autoComplete="email" /></label>
        <label>Senha<input className="input" name="password" type="password" required autoComplete="current-password" /></label>
        <button className="btn">Entrar</button>
      </form>
    </div>
  );
}
