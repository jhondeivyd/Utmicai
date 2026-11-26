import { redirect } from "next/navigation";
import NoWs from "@/components/NoWs";
import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/appurl";
import CopyBox from "@/components/CopyBox";
import UtmBuilder from "@/components/UtmBuilder";
import Icon from "@/components/Icon";
import { saveSettings, testTelegram, testCapi, testMeta, rotateToken } from "./actions";

const META_PARAMS = "utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}";
const TABS: [string, string, string][] = [["anuncios", "Anúncios", "meta"], ["webhooks", "Webhooks", "plug"], ["utms", "UTMs", "utm"], ["pixel", "Pixel", "events"], ["testes", "Testes", "play"]];

function Secret({ name, label, set, hint }: { name: string; label: string; set: boolean; hint?: string }) {
  return (
    <label>{label} {set ? <span className="ok">• definido</span> : <span className="mut">• vazio</span>}
      <input className="input" name={name} type="password" placeholder={set ? "deixe vazio para manter" : "cole aqui"} autoComplete="off" />
      {set && <span className="note"><input type="checkbox" name={`clear_${name}`} /> apagar</span>}
      {hint && <span className="note">{hint}</span>}
    </label>
  );
}

export default async function Integracoes({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ws) return <NoWs />;
  if (!ctx.canEdit) redirect("/dashboard");
  const ws = ctx.ws;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab : "anuncios";
  const app = await appUrl();
  const msg = sp.m ? decodeURIComponent(sp.m) : null;
  const H = <><input type="hidden" name="ws" value={ws.id} /><input type="hidden" name="tab" value={tab} /></>;
  const accounts = String(ws.meta_ad_account_ids || "").split(",").map((x) => x.trim()).filter(Boolean);
  const steps = [!!ws.meta_access_token && accounts.length > 0, true, !!ws.pixel_id];
  const db = admin();
  const logs = tab === "testes" || tab === "webhooks" ? (await db.from("webhook_logs").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(15)).data || [] : [];
  const clicks = tab === "testes" ? (await db.from("clicks").select("id,utm_source,utm_campaign,landing_url,created_at").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(8)).data || [] : [];
  const when = (d: string) => new Date(d).toLocaleString("pt-BR", { timeZone: ws.timezone, dateStyle: "short", timeStyle: "short" });

  return (
    <>
      {msg && <div className={"flash" + (msg.startsWith("e:") ? " e" : "")}>{msg.slice(msg.indexOf(":") + 1)}</div>}
      <div className="card" style={{ padding: "12px 16px", marginBottom: 14 }}>
        <b>{steps.every(Boolean) ? "Configuração COMPLETA!" : "Configuração em falta"}</b>
        <div className="note">{steps[0] ? "✓ Meta Ads ligado" : "• Ligue o Meta Ads"} · {"✓ Webhooks prontos a usar"} · {steps[2] ? "✓ Pixel configurado" : "• Pixel por configurar (opcional)"}</div>
      </div>
      <div className="subtabs">
        {TABS.map(([k, l, ic]) => <a key={k} href={`/integracoes?tab=${k}`} className={k === tab ? "on" : ""}><Icon name={ic} size={16} />{l}</a>)}
      </div>

      {tab === "anuncios" && (
        <div className="grid g-adv">
          <form action={saveSettings} className="card form">
            {H}
            <div className="card-h"><h2><span style={{ display: "inline-flex", verticalAlign: "-3px", marginRight: 6 }}><Icon name="meta" /></span>Meta Ads</h2>
              <span className={"badge " + (ws.meta_access_token ? "b-approved" : "b-pending")}>{ws.meta_access_token ? "Ligado" : "Não ligado"}</span></div>
            <Secret name="meta_access_token" label="Token de acesso" set={!!ws.meta_access_token}
              hint="Business Manager → Usuários do sistema → Gerar token com ads_read e ads_management (sem expiração)." />
            <label>Contas de anúncio (IDs)<input className="input" name="meta_ad_account_ids" defaultValue={ws.meta_ad_account_ids || ""} placeholder="act_123456789, act_987654321" />
              <span className="note">Gestor de Anúncios → menu das contas → o número da conta. Separe várias por vírgula.</span></label>
            <div><button className="btn">Guardar</button></div>
          </form>
          <div className="card">
            <h2>Contas de Anúncio (Meta)</h2>
            <p className="note">Contas que o UtmCai lê a cada hora (gasto, campanhas, conjuntos e anúncios).</p>
            <div className="list" style={{ marginTop: 10 }}>
              {accounts.map((a) => <div key={a} className="int-row"><span>Conta {a.replace("act_", "")}</span><span className="ok">ativa</span></div>)}
              {!accounts.length && <p className="mut">Nenhuma conta ainda.</p>}
            </div>
            {ws.meta_access_token && (
              <form action={testMeta} style={{ marginTop: 12 }}>{H}<input type="hidden" name="days" value="30" /><button className="btn btn-ghost btn-sm">Sincronizar agora (últimos 30 dias)</button></form>
            )}
            {ws.meta_last_sync_at && <p className="note" style={{ marginTop: 8 }}>Última sincronização: {when(ws.meta_last_sync_at)}</p>}
          </div>
        </div>
      )}

      {tab === "webhooks" && (
        <div className="grid g-adv">
          <div className="card form">
            <h2>Webhooks</h2>
            <p className="note">Cole estas URLs na plataforma de venda para o UtmCai receber cada venda.</p>
            <CopyBox label="Stripe — Developers → Webhooks. Eventos: checkout.session.completed, checkout.session.async_payment_succeeded, charge.refunded, charge.dispute.created" value={`${app}/api/webhook/stripe/${ws.webhook_token}`} />
            <CopyBox label="KashPay — painel → Webhooks / Integrações → URL de postback" value={`${app}/api/webhook/kashpay/${ws.webhook_token}`} />
            <CopyBox label="Genérico — qualquer checkout que envie JSON" value={`${app}/api/webhook/generic/${ws.webhook_token}`} />
            <form action={rotateToken}>{H}<button className="btn btn-ghost btn-sm">Gerar novo token de webhook</button></form>
          </div>
          <form action={saveSettings} className="card form">
            {H}
            <h2>Credenciais de API</h2>
            <Secret name="stripe_webhook_secret" label="Stripe — Signing secret do webhook (whsec_...)" set={!!ws.stripe_webhook_secret} hint="Aparece na página do webhook no Stripe, em “Signing secret”." />
            <label>Mapeamento de campos (KashPay / genérico) <span className="note">— deixe vazio para detecção automática</span>
              <textarea className="input" name="generic_mapping" defaultValue={ws.generic_mapping ? JSON.stringify(ws.generic_mapping, null, 2) : ""}
                placeholder={`{"external_id":"data.id","status":"data.status","amount":"data.amount","amount_divisor":100}`} /></label>
            <div><button className="btn">Guardar</button></div>
          </form>
          <div className="card" style={{ gridColumn: "1/-1" }}>
            <h2>Últimos webhooks recebidos</h2>
            <Logs logs={logs} when={when} />
          </div>
        </div>
      )}

      {tab === "utms" && (
        <div className="grid g-adv">
          <div className="card form">
            <h2>Códigos</h2>
            <CopyBox label="Código de UTMs do Facebook — Gestor de Anúncios → anúncio → Rastreamento → Parâmetros de URL" value={META_PARAMS} />
            <h2 style={{ marginTop: 10 }}>Scripts</h2>
            <CopyBox label="Script de UTMs — cole no <head> de todas as páginas (pré-sell, vendas, upsell)" value={`<script src="${app}/utmcai.js" data-ws="${ws.public_key}" async></script>`} />
            <p className="note">O script guarda as UTMs do anúncio e passa-as para o link do checkout (Stripe, KashPay ou outro). Para testar, abra a sua página com <code>?utm_debug=1</code>.</p>
          </div>
          <div className="card">
            <h2>Gerar UTMs orgânicas</h2>
            <p className="note" style={{ marginBottom: 10 }}>Configure UTMs para o seu tráfego orgânico (bio, stories, e-mail, WhatsApp).</p>
            <UtmBuilder />
          </div>
        </div>
      )}

      {tab === "pixel" && (
        <form action={saveSettings} className="card form" style={{ maxWidth: 720 }}>
          {H}
          <h2>Pixel / API de Conversões</h2>
          <p className="note">Com o Pixel ligado, o UtmCai envia cada venda aprovada ao Meta pela API de Conversões, para melhorar a otimização das campanhas.</p>
          <div className="row2">
            <label>Pixel ID<input className="input" name="pixel_id" defaultValue={ws.pixel_id || ""} /></label>
            <label>Test Event Code (opcional)<input className="input" name="capi_test_event_code" defaultValue={ws.capi_test_event_code || ""} placeholder="TEST1234 — apague depois de testar" /></label>
          </div>
          <Secret name="capi_token" label="Token da API de Conversões" set={!!ws.capi_token} hint="Gerenciador de Eventos → Pixel → Configurações → Gerar token de acesso." />
          <p className="note warn">Se o checkout também envia Purchase pelo Pixel dele, deixe só um dos dois a enviar, para não contar a venda duas vezes.</p>
          <div><button className="btn">Guardar</button></div>
        </form>
      )}

      {tab === "testes" && (
        <div className="grid g-adv">
          <div className="card form">
            <h2>Testes</h2>
            <div className="int-row"><div><b>Script nas páginas</b><div className="note">Abra a sua página com ?utm_debug=1 — deve aparecer um aviso do UtmCai. Os cliques aparecem ao lado.</div></div></div>
            <form action={testMeta} className="int-row">{H}<input type="hidden" name="days" value="30" /><div><b>Meta Ads</b><div className="note">Puxa o gasto e as campanhas dos últimos 30 dias.</div></div><button className="btn btn-ghost btn-sm">Testar</button></form>
            <form action={testCapi} className="int-row">{H}<div><b>Pixel / CAPI</b><div className="note">Envia um Purchase de teste (precisa do Test Event Code).</div></div><button className="btn btn-ghost btn-sm">Testar</button></form>
            <form action={testTelegram} className="int-row">{H}<div><b>Telegram</b><div className="note">Envia uma mensagem de teste para o seu chat.</div></div><button className="btn btn-ghost btn-sm">Testar</button></form>
          </div>
          <div className="card">
            <h2>Últimos cliques registados pelo script</h2>
            {!clicks.length && <p className="mut">Nenhum clique ainda.</p>}
            {clicks.map((c: any) => (
              <div key={c.id} className="toggle-row"><span>{when(c.created_at)} · <b>{c.utm_source || "sem UTM"}</b> {c.utm_campaign ? "· " + String(c.utm_campaign).split("|")[0] : ""}</span><span className="note" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.landing_url}</span></div>
            ))}
          </div>
          <div className="card" style={{ gridColumn: "1/-1" }}>
            <h2>Últimos webhooks recebidos</h2>
            <Logs logs={logs} when={when} />
          </div>
        </div>
      )}
    </>
  );
}

function Logs({ logs, when }: { logs: any[]; when: (d: string) => string }) {
  if (!logs.length) return <p className="mut">Nenhum webhook ainda.</p>;
  return (
    <>
      {logs.map((l: any) => (
        <details key={l.id} style={{ borderBottom: "1px solid var(--line)", padding: "8px 0" }}>
          <summary>
            <span className="mut">{when(l.created_at)}</span> · <b>{l.provider}</b> ·{" "}
            <span className={String(l.result).startsWith("erro") ? "err" : String(l.result).includes("sem UTM") ? "warn" : "ok"}>{l.result}</span>
          </summary>
          <pre>{JSON.stringify(l.payload, null, 2)}</pre>
        </details>
      ))}
    </>
  );
}
