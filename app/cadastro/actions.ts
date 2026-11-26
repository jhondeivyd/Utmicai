"use server";
import { redirect } from "next/navigation";
import { admin } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";

const back = (m: string) => redirect(`/cadastro?e=${encodeURIComponent(m)}`);

export async function signup(fd: FormData) {
  if (String(fd.get("website") || "")) return back("Não foi possível criar a conta"); // campo escondido anti-robôs
  const db = admin();
  const { data: st } = await db.from("app_settings").select("value").eq("key", "signup_open").maybeSingle();
  if (st?.value !== "true") return back("O cadastro está fechado de momento");
  const name = String(fd.get("name") || "").trim().slice(0, 80);
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  if (!name) return back("Escreva o seu nome");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return back("E-mail inválido");
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return back("A senha precisa de 8+ caracteres, uma letra maiúscula e um número");
  if (password !== String(fd.get("confirm") || "")) return back("As senhas não são iguais");
  const { data: exists } = await db.from("profiles").select("user_id").eq("email", email).maybeSingle();
  if (exists) return back("Já existe uma conta com este e-mail. Use Entrar.");
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (error) return back(error.message.includes("already") ? "Já existe uma conta com este e-mail. Use Entrar." : "Não foi possível criar a conta");
  await db.from("profiles").upsert({ user_id: data.user.id, email, full_name: name });
  const sb = await serverClient();
  await sb.auth.signInWithPassword({ email, password });
  redirect("/avancado?new=1");
}
