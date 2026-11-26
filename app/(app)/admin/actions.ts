"use server";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";

const back = (m: string, ok = true) => redirect(`/admin?m=${encodeURIComponent((ok ? "ok:" : "e:") + m)}`);
async function mustAdmin() { const c = await getContext(); if (!c.isAdmin) throw new Error("Sem permissão"); return c; }

export async function createWorkspace(fd: FormData) {
  await mustAdmin();
  const name = String(fd.get("name") || "").trim();
  if (!name) return back("Dê um nome à workspace", false);
  const { error } = await admin().from("workspaces").insert({
    name, currency: String(fd.get("currency") || "BRL").toUpperCase(), timezone: String(fd.get("timezone") || "America/Sao_Paulo")
  });
  if (error) return back(error.message, false);
  back(`Workspace "${name}" criada`);
}

export async function addUser(fd: FormData) {
  await mustAdmin();
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  const ws = String(fd.get("ws") || "");
  const role = fd.get("role") === "owner" ? "owner" : "viewer";
  if (!email || !ws) return back("Preencha e-mail e workspace", false);
  const db = admin();

  // utilizador já existe? (procura no perfil)
  let { data: prof } = await db.from("profiles").select("user_id").eq("email", email).maybeSingle();
  let userId = prof?.user_id;
  if (!userId) {
    if (password.length < 8) return back("Senha com pelo menos 8 caracteres", false);
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) return back(error.message, false);
    userId = data.user.id;
  }
  const { error } = await db.from("members").upsert({ workspace_id: ws, user_id: userId, role });
  if (error) return back(error.message, false);
  back(`${email} adicionado`);
}

export async function removeMember(fd: FormData) {
  await mustAdmin();
  await admin().from("members").delete().eq("workspace_id", String(fd.get("ws"))).eq("user_id", String(fd.get("user")));
  back("Acesso removido");
}
