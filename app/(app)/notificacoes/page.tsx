import { redirect } from "next/navigation";
import NoWs from "@/components/NoWs";
import { getContext } from "@/lib/session";
import { notifyOf, money } from "@/lib/integrations";
import { Logo } from "@/components/Icon";
import { saveNotify, testNotify } from "./actions";

const Opt = ({ name, label, tip, value, yes = "Habilitado", no = "Desabilitado" }: { name: string; label: string; tip: string; value: boolean; yes?: string; no?: string }) => (
  <label>{label}<select className="input" name={name} defaultValue={value ? "1" : "0"}><option value="1">{yes}</option><option value="0">{no}</option></select><span className="note">{tip}</span></label>
);

export default async function Notificacoes({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return <NoWs />;
  if (!ctx.canEdit) redirect("/dashboard");
  const ws = ctx.ws;
  const n = notifyOf(ws);
  const msg = sp.m ? decodeURIComponent(sp.m) : null;
  const tg = !!(ws.telegram_bot_token && ws.telegram_chat_id);
  const ex = money(84.9, ws.currency);

  return (
    <>
      {msg && <div className={"flash" + (msg.startsWith("e:") ? " e" : "")}>{msg.slice(msg.indexOf(":") + 1)}</div>}
      {!tg && <div className="flash e">Ligue o Telegram no fim desta página para receber as notificações.</div>}
      <form action={saveNotify}>
        <input type="hidden" name="ws" value={ws.id} />
        <div className="grid g-adv">
          <div className="card form">
            <h2>Notificações de Venda</h2>
            <p className="note">Seja notificado no Telegram sempre que for realizada uma nova venda.</p>
            <Opt name="pending" label="Enviar vendas pendentes" tip="Aviso quando entra um Pix/boleto ainda por pagar." value={n.pending} />
            <Opt name="approved" label="Enviar vendas aprovadas" tip="Aviso a cada venda aprovada." value={n.approved} />
            <label>Valor da venda<select className="input" name="value" defaultValue={n.value}><option value="comissao">Comissão (líquido, depois de taxas)</option><option value="total">Valor total pago</option></select></label>
            <Opt name="product" label="Nome do produto" tip="" value={n.product} yes="Mostrar" no="Esconder" />
            <Opt name="campaign" label="Valor de utm_campaign" tip="" value={n.campaign} yes="Mostrar" no="Esconder" />
            <Opt name="dashname" label="Nome do dashboard" tip="" value={n.dashname} yes="Mostrar" no="Esconder" />
            <h2 style={{ marginTop: 6 }}>Prévia de Notificação</h2>
            <div className="preview"><div className="ic"><Logo size={18} /></div><div><b>Venda aprovada!{n.dashname ? ` | ${ws.name}` : ""}</b><div className="note">{n.value === "comissao" ? "Comissão" : "Valor"}: {ex}{n.product ? " · Produto X" : ""}</div></div></div>
          </div>

          <div className="card form">
            <h2>Notificações de Relatório</h2>
            <p className="note">Configure os relatórios que quer receber ao longo do dia (no fuso do dashboard).</p>
            <h2 style={{ fontSize: 13, margin: "4px 0 0" }}>Horários</h2>
            {[8, 12, 18, 23].map((h) => (
              <label key={h} className="toggle-row" style={{ display: "flex" }}>Notificação das {String(h).padStart(2, "0")}:00
                <input type="checkbox" name={`h${h}`} defaultChecked={n.hours.includes(h)} className="chk" /></label>
            ))}
            <h2 style={{ fontSize: 13, margin: "8px 0 0" }}>Padrão de Notificação</h2>
            {[["lucro", "Status de Lucro", "Só o lucro e o ROAS do dia"], ["detalhado", "Resumo Detalhado", "Faturamento, gastos, lucro, ROAS, ROI, CPA"], ["criativas", "Notificações Criativas", "Mensagens divertidas com o lucro do dia"]].map(([v, l, d]) => (
              <label key={v} className="radio-card"><input type="radio" name="style" value={v} defaultChecked={n.style === v} /><div><b>{l}</b><div className="note">{d}</div></div></label>
            ))}
            <h2 style={{ marginTop: 6 }}>Prévia de Notificação</h2>
            <div className="preview"><div className="ic"><Logo size={18} /></div><div>
              {n.style === "criativas" ? <><b>Dois reais ou um lucro misterioso?</b><div className="note">Parabéns! Você teve {money(149.43, ws.currency)} de lucro até agora… 🎉</div></>
                : n.style === "lucro" ? <><b>🟢 {ws.name} · hoje até às 12h</b><div className="note">Lucro: {money(149.43, ws.currency)} · ROAS 2,10</div></>
                : <><b>📊 Resumo de hoje até às 12h</b><div className="note">Faturamento, gastos, lucro, ROAS, ROI e CPA</div></>}
            </div></div>
          </div>

          <div className="card form" style={{ gridColumn: "1/-1" }}>
            <h2>Telegram {tg ? <span className="ok">• ligado</span> : <span className="mut">• não ligado</span>}</h2>
            <div className="row2">
              <label>Token do bot {ws.telegram_bot_token ? <span className="ok">• definido</span> : <span className="mut">• vazio</span>}
                <input className="input" name="telegram_bot_token" type="password" placeholder={ws.telegram_bot_token ? "deixe vazio para manter" : "cole aqui"} autoComplete="off" />
                <span className="note">No Telegram, fale com @BotFather → /newbot e copie o token.</span></label>
              <label>Chat ID<input className="input" name="telegram_chat_id" defaultValue={ws.telegram_chat_id || ""} />
                <span className="note">Mande uma mensagem ao seu bot e abra api.telegram.org/bot&lt;TOKEN&gt;/getUpdates — o número em “chat”:“id”.</span></label>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="btn">Guardar notificações</button>
        </div>
      </form>
      {tg && <form action={testNotify} style={{ marginTop: 8 }}><input type="hidden" name="ws" value={ws.id} /><button className="btn btn-ghost btn-sm">Enviar relatório de teste agora</button></form>}
    </>
  );
}
