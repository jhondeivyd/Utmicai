"use server";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";

const back = (m: string, ok = true) => redirect(`/minha-conta?m=${encodeURIComponent((ok ? "ok:" : "e:") + m)}`);

export async function saveProfile(fd: FormData) {
  const ctx = await getContext();
  const full_name = String(fd.get("full_name") || "").trim() || null;
  const { error } = await admin().from("profiles").update({ full_name }).eq("user_id", ctx.user.id);
  if (error) return back(error.message, false);
  back("Dados guardados");
}

export async function changePassword(fd: FormData) {
  const ctx = await getContext();
  const cur = String(fd.get("current") || ""), nw = String(fd.get("new") || ""), cf = String(fd.get("confirm") || "");
  if (nw.length < 8 || !/[A-Z]/.test(nw) || !/[0-9]/.test(nw)) return back("A nova senha precisa de 8+ caracteres, uma maiúscula e um número", false);
  if (nw !== cf) return back("A confirmação não é igual à nova senha", false);
  const sb = await serverClient();
  const { error: e1 } = await sb.auth.signInWithPassword({ email: ctx.user.email!, password: cur });
  if (e1) return back("A senha atual está errada", false);
  const { error } = await sb.auth.updateUser({ password: nw });
  if (error) return back(error.message, false);
  back("Senha alterada");
}
