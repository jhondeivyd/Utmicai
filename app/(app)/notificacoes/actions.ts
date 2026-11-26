"use server";
import { redirect } from "next/navigation";
import { assertCanEdit } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { sendTelegram, notifyOf } from "@/lib/integrations";
import { buildReport } from "@/lib/reports";

const back = (m: string, ok = true) => redirect(`/notificacoes?m=${encodeURIComponent((ok ? "ok:" : "e:") + m)}`);
const yes = (fd: FormData, k: string) => fd.get(k) === "1";

export async function saveNotify(fd: FormData) {
  const wsId = String(fd.get("ws"));
  await assertCanEdit(wsId);
  const notify = {
    pending: yes(fd, "pending"), approved: yes(fd, "approved"),
    value: fd.get("value") === "total" ? "total" : "comissao",
    product: yes(fd, "product"), campaign: yes(fd, "campaign"), dashname: yes(fd, "dashname"),
    hours: [8, 12, 18, 23].filter((h) => fd.get(`h${h}`) === "on"),
    style: ["lucro", "detalhado", "criativas"].includes(String(fd.get("style"))) ? String(fd.get("style")) : "detalhado"
  };
  const upd: any = { notify };
  const tok = String(fd.get("telegram_bot_token") || "").trim();
  if (fd.get("clear_telegram_bot_token")) upd.telegram_bot_token = null; else if (tok) upd.telegram_bot_token = tok;
  if (fd.has("telegram_chat_id")) upd.telegram_chat_id = String(fd.get("telegram_chat_id") || "").trim() || null;
  const { error } = await admin().from("workspaces").update(upd).eq("id", wsId);
  if (error) return back(error.message, false);
  back("Notificações guardadas");
}

export async function testNotify(fd: FormData) {
  const ctx = await assertCanEdit(String(fd.get("ws")));
  const n = notifyOf(ctx.ws);
  const err = await sendTelegram(ctx.ws, await buildReport(ctx.ws, n.style, new Date().getHours()));
  back(err || "Relatório de teste enviado para o Telegram", !err);
}
