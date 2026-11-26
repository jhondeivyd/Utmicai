import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import Nav from "@/components/Nav";
import Icon, { Logo } from "@/components/Icon";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const { data: prof } = await admin().from("profiles").select("full_name").eq("user_id", ctx.user.id).maybeSingle();
  const who = (prof as any)?.full_name || ctx.user.email?.split("@")[0] || "";
  const ini = who.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((x: string) => x[0]?.toUpperCase()).join("") || "U";
  return (
    <div className="shell">
      <aside className="side">
        <a href="/dashboard" className="brand"><Logo /><b>Utm<span>Cai</span></b></a>
        <Nav list={ctx.workspaces} current={ctx.ws?.id} isAdmin={ctx.isAdmin} />
        <form action={logout} className="side-foot"><button className="nav-out"><Icon name="logout" size={16} />Sair</button></form>
      </aside>
      <div className="main-wrap">
        <header className="appbar">
          <div className="appbar-t">{ctx.ws ? <>Dashboard - <b>{ctx.ws.name}</b></> : <b>UtmCai</b>}</div>
          <div className="appbar-u">
            <div style={{ textAlign: "right" }}><b>{who}</b><div className="note">{ctx.isAdmin ? "Administrador" : ctx.canEdit ? "Gestor" : "Visualizador"}</div></div>
            <a href="/minha-conta" className="avatar">{ini}</a>
          </div>
        </header>
        <main className="main">
          {children}
        </main>
      </div>
    </div>
  );
}
