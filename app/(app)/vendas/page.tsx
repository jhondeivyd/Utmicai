import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { resolveRange } from "@/lib/dates";
import { money } from "@/lib/integrations";
import RangeBar from "@/components/RangeBar";

const ST: Record<string, string> = { approved: "Aprovada", pending: "Pendente", refunded: "Reembolso", chargeback: "Chargeback", canceled: "Cancelada" };
const maskEmail = (e?: string) => (e ? e.replace(/^(.{2}).*(@.*)$/, "$1•••$2") : "—");

export default async function Vendas({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return null;
  const ws = ctx.ws;
  const r = resolveRange(sp, ws.timezone);
  let q = admin().from("sales").select("*").eq("workspace_id", ws.id)
    .gte("created_at", r.startIso).lt("created_at", r.endIso).order("created_at", { ascending: false }).limit(500);
  if (sp.s && ST[sp.s]) q = q.eq("status", sp.s);
  const { data: sales } = await q;
  const extra: Record<string, string> = sp.s ? { s: sp.s } : {};

  return (
    <>
      <div className="top">
        <h1>Vendas</h1>
        <RangeBar base="/vendas" p={r.p} from={r.from} to={r.to} extra={extra} />
      </div>
      <div className="tabs" style={{ marginBottom: 12 }}>
        <a className={"tab" + (!sp.s ? " on" : "")} href={`/vendas?p=${r.p}&from=${r.from}&to=${r.to}`}>Todas</a>
        {Object.entries(ST).map(([k, l]) => <a key={k} className={"tab" + (sp.s === k ? " on" : "")} href={`/vendas?p=${r.p}&from=${r.from}&to=${r.to}&s=${k}`}>{l}</a>)}
      </div>
      <div className="card tbl">
        <table>
          <thead><tr><th>Data</th><th>Status</th><th className="n">Valor</th><th>Produto</th><th>Cliente</th><th>Origem</th><th>Campanha</th><th>Anúncio</th><th>Checkout</th><th>CAPI</th></tr></thead>
          <tbody>
            {(!sales || !sales.length) && <tr><td colSpan={10} className="mut">Nenhuma venda no período.</td></tr>}
            {(sales || []).map((s: any) => (
              <tr key={s.id}>
                <td>{new Date(s.created_at).toLocaleString("pt-BR", { timeZone: ws.timezone, dateStyle: "short", timeStyle: "short" })}</td>
                <td><span className={"badge b-" + s.status}>{ST[s.status]}</span></td>
                <td className="n">{money(Number(s.amount), s.currency || ws.currency)}</td>
                <td className="name">{s.product_name || "—"}</td>
                <td>{maskEmail(s.customer_email)}</td>
                <td>{s.utm_source || <span className="warn">sem rastreio</span>}</td>
                <td className="name">{s.campaign_name || s.campaign_id || "—"}</td>
                <td className="name">{s.ad_name || s.ad_id || "—"}</td>
                <td className="mut">{s.provider}</td>
                <td>{s.capi_sent_at ? <span className="ok">✓</span> : s.capi_error ? <span className="err" title={s.capi_error}>erro</span> : <span className="mut">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
