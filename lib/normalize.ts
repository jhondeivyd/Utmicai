// Converte payloads de qualquer checkout num formato único de venda.

export type SaleStatus = "approved" | "pending" | "refunded" | "chargeback" | "canceled";

export type NormalizedSale = {
  external_id: string;
  payment_ref?: string | null;
  status: SaleStatus;
  amount: number;
  currency?: string | null;
  product_name?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_ip?: string | null;
  approved_at?: string | null;
  payment_method?: string | null;
};

export type Utms = {
  utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null;
  utm_content?: string | null; utm_term?: string | null;
};

// ---------- utilitários ----------
export function getPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function first(obj: any, paths: string[]): any {
  for (const p of paths) {
    const v = getPath(obj, p);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

// Procura uma chave em qualquer nível do JSON (ex: "utm_source" dentro de tracking, metadata...)
export function deepFind(obj: any, key: string, depth = 0): any {
  if (!obj || typeof obj !== "object" || depth > 6) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== null && obj[key] !== "") return obj[key];
  for (const k of Object.keys(obj)) {
    const r = deepFind(obj[k], key, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

// cid do UtmCai: "uc" + 18 caracteres [a-z0-9]
const CID_RE = /\buc[a-z0-9]{18}\b/;
export function findClickId(payload: any): string | null {
  try {
    const m = JSON.stringify(payload).match(CID_RE);
    return m ? m[0] : null;
  } catch { return null; }
}

export function findUtms(payload: any): Utms {
  const out: Utms = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const) {
    const v = deepFind(payload, k);
    if (typeof v === "string" && v && !/^\{\{.*\}\}$/.test(v)) out[k] = v;
  }
  return out;
}

export function normalizeStatus(raw: any): SaleStatus {
  const s = String(raw ?? "").toLowerCase();
  if (/unpaid|not_?paid|waiting|aguard|pending|pendente|awaiting|process/.test(s)) return "pending";
  if (/charge_?back|dispute|contestad/.test(s)) return "chargeback";
  if (/refund|reembols|estorn|devolvid/.test(s)) return "refunded";
  if (/cancel|fail|refus|recusad|expir|declin|denied|negad/.test(s)) return "canceled";
  if (/paid|approv|aprovad|pago|complet|succe|confirm|captur|settled|conclu/.test(s)) return "approved";
  return "pending";
}

export function toNumber(v: any): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    let s = v.replace(/[^\d,.-]/g, "");
    if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// ---------- normalizador genérico (também usado para a KashPay) ----------
export type GenericMapping = {
  external_id?: string; status?: string; amount?: string; currency?: string;
  product_name?: string; customer_email?: string; customer_name?: string; customer_phone?: string; customer_ip?: string; payment_method?: string;
  amount_divisor?: number;               // 100 se o checkout manda o valor em centavos
  status_map?: Record<string, SaleStatus>; // ex: {"WAITING_PAYMENT":"pending"}
};

const DEFAULTS: Record<string, string[]> = {
  external_id: ["id", "order_id", "transaction_id", "sale_id", "payment_id", "data.id", "order.id", "sale.id",
    "transaction.id", "payment.id", "data.order_id", "data.transaction_id"],
  status: ["status", "payment_status", "data.status", "order.status", "sale.status", "transaction.status",
    "payment.status", "data.payment_status", "event", "type"],
  amount: ["amount", "value", "total", "total_price", "price", "data.amount", "data.value", "data.total",
    "order.amount", "order.total", "sale.amount", "transaction.amount", "payment.amount", "payment.value"],
  currency: ["currency", "data.currency", "order.currency", "transaction.currency", "payment.currency"],
  product_name: ["product.name", "product_name", "offer.name", "items.0.name", "products.0.name", "data.product.name",
    "order.product.name", "data.items.0.name"],
  customer_email: ["customer.email", "buyer.email", "client.email", "email", "customer_email", "data.customer.email",
    "order.customer.email", "payer.email", "data.buyer.email"],
  customer_name: ["customer.name", "buyer.name", "client.name", "name", "customer_name", "data.customer.name",
    "order.customer.name", "payer.name"],
  customer_phone: ["customer.phone", "buyer.phone", "client.phone", "phone", "customer_phone", "data.customer.phone",
    "customer.phone_number", "payer.phone"],
  customer_ip: ["customer.ip", "ip", "client_ip", "data.customer.ip", "buyer.ip"],
  payment_method: ["payment_method", "paymentMethod", "payment_type", "paymentType", "method", "billing_type", "data.payment_method",
    "data.paymentMethod", "payment.method", "payment.type", "transaction.payment_method", "order.payment_method", "data.payment.method"]
};

// cartão | pix | boleto | outro
export function normalizeMethod(raw: any): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const s = (typeof raw === "object" ? JSON.stringify(raw) : String(raw)).toLowerCase();
  if (/pix/.test(s)) return "pix";
  if (/boleto|bank_slip|billet|ticket/.test(s)) return "boleto";
  if (/card|cart|credit|debit|visa|master|apple_pay|google_pay|link/.test(s)) return "card";
  if (/mbway|mb_way|multibanco/.test(s)) return "mbway";
  if (/paypal/.test(s)) return "paypal";
  return "outro";
}

export function normalizeGeneric(payload: any, mapping?: GenericMapping | null): NormalizedSale | null {
  const m = mapping || {};
  const pick = (field: keyof typeof DEFAULTS) => {
    const custom = (m as any)[field];
    return custom ? getPath(payload, custom) : first(payload, DEFAULTS[field]);
  };
  const id = pick("external_id");
  if (id === undefined || id === null || id === "") return null;

  const rawStatus = pick("status");
  let status: SaleStatus | undefined = m.status_map?.[String(rawStatus)];
  if (!status) status = normalizeStatus(rawStatus);

  const divisor = m.amount_divisor && m.amount_divisor > 0 ? m.amount_divisor : 1;
  const amount = Math.round((toNumber(pick("amount")) / divisor) * 100) / 100;

  const str = (v: any) => (v === undefined || v === null || v === "" ? null : String(v));
  return {
    external_id: String(id),
    status,
    amount,
    currency: str(pick("currency"))?.toUpperCase() ?? null,
    product_name: str(pick("product_name")),
    customer_email: str(pick("customer_email"))?.toLowerCase() ?? null,
    customer_name: str(pick("customer_name")),
    customer_phone: str(pick("customer_phone")),
    customer_ip: str(pick("customer_ip")),
    payment_method: normalizeMethod(pick("payment_method"))
  };
}

// ---------- UTM → campanha / conjunto / anúncio ----------
// Formato recomendado nos Parâmetros de URL do Meta: "nome|id"
function splitNameId(v?: string | null): { name: string | null; id: string | null } {
  if (!v) return { name: null, id: null };
  const parts = v.split("|");
  if (parts.length >= 2) {
    const id = parts[parts.length - 1].trim();
    const name = parts.slice(0, -1).join("|").trim();
    return { name: name || null, id: /^\d{6,}$/.test(id) ? id : null };
  }
  if (/^\d{10,}$/.test(v.trim())) return { name: null, id: v.trim() };
  return { name: v.trim(), id: null };
}

export function utmToAd(u: Utms) {
  const c = splitNameId(u.utm_campaign);
  const s = splitNameId(u.utm_medium);
  const a = splitNameId(u.utm_content);
  return {
    campaign_id: c.id, campaign_name: c.name,
    adset_id: s.id, adset_name: s.name,
    ad_id: a.id, ad_name: a.name,
    placement: u.utm_term || null
  };
}
