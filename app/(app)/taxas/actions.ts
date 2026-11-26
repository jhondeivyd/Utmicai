"use server";
import { redirect } from "next/navigation";
import { assertCanEdit } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";

const back = (m: string, ok = true) => redirect(`/taxas?m=${encodeURIComponent((ok ? "ok:" : "e:") + m)}`);
const num = (v: any) => Math.max(0, Number(String(v ?? "0").replace(",", ".")) || 0);
const METHODS = ["todas", "card", "pix", "boleto", "mbway", "paypal"];

export async function saveTax(fd: FormData) {
  const wsId = String(fd.get("ws"));
  await assertCanEdit(wsId);
  const { error } = await admin().from("workspaces").update({ tax_percent: num(fd.get("tax_percent")), ads_tax_percent: num(fd.get("ads_tax_percent")) }).eq("id", wsId);
  if (error) return back(error.message, false);
  back("Imposto guardado");
}

export async function saveFee(fd: FormData) {
  const wsId = String(fd.get("ws"));
  await assertCanEdit(wsId);
  const pm = String(fd.get("payment_method") || "todas");
  const row = {
    workspace_id: wsId, name: String(fd.get("name") || "").trim() || "Taxa",
    percent: num(fd.get("percent")), fixed: num(fd.get("fixed")),
    payment_method: METHODS.includes(pm) ? pm : "todas", base: "faturamento"
  };
  const id = String(fd.get("id") || "");
  const db = admin();
  const { error } = id ? await db.from("fees").update(row).eq("id", id).eq("workspace_id", wsId) : await db.from("fees").insert(row);
  if (error) return back(error.message, false);
  // a taxa antiga (campo único) deixa de contar quando há taxas na lista
  await db.from("workspaces").update({ gateway_fee_percent: 0 }).eq("id", wsId);
  back("Taxa guardada");
}

export async function deleteFee(fd: FormData) {
  const wsId = String(fd.get("ws"));
  await assertCanEdit(wsId);
  await admin().from("fees").delete().eq("id", String(fd.get("id"))).eq("workspace_id", wsId);
  back("Taxa apagada");
}

export async function saveProductCosts(fd: FormData) {
  const wsId = String(fd.get("ws"));
  await assertCanEdit(wsId);
  const rows: any[] = [];
  for (let i = 0; i < 200; i++) {
    const name = String(fd.get(`p${i}_name`) || "").trim();
    if (!name) continue;
    rows.push({ workspace_id: wsId, product_name: name, cost: num(fd.get(`p${i}_cost`)), kind: fd.get(`p${i}_kind`) === "mensal" ? "mensal" : "venda" });
  }
  const db = admin();
  await db.from("product_costs").delete().eq("workspace_id", wsId);
  const keep = rows.filter((r) => r.cost > 0);
  if (keep.length) { const { error } = await db.from("product_costs").insert(keep); if (error) return back(error.message, false); }
  back("Custos de produto guardados");
}
