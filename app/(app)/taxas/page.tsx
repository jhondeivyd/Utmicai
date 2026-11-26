import { redirect } from "next/navigation";
import NoWs from "@/components/NoWs";
import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { fmt } from "@/lib/metrics";
import { METHOD_LABEL } from "@/lib/filters";
import Icon from "@/components/Icon";
import ConfirmButton from "@/components/ConfirmButton";
import { saveTax, saveFee, deleteFee, saveProductCosts } from "./actions";

export default async function Taxas({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return <NoWs />;
  if (!ctx.canEdit) redirect("/dashboard");
  const ws = ctx.ws;
  const db = admin();
  const [{ data: fees }, { data: prods }, { data: names }] = await Promise.all([
    db.from("fees").select("*").eq("workspace_id", ws.id).order("created_at"),
    db.from("product_costs").select("*").eq("workspace_id", ws.id),
    db.from("sales").select("product_name").eq("workspace_id", ws.id).not("product_name", "is", null).order("created_at", { ascending: false }).limit(2000)
  ]);
  const all = [...new Set([...(prods || []).map((p: any) => p.product_name), ...(names || []).map((x: any) => x.product_name)])].sort();
  const costOf = (n: string) => (prods || []).find((p: any) => p.product_name === n);
  const legacy = Number(ws.gateway_fee_percent) || 0;
  const editingFee: any = sp.fee === "new" ? { payment_method: "todas" } : sp.fee ? (fees || []).find((f: any) => f.id === sp.fee) : null;
  const msg = sp.m ? decodeURIComponent(sp.m) : null;
  const H = <input type="hidden" name="ws" value={ws.id} />;
  const m = (v: number) => fmt(v, "money", ws.currency);

  return (
    <>
      {msg && <div className={"flash" + (msg.startsWith("e:") ? " e" : "")}>{msg.slice(msg.indexOf(":") + 1)}</div>}
      <div className="grid g-adv">
        <div className="grid">
          <form action={saveTax} className="card form">
            {H}
            <div className="card-h"><h2>Imposto</h2><button className="btn btn-ghost btn-sm">Guardar</button></div>
            <p className="note">Configure o imposto dos seus produtos.</p>
            <div className="row2">
              <label>Imposto sobre o faturamento (%)<input className="input" name="tax_percent" defaultValue={ws.tax_percent ?? 0} inputMode="decimal" /></label>
              <label>Imposto sobre gastos em anúncios — Meta (%)<input className="input" name="ads_tax_percent" defaultValue={ws.ads_tax_percent ?? 0} inputMode="decimal" />
                <span className="note">Ex.: IVA cobrado pelo Meta sobre o gasto.</span></label>
            </div>
          </form>

          <div className="card">
            <div className="card-h"><h2>Taxas</h2><a className="btn btn-ghost btn-sm" href="/taxas?fee=new">Adicionar Taxa</a></div>
            <p className="note">Configure taxas do checkout / gateway (Stripe, KashPay…). Entram no faturamento líquido e no lucro.</p>
            <div className="list" style={{ marginTop: 10 }}>
              {(fees || []).map((f: any) => (
                <div key={f.id} className="int-row">
                  <div><b>{f.name}</b>
                    <div className="note">Taxa: {Number(f.percent).toFixed(2).replace(".", ",")}%{Number(f.fixed) ? ` + ${m(Number(f.fixed))} por venda` : ""} · Forma de pagamento: {f.payment_method === "todas" ? "Todas" : METHOD_LABEL[f.payment_method] || f.payment_method} · Regra: valor de faturamento</div>
                  </div>
                  <div className="dash-act">
                    <a className="icon-btn" href={`/taxas?fee=${f.id}`} title="Editar"><Icon name="edit" size={15} /></a>
                    <form action={deleteFee}>{H}<input type="hidden" name="id" value={f.id} /><ConfirmButton className="icon-btn" title="Apagar" msg={`Apagar a taxa "${f.name}"?`}><Icon name="trash" size={15} /></ConfirmButton></form>
                  </div>
                </div>
              ))}
              {!(fees || []).length && <p className="mut">{legacy ? `A usar a taxa antiga de ${legacy}% sobre todas as vendas. Adicione taxas aqui para a substituir.` : "Nenhuma taxa ainda."}</p>}
            </div>
          </div>
        </div>

        <form action={saveProductCosts} className="card form">
          {H}
          <div className="card-h"><h2>Custo de Produtos</h2><button className="btn btn-ghost btn-sm">Guardar</button></div>
          <p className="note">Configure o custo dos seus produtos. Os nomes vêm das vendas recebidas. “Por venda” desconta em cada venda; “Mensal” é um custo fixo dividido pelos dias.</p>
          {!all.length && <p className="mut">Ainda não chegou nenhuma venda com nome de produto.</p>}
          {all.map((n, i) => {
            const c: any = costOf(n);
            return (
              <div key={n} className="int-row">
                <input type="hidden" name={`p${i}_name`} value={n} />
                <b style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{n}</b>
                <select className="input" name={`p${i}_kind`} defaultValue={c?.kind || "venda"} style={{ width: 120 }}><option value="venda">Por venda</option><option value="mensal">Mensal</option></select>
                <input className="input" name={`p${i}_cost`} defaultValue={c?.cost ?? ""} placeholder="0,00" inputMode="decimal" style={{ width: 110 }} />
              </div>
            );
          })}
        </form>
      </div>

      {editingFee && (
        <>
          <a className="drawer-bg" href="/taxas" aria-label="Fechar" />
          <form action={saveFee} className="drawer form">
            {H}{editingFee.id && <input type="hidden" name="id" value={editingFee.id} />}
            <div className="card-h"><h2>{editingFee.id ? "Editar Taxa" : "Adicionar Taxa"}</h2><a className="icon-btn" href="/taxas"><Icon name="close" size={15} /></a></div>
            <label>Nome<input className="input" name="name" defaultValue={editingFee.name || ""} placeholder="Ex.: Stripe 3%" required /></label>
            <div className="row2">
              <label>Taxa (%)<input className="input" name="percent" defaultValue={editingFee.percent ?? ""} placeholder="3,00" inputMode="decimal" /></label>
              <label>Valor fixo por venda<input className="input" name="fixed" defaultValue={editingFee.fixed ?? ""} placeholder="0,00" inputMode="decimal" /></label>
            </div>
            <label>Forma de pagamento
              <select className="input" name="payment_method" defaultValue={editingFee.payment_method}>
                <option value="todas">Todas</option>{Object.entries(METHOD_LABEL).filter(([k]) => k !== "outro").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></label>
            <label>Regra de cálculo<select className="input" disabled><option>Valor de faturamento</option></select></label>
            <button className="btn" style={{ justifyContent: "center" }}>Guardar Taxa</button>
          </form>
        </>
      )}
    </>
  );
}
