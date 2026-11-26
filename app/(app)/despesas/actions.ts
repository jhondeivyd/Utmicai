"use server";
import { redirect } from "next/navigation";
import { assertCanEdit } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";

const back = (m: string, ok = true) => redirect(`/despesas?m=${encodeURIComponent((ok ? "ok:" : "e:") + m)}`);

export async function saveExpense(fd: FormData) {
  const wsId = String(fd.get("ws"));
  await assertCanEdit(wsId);
  const date = String(fd.get("date") || "");
  const amount = Number(String(fd.get("amount") || "").replace(",", "."));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return back("Escolha a data", false);
  if (!(amount > 0)) return back("Indique o valor", false);
  const row = {
    workspace_id: wsId, date, amount,
    kind: fd.get("kind") === "mensal" ? "mensal" : "unica",
    category: String(fd.get("category") || "Outros").slice(0, 60),
    description: String(fd.get("description") || "").trim().slice(0, 200) || null
  };
  const id = String(fd.get("id") || "");
  const db = admin();
  const { error } = id ? await db.from("expenses").update(row).eq("id", id).eq("workspace_id", wsId) : await db.from("expenses").insert(row);
  if (error) return back(error.message, false);
  back("Despesa guardada");
}

export async function deleteExpense(fd: FormData) {
  const wsId = String(fd.get("ws"));
  await assertCanEdit(wsId);
  await admin().from("expenses").delete().eq("id", String(fd.get("id"))).eq("workspace_id", wsId);
  back("Despesa apagada");
}
