import { redirect } from "next/navigation";
import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import CopyBox from "@/components/CopyBox";
import { saveSettings, testTelegram, testCapi, testMeta, rotateToken, saveCosts } from "./actions";

const META_PARAMS = "utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}";

function Secret({ name, label, set, hint }: { name: string; label: string; set: boolean; hint?: string }) {
  return (
    <label>{label} {set ? <span className="ok">• definido</span> : <span className="mut">• vazio</span>}
      <input className="input" name={name} type="password" placeholder={set ? "deixe vazio para manter" : ""} autoComplete="off" />
      {set && <span className="note"><input type="checkbox" name={`clear_${name}`} /> apagar</span>}
      {hint && <span className="note">{hint}</span>}
    </label>
  );
}

export default async function Config({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return null;
  if (!ctx.canEdit) redirect("/dashboard");
  const ws = ctx.ws;
  const app = process.env.NEXT_PUBLIC_APP_URL || "";
  const { data: prods } = await admin().from("product_costs").select("*").eq("workspace_id", ws.id).order("product_name");
  const { data: logs } = await admin().from("webhook_logs").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(15);
  const msg = sp.m ? decodeURIComponent(sp.m) : null;
  const H = <input type="hidden" name="ws" value={ws.id} />;

  return (
    <>
      <div className="top"><h1>Configurações · {ws.name}</h1></div>
      {msg && <div className={"flash" + (msg.startsWith("e:") ? " e" : "")}>{msg.slice(msg.indexOf(":") + 1)}</div>}

      <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
        <div className="card form">
          <h2>1. Script nas páginas</h2>
          <p className="note">Cole no &lt;head&gt; de todas as páginas do funil (pré-sell, vendas, upsell). Teste abrindo a página com <code>?utm_debug=1</code>.</p>
          <CopyBox value={`<script src="${app}/utmcai.js" data-ws="${ws.public_key}" async></script>`} />
          <h2 style={{ marginTop: 8 }}>Parâmetros de URL no Meta Ads</h2>
          <p className="note">Em cada anúncio → Rastreamento → Parâmetros de URL. No destino, só a URL da página, sem parâmetros.</p>
          <CopyBox value={META_PARAMS} />
        </div>

        <div className="card form">
          <h2>2. Webhooks dos checkouts</h2>
          <CopyBox label="Stripe (Developers → Webhooks → eventos: checkout.session.completed, checkout.session.async_payment_succeeded, charge.refunded, charge.dispute.created)" value={`${app}/api/webhook/stripe/${ws.webhook_token}`} />
          <CopyBox label="KashPay (painel → Webhooks / Integrações → URL de postback)" value={`${app}/api/webhook/kashpay/${ws.webhook_token}`} />
          <CopyBox label="Genérico (qualquer checkout que envie JSON)" value={`${app}/api/webhook/generic/${ws.webhook_token}`} />
          <form action={rotateToken}>{H}<button className="btn btn-ghost btn-sm">Gerar novo token de webhook</button></form>
        </div>

        <form action={saveSettings} className="card form">
          {H}
          <h2>3. Geral</h2>
          <div className="row2">
            <label>Nome<input className="input" name="name" defaultValue={ws.name} /></label>
            <label>Moeda<input className="input" name="currency" defaultValue={ws.currency} placeholder="BRL, EUR, USD" /></label>
          </div>
          <label>Fuso horário<input className="input" name="timezone" defaultValue={ws.timezone} placeholder="America/Sao_Paulo ou Europe/Lisbon" /></label>

          <h2 style={{ marginTop: 8 }}>4. Meta Ads (gasto e ROAS)</h2>
          <label>IDs das contas de anúncio<input className="input" name="meta_ad_account_ids" defaultValue={ws.meta_ad_account_ids || ""} placeholder="act_123456789, act_987654321" /></label>
          <Secret name="meta_access_token" label="Token de acesso" set={!!ws.meta_access_token}
            hint="Business Manager → Usuários do sistema → Gerar token com as permissões ads_read e ads_management (sem expiração). O ads_management é o que permite pausar, mudar orçamento e duplicar pelo UtmCai." />

          <h2 style={{ marginTop: 8 }}>5. Pixel / API de Conversões</h2>
          <div className="row2">
            <label>Pixel ID<input className="input" name="pixel_id" defaultValue={ws.pixel_id || ""} /></label>
            <label>Test Event Code (opcional)<input className="input" name="capi_test_event_code" defaultValue={ws.capi_test_event_code || ""} placeholder="TEST1234 — apague depois de testar" /></label>
          </div>
          <Secret name="capi_token" label="Token da API de Conversões" set={!!ws.capi_token} hint="Gerenciador de Eventos → Pixel → Configurações → Gerar token de acesso." />
          <p className="note warn">Se o checkout já envia Purchase pelo Pixel dele, o Meta deduplica pelo event_id só se for o mesmo. Para evitar contagem dupla, deixe só um dos dois a enviar Purchase.</p>

          <h2 style={{ marginTop: 8 }}>6. Notificações Telegram</h2>
          <div className="row2">
            <Secret name="telegram_bot_token" label="Token do bot" set={!!ws.telegram_bot_token} hint="Fale com @BotFather → /newbot" />
            <label>Chat ID<input className="input" name="telegram_chat_id" defaultValue={ws.telegram_chat_id || ""} />
              <span className="note">Mande uma mensagem ao bot e abra api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</span></label>
          </div>

          <h2 style={{ marginTop: 8 }}>7. Stripe</h2>
          <Secret name="stripe_webhook_secret" label="Signing secret do webhook (whsec_...)" set={!!ws.stripe_webhook_secret} />

          <h2 style={{ marginTop: 8 }}>8. Mapeamento (KashPay / genérico)</h2>
          <p className="note">Deixe vazio para detecção automática. Se algum campo vier errado, veja o payload no log abaixo e indique o caminho. Exemplo:</p>
          <pre>{`{"external_id":"data.id","status":"data.status","amount":"data.amount","amount_divisor":100,
 "customer_email":"data.customer.email","status_map":{"WAITING_PAYMENT":"pending","PAID":"approved"}}`}</pre>
          <textarea className="input" name="generic_mapping" defaultValue={ws.generic_mapping ? JSON.stringify(ws.generic_mapping, null, 2) : ""} />

          <div><button className="btn">Guardar</button></div>
        </form>

        <form action={saveCosts} className="card form">
          {H}
          <h2>9. Impostos e custos (para o lucro real)</h2>
          <div className="row3">
            <label>Imposto sobre a venda (%)<input className="input" name="tax_percent" defaultValue={ws.tax_percent ?? 0} inputMode="decimal" /></label>
            <label>Taxa do checkout (%)<input className="input" name="gateway_fee_percent" defaultValue={ws.gateway_fee_percent ?? 0} inputMode="decimal" /></label>
            <label>Custo fixo por venda<input className="input" name="fixed_cost_per_sale" defaultValue={ws.fixed_cost_per_sale ?? 0} inputMode="decimal" /></label>
          </div>
          <label>Custo por produto (um por linha, no formato <code>Nome do produto = custo</code>; o nome tem de ser igual ao que o checkout envia)
            <textarea className="input" name="product_costs" defaultValue={(prods || []).map((p: any) => `${p.product_name} = ${p.cost}`).join("\n")} placeholder={"Curso Principal = 0\nOrder bump PDF = 0\nKit físico = 35,90"} />
          </label>
          <div><button className="btn">Guardar custos</button></div>
        </form>

        <div className="card form">
          <h2>Testes</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <form action={testMeta}>{H}<input type="hidden" name="days" value="30" /><button className="btn btn-ghost btn-sm">Sincronizar gasto (30 dias)</button></form>
            <form action={testCapi}>{H}<button className="btn btn-ghost btn-sm">Enviar Purchase de teste</button></form>
            <form action={testTelegram}>{H}<button className="btn btn-ghost btn-sm">Testar Telegram</button></form>
          </div>
        </div>

        <div className="card">
          <h2>Últimos webhooks recebidos</h2>
          {(!logs || !logs.length) && <p className="mut">Nenhum webhook ainda.</p>}
          {(logs || []).map((l: any) => (
            <details key={l.id} style={{ borderBottom: "1px solid var(--line)", padding: "8px 0" }}>
              <summary>
                <span className="mut">{new Date(l.created_at).toLocaleString("pt-BR", { timeZone: ws.timezone })}</span> · <b>{l.provider}</b> ·{" "}
                <span className={String(l.result).startsWith("erro") ? "err" : String(l.result).includes("sem UTM") ? "warn" : "ok"}>{l.result}</span>
              </summary>
              <pre>{JSON.stringify(l.payload, null, 2)}</pre>
            </details>
          ))}
        </div>
      </div>
    </>
  );
}
