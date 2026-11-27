import Link from "next/link";
import { redirect } from "next/navigation";
import NoWs from "@/components/NoWs";
import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { fmt } from "@/lib/metrics";

const KINDS: [string, string][] = [["", "Todos"], ["venda", "Vendas"], ["clique", "Cliques"], ["webhook", "Webhooks"], ["acao", "Ações no Meta"], ["regra", "Regras"]];
const ST: Record<string, string> = { approved: "aprovada", pending: "pendente", refunded: "reembolsada", chargeback: "chargeback", canceled: "cancelada" };

export default async function Eventos({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return <NoWs />;
  if (!ctx.canEdit) redirect("/dashboard");
  const ws = ctx.ws;
  const k = KINDS.some(([x]) => x === sp.k) ? sp.k : "";
  const db = admin();
  const want = (x: string) => !k || k === x;
  const [sales, clicks, hooks, acts, rules] = await Promise.all([
    want("venda") ? db.from("sales").select("created_at,status,amount,currency,product_name,provider,utm_source,campaign_name").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(60).then((x: any) => x.data || []) : [],
    want("clique") ? db.from("clicks").select("created_at,utm_source,utm_campaign,landing_url").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(60).then((x: any) => x.data || []) : [],
    want("webhook") ? db.from("webhook_logs").select("created_at,provider,result").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(60).then((x: any) => x.data || []) : [],
    want("acao") ? db.from("action_logs").select("created_at,user_email,entity_name,action,detail,ok").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(60).then((x: any) => x.data || []) : [],
    want("regra") ? db.from("rule_logs").select("created_at,entity_name,action,detail,ok,dry_run").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(60).then((x: any) => x.data || []) : []
  ]);
  const ev = [
    ...sales.map((s: any) => ({ t: s.created_at, k: "Venda", c: s.status === "approved" ? "ok" : s.status === "pending" ? "warn" : "err", txt: `${ST[s.status] || s.status} · ${fmt(Number(s.amount), "money", s.currency || ws.currency)} · ${s.product_name || "produto"} · ${s.provider}`, sub: s.campaign_name ? `Campanha: ${String(s.campaign_name).split("|")[0]}` : s.utm_source ? `Origem: ${s.utm_source}` : "sem rastreio" })),
    ...clicks.map((c: any) => ({ t: c.created_at, k: "Clique", c: "mut", txt: `${c.utm_source || "sem UTM"}${c.utm_campaign ? " · " + String(c.utm_campaign).split("|")[0] : ""}`, sub: c.landing_url || "" })),
    ...hooks.map((h: any) => ({ t: h.created_at, k: "Webhook", c: String(h.result).startsWith("erro") ? "err" : "ok", txt: `${h.provider} · ${h.result}`, sub: "" })),
    ...acts.map((a: any) => ({ t: a.created_at, k: "Ação", c: a.ok ? "ok" : "err", txt: `${a.action} · ${a.entity_name || ""}`, sub: `${a.user_email || ""} ${a.detail ? "· " + a.detail : ""}` })),
    ...rules.map((r: any) => ({ t: r.created_at, k: r.dry_run ? "Regra (simulação)" : "Regra", c: r.ok ? "ok" : "err", txt: `${r.action} · ${r.entity_name || ""}`, sub: r.detail || "" }))
  ].sort((a, b) => b.t.localeCompare(a.t)).slice(0, 150);
  const when = (d: string) => new Date(d).toLocaleString("pt-BR", { timeZone: ws.timezone, dateStyle: "short", timeStyle: "medium" });

  return (
    <>
      <div className="subtabs">{KINDS.map(([x, l]) => <Link key={x} href={x ? `/eventos?k=${x}` : "/eventos"} className={x === k ? "on" : ""}>{l}</Link>)}</div>
      <div className="card tbl">
        <table>
          <thead><tr><th style={{ width: 170 }}>Data</th><th style={{ width: 140 }}>Evento</th><th>Detalhe</th></tr></thead>
          <tbody>
            {!ev.length && <tr><td colSpan={3} className="empty">Ainda não há eventos.</td></tr>}
            {ev.map((e, i) => (
              <tr key={i}><td className="mut">{when(e.t)}</td><td><span className={e.c}>●</span> {e.k}</td>
                <td className="name">{e.txt}{e.sub && <div className="note" style={{ maxWidth: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.sub}</div>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
