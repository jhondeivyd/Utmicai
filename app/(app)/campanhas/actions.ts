"use server";
import { redirect } from "next/navigation";
import { assertCanEdit } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { setStatus, setDailyBudget, duplicate, syncWorkspace } from "@/lib/meta";

// métricas da linha no momento da ação (vêm do formulário)
function readSnap(fd: FormData) {
  try { return JSON.parse(String(fd.get("snap") || "null")); } catch { return null; }
}
async function log(ctx: any, id: string, name: string, action: string, detail: string, ok: boolean, snap: any = null) {
  await admin().from("action_logs").insert({ workspace_id: ctx.ws.id, user_email: ctx.user.email, entity_id: id, entity_name: name, action, detail, ok, snapshot: snap });
}
const back = (fd: FormData, msg: string, ok = true) => {
  const ret = String(fd.get("ret") || "/campanhas");
  const sep = ret.includes("?") ? "&" : "?";
  redirect(`${ret}${sep}m=${encodeURIComponent((ok ? "ok:" : "e:") + msg)}`);
};

export async function toggleStatus(fd: FormData) {
  const ctx = await assertCanEdit(String(fd.get("ws")));
  const snap = readSnap(fd);
  const id = String(fd.get("id")), name = String(fd.get("name") || id);
  const to = fd.get("to") === "ACTIVE" ? "ACTIVE" : "PAUSED";
  try {
    await setStatus(ctx.ws, id, to);
    await log(ctx, id, name, to === "ACTIVE" ? "ativar" : "pausar", "", true, snap);
  } catch (e: any) {
    await log(ctx, id, name, to === "ACTIVE" ? "ativar" : "pausar", e.message, false, snap);
    return back(fd, `Meta recusou: ${e.message}`, false);
  }
  back(fd, `${name} ${to === "ACTIVE" ? "ativado" : "pausado"}`);
}

export async function changeBudget(fd: FormData) {
  const ctx = await assertCanEdit(String(fd.get("ws")));
  const snap = readSnap(fd);
  const id = String(fd.get("id")), name = String(fd.get("name") || id);
  const value = Number(String(fd.get("value") || "").replace(",", "."));
  const old = String(fd.get("old") || "");
  try {
    await setDailyBudget(ctx.ws, id, value);
    await log(ctx, id, name, "orçamento", `${old} → ${value}`, true, snap);
  } catch (e: any) {
    await log(ctx, id, name, "orçamento", e.message, false, snap);
    return back(fd, `Meta recusou: ${e.message}`, false);
  }
  back(fd, `Orçamento de ${name} alterado para ${value}`);
}

export async function duplicateEntity(fd: FormData) {
  const ctx = await assertCanEdit(String(fd.get("ws")));
  const snap = readSnap(fd);
  const id = String(fd.get("id")), name = String(fd.get("name") || id), level = String(fd.get("level"));
  let newId: string | null = null;
  try {
    newId = await duplicate(ctx.ws, id, level);
    await log(ctx, id, name, "duplicar", `nova cópia ${newId || ""} (pausada)`, true, snap);
    await syncWorkspace(ctx.ws, 1).catch(() => null);
  } catch (e: any) {
    await log(ctx, id, name, "duplicar", e.message, false, snap);
    return back(fd, `Meta recusou: ${e.message}`, false);
  }
  back(fd, `${name} duplicado — a cópia foi criada pausada`);
}

export async function syncCampaigns(fd: FormData) {
  const ctx = await assertCanEdit(String(fd.get("ws")));
  const r = await syncWorkspace(ctx.ws, Number(fd.get("days")) || 3);
  back(fd, r.msg, r.ok);
}
