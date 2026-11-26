"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { TIMEZONES, CURRENCIES, VIEW_TYPES } from "@/lib/options";

const back = (m: string, ok = true) => redirect(`/avancado?m=${encodeURIComponent((ok ? "ok:" : "e:") + m)}`);

function readDash(fd: FormData) {
  const tz = String(fd.get("timezone") || ""), cur = String(fd.get("currency") || ""), vt = String(fd.get("view_type") || "normal");
  return {
    name: String(fd.get("name") || "").trim(),
    description: String(fd.get("description") || "").trim() || null,
    timezone: TIMEZONES.some(([v]) => v === tz) ? tz : "Europe/Lisbon",
    currency: CURRENCIES.some(([v]) => v === cur) ? cur : "EUR",
    view_type: VIEW_TYPES.some(([v]) => v === vt) ? vt : "normal",
    count_shipping: fd.get("count_shipping") === "1",
    count_interest: fd.get("count_interest") === "1",
    meta_cache: fd.get("meta_cache") === "1"
  };
}

export async function saveDashboard(fd: FormData) {
  const ctx = await getContext();
  const id = String(fd.get("id") || "");
  const row = readDash(fd);
  if (!row.name) return back("Dê um nome ao dashboard", false);
  const db = admin();
  if (id) {
    const w = ctx.workspaces.find((x) => x.id === id);
    if (!w || !(ctx.isAdmin || w.role === "owner")) return back("Sem permissão para editar este dashboard", false);
    const { error } = await db.from("workspaces").update(row).eq("id", id);
    if (error) return back(error.message, false);
    return back("Dashboard guardado");
  }
  if (!ctx.isAdmin) return back("Só o administrador pode criar dashboards", false);
  const { data, error } = await db.from("workspaces").insert(row).select("id").single();
  if (error) return back(error.message, false);
  (await cookies()).set("ws", data.id, { path: "/", maxAge: 31536000, sameSite: "lax" });
  redirect(`/integracoes?m=${encodeURIComponent("ok:Dashboard criado — agora ligue o Meta Ads e os checkouts")}`);
}

export async function deleteDashboard(fd: FormData) {
  const ctx = await getContext();
  if (!ctx.isAdmin) return back("Só o administrador pode apagar dashboards", false);
  const id = String(fd.get("id"));
  const { error } = await admin().from("workspaces").delete().eq("id", id);
  if (error) return back(error.message, false);
  back("Dashboard apagado");
}

async function canManage(wsId: string) {
  const ctx = await getContext();
  const w = ctx.workspaces.find((x) => x.id === wsId);
  if (!w || !(ctx.isAdmin || w.role === "owner")) throw new Error("Sem permissão");
  return ctx;
}

export async function addCollaborator(fd: FormData) {
  const ws = String(fd.get("ws") || "");
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  const role = fd.get("role") === "owner" ? "owner" : "viewer";
  if (!email || !ws) return back("Preencha o e-mail e escolha o dashboard", false);
  try { await canManage(ws); } catch { return back("Sem permissão para este dashboard", false); }
  const db = admin();
  const { data: prof } = await db.from("profiles").select("user_id").eq("email", email).maybeSingle();
  let userId = prof?.user_id;
  if (!userId) {
    if (password.length < 8) return back("Para um utilizador novo, defina uma senha com pelo menos 8 caracteres", false);
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) return back(error.message, false);
    userId = data.user.id;
  }
  const { error } = await db.from("members").upsert({ workspace_id: ws, user_id: userId, role });
  if (error) return back(error.message, false);
  back(`${email} tem agora acesso`);
}

export async function removeCollaborator(fd: FormData) {
  const ws = String(fd.get("ws"));
  try { await canManage(ws); } catch { return back("Sem permissão", false); }
  await admin().from("members").delete().eq("workspace_id", ws).eq("user_id", String(fd.get("user")));
  back("Acesso removido");
}
