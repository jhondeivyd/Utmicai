import crypto from "crypto";

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const norm = (v?: string | null) => (v ? v.trim().toLowerCase() : "");

// ---------- Meta Conversions API ----------
export async function sendCapiPurchase(ws: any, sale: any, click: any | null): Promise<string | null> {
  if (!ws.pixel_id || !ws.capi_token) return "Pixel/CAPI não configurado";

  const user_data: Record<string, any> = {};
  if (sale.customer_email) user_data.em = [sha256(norm(sale.customer_email))];
  if (sale.customer_phone) {
    const ph = sale.customer_phone.replace(/\D/g, "");
    if (ph) user_data.ph = [sha256(ph)];
  }
  if (sale.customer_name) {
    const [fn, ...rest] = norm(sale.customer_name).split(/\s+/);
    if (fn) user_data.fn = [sha256(fn)];
    if (rest.length) user_data.ln = [sha256(rest[rest.length - 1])];
  }
  if (sale.customer_email) user_data.external_id = [sha256(norm(sale.customer_email))];
  const ip = click?.ip || sale.customer_ip;
  if (ip) user_data.client_ip_address = ip;
  if (click?.user_agent) user_data.client_user_agent = click.user_agent;
  const fbc = click?.fbc || (click?.fbclid ? `fb.1.${new Date(click.created_at).getTime()}.${click.fbclid}` : null);
  if (fbc) user_data.fbc = fbc;
  if (click?.fbp) user_data.fbp = click.fbp;

  const body: any = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(new Date(sale.approved_at || Date.now()).getTime() / 1000),
      event_id: `${sale.provider}_${sale.external_id}`,
      action_source: "website",
      event_source_url: click?.landing_url || undefined,
      user_data,
      custom_data: {
        value: Number(sale.amount) || 0,
        currency: (sale.currency || ws.currency || "BRL").toUpperCase(),
        order_id: sale.external_id,
        content_name: sale.product_name || undefined
      }
    }]
  };
  if (ws.capi_test_event_code) body.test_event_code = ws.capi_test_event_code;

  try {
    const r = await fetch(`${GRAPH()}/${ws.pixel_id}/events?access_token=${encodeURIComponent(ws.capi_token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    if (!r.ok) return `CAPI ${r.status}: ${(await r.text()).slice(0, 300)}`;
    return null;
  } catch (e: any) {
    return `CAPI erro: ${e?.message || e}`;
  }
}

// ---------- Telegram ----------
export async function sendTelegram(ws: any, text: string): Promise<string | null> {
  if (!ws.telegram_bot_token || !ws.telegram_chat_id) return "Telegram não configurado";
  try {
    const r = await fetch(`https://api.telegram.org/bot${ws.telegram_bot_token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: ws.telegram_chat_id, text, parse_mode: "HTML", disable_web_page_preview: true })
    });
    if (!r.ok) return `Telegram ${r.status}: ${(await r.text()).slice(0, 200)}`;
    return null;
  } catch (e: any) {
    return `Telegram erro: ${e?.message || e}`;
  }
}

export function money(v: number, currency = "BRL") {
  try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v || 0); }
  catch { return `${currency} ${(v || 0).toFixed(2)}`; }
}

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

export const NOTIFY_DEFAULT = { pending: false, approved: true, value: "comissao", product: false, campaign: false, dashname: true, hours: [12, 23], style: "detalhado" };
export const notifyOf = (ws: any) => ({ ...NOTIFY_DEFAULT, ...(ws?.notify || {}) });

// Mensagem de venda (aprovada ou pendente), conforme as opções em Notificações
export function saleMessage(ws: any, sale: any, net?: number) {
  const n = notifyOf(ws);
  const pend = sale.status === "pending";
  const val = n.value === "comissao" && typeof net === "number" ? net : Number(sale.amount);
  const lines = [
    `${pend ? "⏳ <b>Venda pendente</b>" : "💰 <b>Venda aprovada!</b>"}${n.dashname ? " | " + esc(ws.name) : ""}`,
    `${n.value === "comissao" ? "Comissão" : "Valor"}: <b>${money(val, sale.currency || ws.currency)}</b>`,
    n.product && sale.product_name ? `Produto: ${esc(sale.product_name)}` : null,
    n.campaign ? `Campanha: ${esc(String(sale.campaign_name || sale.utm_campaign || "sem rastreio").split("|")[0])}` : null
  ];
  return lines.filter(Boolean).join("\n");
}
