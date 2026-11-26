import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverClient } from "./supabase/server";
import { admin } from "./supabase/admin";

// Utilizador, workspaces dele e a workspace atual (linha completa, só no servidor)
export async function getContext(wsParam?: string) {
  const sb = await serverClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const db = admin();
  const { data: profile } = await db.from("profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  const isAdmin = !!profile?.is_admin;

  let workspaces: { id: string; name: string; role: string }[] = [];
  if (isAdmin) {
    const { data } = await db.from("workspaces").select("id,name").order("name");
    workspaces = (data || []).map((w) => ({ ...w, role: "owner" }));
  } else {
    const { data } = await db.from("members").select("role, workspaces(id,name)").eq("user_id", user.id);
    workspaces = (data || []).filter((m: any) => m.workspaces).map((m: any) => ({ id: m.workspaces.id, name: m.workspaces.name, role: m.role }));
  }

  const store = await cookies();
  const wanted = wsParam || store.get("ws")?.value;
  const current = workspaces.find((w) => w.id === wanted) || workspaces[0] || null;
  let ws: any = null;
  if (current) {
    const { data } = await db.from("workspaces").select("*").eq("id", current.id).single();
    ws = data;
  }
  return { user, isAdmin, workspaces, ws, role: current?.role || null, canEdit: isAdmin || current?.role === "owner" };
}

// Garante que o utilizador pode editar a workspace (para server actions)
export async function assertCanEdit(wsId: string) {
  const ctx = await getContext(wsId);
  if (!ctx.ws || ctx.ws.id !== wsId || !ctx.canEdit) throw new Error("Sem permissão");
  return ctx;
}
