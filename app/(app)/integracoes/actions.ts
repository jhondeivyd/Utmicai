"use server";
import { redirect } from "next/navigation";
import { assertCanEdit } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { sendTelegram, sendCapiPurchase } from "@/lib/integrations";
import { syncWorkspaceSpend } from "@/lib/ingest";

const SECRET = ["meta_access_token", "capi_token", "telegram_bot_token", "stripe_webhook_secret"];
const PLAIN = ["meta_ad_account_ids", "pixel_id", "capi_test_event_code", "telegram_chat_id"];
const mkBack = (fd: FormData) => (m: string, ok = true) =>
  redirect(`/integracoes?tab=${encodeURIComponent(String(fd.get("tab") || "anuncios"))}&m=${encodeURIComponent((ok ? "ok:" : "e:") + m)}`);

export async function saveSettings(fd: FormData) {
  const back = mkBack(fd);
  const wsId = String(fd.get("ws"));
  await assertCanEdit(wsId);
  const upd: any = {};
  for (const k of PLAIN) if (fd.has(k)) upd[k] = String(fd.get(k) || "").trim() || null;
  for (const k of SECRET) {
    if (fd.get(`clear_${k}`)) upd[k] = null;
    else { const v = String(fd.get(k) || "").trim(); if (v) upd[k] = v; } // vazio = manter o atual
  }
  if (fd.has("generic_mapping")) {
    const raw = String(fd.get("generic_mapping") || "").trim();
    if (!raw) upd.generic_mapping = null;
    else { try { upd.generic_mapping = JSON.parse(raw); } catch { return back("Mapeamento não é um JSON válido", false); } }
  }
  const { error } = await admin().from("workspaces").update(upd).eq("id", wsId);
  if (error) return back(error.message, false);
  back("Configurações guardadas");
}

export async function testTelegram(fd: FormData) {
  const back = mkBack(fd);
  const ctx = await assertCanEdit(String(fd.get("ws")));
  const err = await sendTelegram(ctx.ws, `✅ UtmCai ligado à workspace <b>${ctx.ws.name}</b>`);
  back(err || "Mensagem de teste enviada", !err);
}

export async function testCapi(fd: FormData) {
  const back = mkBack(fd);
  const ctx = await assertCanEdit(String(fd.get("ws")));
  if (!ctx.ws.capi_test_event_code) return back("Preencha o Test Event Code (Gerenciador de Eventos → Testar eventos) antes de testar", false);
  const err = await sendCapiPurchase(ctx.ws, {
    provider: "teste", external_id: "teste_" + Date.now(), amount: 1, currency: ctx.ws.currency,
    customer_email: "teste@utmcai.com", approved_at: new Date().toISOString()
  }, null);
  back(err || "Purchase de teste enviado — veja em Testar eventos no Meta", !err);
}

export async function testMeta(fd: FormData) {
  const back = mkBack(fd);
  const ctx = await assertCanEdit(String(fd.get("ws")));
  const r = await syncWorkspaceSpend(ctx.ws, Number(fd.get("days")) || 30);
  back(r.msg, r.ok);
}

export async function rotateToken(fd: FormData) {
  const back = mkBack(fd);
  const wsId = String(fd.get("ws"));
  await assertCanEdit(wsId);
  const token = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await admin().from("workspaces").update({ webhook_token: token }).eq("id", wsId);
  back("Novo token gerado — atualize as URLs de webhook nos checkouts");
}

export async function saveAccounts(fd: FormData) {
  const back = mkBack(fd);
  const wsId = String(fd.get("ws"));
  await assertCanEdit(wsId);
  const ids = fd.getAll("acc").map((x) => String(x)).filter((x) => /^act_\d+$/.test(x));
  if (!ids.length) return back("Escolha pelo menos uma conta de anúncio", false);
  const { error } = await admin().from("workspaces").update({ meta_ad_account_ids: ids.join(",") }).eq("id", wsId);
  if (error) return back(error.message, false);
  const ctx = await assertCanEdit(wsId);
  const r = await syncWorkspaceSpend({ ...ctx.ws, meta_ad_account_ids: ids.join(",") }, 30);
  back(`${ids.length} conta(s) ligada(s). ${r.msg}`, r.ok);
}

export async function disconnectMeta(fd: FormData) {
  const back = mkBack(fd);
  const wsId = String(fd.get("ws"));
  await assertCanEdit(wsId);
  const { error } = await admin().from("workspaces")
    .update({ meta_access_token: null, meta_token_expires_at: null, meta_account_name: null }).eq("id", wsId);
  if (error) return back(error.message, false);
  back("Facebook desligado deste dashboard");
}

// Gera um link de ligação para abrir noutro navegador (multilogin)
export async function createConnectLink(fd: FormData) {
  const back = mkBack(fd);
  const wsId = String(fd.get("ws"));
  const ctx = await assertCanEdit(wsId);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[b % 64]).join("");
  const db = admin();
  await db.from("connect_links").delete().eq("workspace_id", wsId).is("used_at", null);
  const { error } = await db.from("connect_links").insert({
    token, workspace_id: wsId, created_by: ctx.user.id,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
  if (error) return back(error.message, false);
  redirect(`/integracoes?tab=anuncios&link=${token}`);
}
