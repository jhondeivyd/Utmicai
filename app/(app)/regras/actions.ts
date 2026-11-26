"use server";
import { redirect } from "next/navigation";
import { assertCanEdit } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { runRulesForWorkspace, RULE_METRICS, ACTIONS, WINDOWS, LEVELS, OPS, FREQS } from "@/lib/rules";

const back = (m: string, ok = true) => redirect(`/regras?m=${encodeURIComponent((ok ? "ok:" : "e:") + m)}`);

export async function saveRule(fd: FormData) {
  const ctx = await assertCanEdit(String(fd.get("ws")));
  const conditions: any[] = [];
  for (let i = 0; i < 4; i++) {
    const metric = String(fd.get(`c${i}_metric`) || ""), op = String(fd.get(`c${i}_op`) || ""), raw = String(fd.get(`c${i}_value`) || "").replace(",", ".");
    if (!metric || raw === "") continue;
    if (!(RULE_METRICS as readonly string[]).includes(metric) || !OPS[op] || isNaN(Number(raw))) return back("Condição inválida", false);
    conditions.push({ metric, op, value: Number(raw) });
  }
  const action = String(fd.get("action")), level = String(fd.get("level")), win = String(fd.get("time_window"));
  if (!ACTIONS[action] || !LEVELS[level] || !WINDOWS[win]) return back("Dados inválidos", false);
  if (!conditions.length) return back("Adicione pelo menos uma condição", false);
  const av = String(fd.get("action_value") || "").replace(",", ".");
  if (action.startsWith("budget") && !(Number(av) > 0)) return back("Indique o valor do orçamento", false);
  const row: any = {
    workspace_id: ctx.ws.id, name: String(fd.get("name") || "").trim() || "Regra sem nome", level, time_window: win, conditions, action,
    action_value: action.startsWith("budget") ? Number(av) : null, cooldown_hours: Math.max(0, Number(fd.get("cooldown_hours")) || 0),
    dry_run: fd.get("dry_run") === "on", notify: fd.get("notify") === "on", active: true,
    name_filter: String(fd.get("name_filter") || "").trim() || null,
    product: String(fd.get("product") || "").trim() || null,
    apply_to: fd.get("apply_to") === "all" && action === "notify" ? "all" : "active",
    cond_level: fd.get("cond_level") === "campaign" ? "campaign" : "object",
    frequency_min: FREQS[String(fd.get("frequency_min"))] ? Number(fd.get("frequency_min")) : 15,
    hour_from: fd.get("hour_from") === "" || fd.get("hour_from") == null ? null : Math.min(23, Math.max(0, Number(fd.get("hour_from")))),
    hour_to: fd.get("hour_to") === "" || fd.get("hour_to") == null ? null : Math.min(23, Math.max(0, Number(fd.get("hour_to")))),
    daily_limit: Number(fd.get("daily_limit")) > 0 ? Math.round(Number(fd.get("daily_limit"))) : null
  };
  if ((row.hour_from == null) !== (row.hour_to == null)) { row.hour_from = null; row.hour_to = null; }
  if (!fd.has("cooldown_hours")) row.cooldown_hours = Math.max(1, Math.round(row.frequency_min / 60));
  const id = String(fd.get("id") || "");
  const db = admin();
  const { error } = id ? await db.from("rules").update(row).eq("id", id).eq("workspace_id", ctx.ws.id) : await db.from("rules").insert(row);
  if (error) return back(error.message, false);
  back(id ? "Regra atualizada" : "Regra criada — corre automaticamente a cada 15 minutos");
}

export async function toggleRule(fd: FormData) {
  const ctx = await assertCanEdit(String(fd.get("ws")));
  await admin().from("rules").update({ active: fd.get("to") === "on" }).eq("id", String(fd.get("id"))).eq("workspace_id", ctx.ws.id);
  back(fd.get("to") === "on" ? "Regra ligada" : "Regra desligada");
}

export async function deleteRule(fd: FormData) {
  const ctx = await assertCanEdit(String(fd.get("ws")));
  await admin().from("rules").delete().eq("id", String(fd.get("id"))).eq("workspace_id", ctx.ws.id);
  back("Regra apagada");
}

export async function testRule(fd: FormData) {
  const ctx = await assertCanEdit(String(fd.get("ws")));
  try {
    const res = await runRulesForWorkspace(ctx.ws, { onlyRuleId: String(fd.get("id")), forceDry: true });
    back(res.length ? `Simulação: a regra agiria em ${res.length} item(ns): ${res.slice(0, 5).map((r: any) => r.entity).join(", ")}${res.length > 5 ? "…" : ""}` : "Simulação: nenhum item cumpre as condições agora");
  } catch (e: any) {
    if (String(e?.digest || "").startsWith("NEXT_REDIRECT")) throw e;
    back(`Erro: ${e?.message}`, false);
  }
}
