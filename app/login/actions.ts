"use server";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";

export async function login(fd: FormData) {
  const sb = await serverClient();
  const { error } = await sb.auth.signInWithPassword({ email: String(fd.get("email")), password: String(fd.get("password")) });
  if (error) redirect("/login?e=1");
  redirect("/dashboard");
}
export async function logout() {
  const sb = await serverClient();
  await sb.auth.signOut();
  redirect("/login");
}
