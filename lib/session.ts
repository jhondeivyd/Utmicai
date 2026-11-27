import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverClient } from "./supabase/server";
import { admin } from "./supabase/admin";

// Utilizador, dashboards dele e o dashboard atual (linha completa, só no servidor).
// cache(): o layout e a página partilham o mesmo resultado — não repete consultas.
export const getContext = cache(async (wsParam?: string) => {
  const sb = await serverClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const db = admin();
  const store = await cookies();

  // tudo ao mesmo tempo, em vez de uma consulta atrás da outra
  const [{ data: profile }, { data: mine }] = await Promise.all([
    db.from("profiles").select("is_admin, full_name").eq("user_id", user.id).maybeSingle(),
    db.from("members").select("role, workspaces(*)").eq("user_id", user.id)
  ]);
  const isAdmin = !!profile?.is_admin;

  const rows: any[] = [];
  for (const m of (mine || []) as any[]) if (m.workspaces) rows.push({ role: m.role, ws: m.workspaces });
  if (isAdmin) {
    // o admin vê também os que ele criou; os das contas de teste ficam privados
    const { data } = await db.from("workspaces").select("*").order("name");
    for (const w of (data || []) as any[])
      if ((!w.created_by || w.created_by === user.id) && !rows.some((x) => x.ws.id === w.id)) rows.push({ role: "owner", ws: w });
  }
  rows.sort((a, b) => String(a.ws.name).localeCompare(String(b.ws.name)));

  const workspaces = rows.map((r) => ({ id: r.ws.id, name: r.ws.name, role: r.role }));
  const wanted = wsParam || store.get("ws")?.value;
  const current = rows.find((r) => r.ws.id === wanted) || rows[0] || null;

  return {
    user, isAdmin, workspaces,
    fullName: (profile as any)?.full_name || null,
    ws: current?.ws || null,
    role: current?.role || null,
    canEdit: isAdmin || current?.role === "owner"
  };
});

// Garante que o utilizador pode editar o dashboard (para server actions)
export async function assertCanEdit(wsId: string) {
  const ctx = await getContext(wsId);
  if (!ctx.ws || ctx.ws.id !== wsId || !ctx.canEdit) throw new Error("Sem permissão");
  return ctx;
}
