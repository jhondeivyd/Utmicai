// Relatórios agendados no Telegram (08h, 12h, 18h, 23h no fuso do dashboard)
import { admin } from "./supabase/admin";
import { loadPeriod, loadExtraCosts } from "./data";
import { totals, fmt } from "./metrics";
import { resolveRange } from "./dates";
import { sendTelegram, notifyOf } from "./integrations";

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

export async function buildReport(ws: any, style: string, hour: number) {
  const r = resolveRange({ p: "today" }, ws.timezone);
  const all = await loadPeriod(ws, r);
  const t0 = totals(all.sales, all.spend, all.costs);
  const extra = await loadExtraCosts(ws, r, all.prods);
  const profit = t0.profit - extra;
  const m = (v: number) => fmt(v, "money", ws.currency);
  const hh = String(hour).padStart(2, "0") + "h";
  if (style === "lucro") {
    return `${profit >= 0 ? "🟢" : "🔴"} <b>${esc(ws.name)}</b> · hoje até às ${hh}\nLucro: <b>${m(profit)}</b> · ROAS ${t0.spend ? fmt(t0.roas, "x") : "N/A"}`;
  }
  if (style === "criativas") {
    const fun = profit > 0
      ? ["Dois reais ou um lucro misterioso? 🤑", "O caixa está a sorrir hoje 😁", "Alguém chame os bombeiros, isto está a pegar fogo 🔥"]
      : ["Calma, o dia ainda não acabou 💪", "Respira fundo, vamos dar a volta 🚀", "Hora de rever os anúncios 👀"];
    const title = fun[hour % fun.length];
    return `<b>${title}</b>\n${profit >= 0 ? "Parabéns! Você teve" : "Até agora o dia está em"} <b>${m(profit)}</b> de lucro até às ${hh} · ${esc(ws.name)} 🎉`;
  }
  return [
    `📊 <b>Resumo de hoje até às ${hh}</b> | ${esc(ws.name)}`,
    `Faturamento: <b>${m(t0.revenue)}</b> (${t0.sales} vendas)`,
    `Gastos com anúncios: ${m(t0.spend)}`,
    `Lucro: <b>${m(profit)}</b> ${profit >= 0 ? "🟢" : "🔴"}`,
    `ROAS: ${t0.spend ? fmt(t0.roas, "x") : "N/A"} · ROI: ${t0.spend ? fmt(profit / t0.spend, "pct") : "N/A"} · CPA: ${t0.sales ? m(t0.cpa) : "N/A"}`,
    t0.pending ? `Pendentes: ${t0.pending} (${m(t0.pending_amount)})` : null,
    t0.refunds + t0.chargebacks ? `Reembolsos: ${t0.refunds + t0.chargebacks} (${m(t0.refund_amount)})` : null
  ].filter(Boolean).join("\n");
}

function hourIn(tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return { day: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) };
}

export async function runReports() {
  const db = admin();
  const { data: list } = await db.from("workspaces").select("*").not("telegram_bot_token", "is", null).not("telegram_chat_id", "is", null);
  const out: any[] = [];
  for (const ws of list || []) {
    const n = notifyOf(ws);
    const { day, hour } = hourIn(ws.timezone);
    if (!(n.hours || []).includes(hour)) continue;
    const key = `${day}-${hour}`;
    if ((ws.report_last || {})[key]) continue;
    try {
      const err = await sendTelegram(ws, await buildReport(ws, n.style, hour));
      if (!err) await db.from("workspaces").update({ report_last: { [key]: true } }).eq("id", ws.id);
      out.push({ ws: ws.name, hour, ok: !err, err });
    } catch (e: any) { out.push({ ws: ws.name, error: e?.message }); }
  }
  return out;
}
