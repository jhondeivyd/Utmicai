import { getContext } from "@/lib/session";
import WsSwitcher from "@/components/WsSwitcher";
import Nav from "@/components/Nav";
import { Logo } from "@/components/Icon";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><Logo /><b>Utm<span>Cai</span></b></div>
        <Nav canEdit={ctx.canEdit} isAdmin={ctx.isAdmin} />
        <div className="side-foot">
          <WsSwitcher list={ctx.workspaces} current={ctx.ws?.id} />
          <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{ctx.user.email}</div>
          <form action={logout}><button className="btn btn-ghost btn-sm">Sair</button></form>
        </div>
      </aside>
      <main className="main">
        {!ctx.ws && !ctx.isAdmin ? <div className="card">Nenhuma workspace ainda. Peça acesso ao administrador.</div> : children}
      </main>
    </div>
  );
}
