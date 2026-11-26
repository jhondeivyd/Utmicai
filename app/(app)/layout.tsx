import { getContext } from "@/lib/session";
import WsSwitcher from "@/components/WsSwitcher";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  return (
    <div className="shell">
      <aside className="side">
        <div className="logo">Utm<span>Cai</span></div>
        <nav className="nav">
          <a href="/dashboard">Dashboard</a>
          <a href="/vendas">Vendas</a>
          {ctx.canEdit && <a href="/config">Configurações</a>}
          {ctx.isAdmin && <a href="/admin">Admin</a>}
        </nav>
        <div className="side-foot">
          <div style={{ marginBottom: 8 }}><WsSwitcher list={ctx.workspaces} current={ctx.ws?.id} /></div>
          <div>{ctx.user.email}</div>
          <form action={logout}><button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>Sair</button></form>
        </div>
      </aside>
      <main className="main">
        {!ctx.ws && !ctx.isAdmin ? <div className="card">Nenhuma workspace ainda. Peça acesso ao administrador.</div> : children}
      </main>
    </div>
  );
}
