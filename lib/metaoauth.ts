// Ligar a conta do Facebook por login (OAuth), sem token colado à mão
import { admin } from "./supabase/admin";

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;
export const SCOPES = "ads_read,ads_management,business_management";

export async function appCreds() {
  const { data } = await admin().from("app_settings").select("key,value").in("key", ["meta_app_id", "meta_app_secret"]);
  const get = (k: string) => (data || []).find((x: any) => x.key === k)?.value || "";
  return {
    id: get("meta_app_id") || process.env.META_APP_ID || "",
    secret: get("meta_app_secret") || process.env.META_APP_SECRET || ""
  };
}

export const redirectUri = (origin: string) => `${origin}/api/meta/callback`;

export function authUrl(appId: string, origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: appId, redirect_uri: redirectUri(origin), state,
    scope: SCOPES, response_type: "code"
  });
  return `https://www.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/dialog/oauth?${p}`;
}

async function gget(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j?.error?.error_user_msg || j?.error?.message || `Meta ${r.status}`);
  return j;
}

// código do login → token de curta duração → token de longa duração (cerca de 60 dias)
export async function exchangeCode(code: string, origin: string) {
  const { id, secret } = await appCreds();
  if (!id || !secret) throw new Error("App do Facebook não configurada");
  const short = await gget(`${GRAPH()}/oauth/access_token?${new URLSearchParams({
    client_id: id, client_secret: secret, redirect_uri: redirectUri(origin), code
  })}`);
  const long = await gget(`${GRAPH()}/oauth/access_token?${new URLSearchParams({
    grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: short.access_token
  })}`);
  const token = long.access_token as string;
  const expires = Number(long.expires_in || short.expires_in || 0);
  const me = await gget(`${GRAPH()}/me?fields=name&access_token=${token}`).catch(() => ({ name: null }));
  return { token, name: me.name as string | null, expiresAt: expires ? new Date(Date.now() + expires * 1000).toISOString() : null };
}

// contas de anúncio a que esta pessoa tem acesso
export async function listAdAccounts(token: string) {
  const out: any[] = [];
  let url: string | null = `${GRAPH()}/me/adaccounts?fields=id,name,account_status,currency,business{name}&limit=200&access_token=${token}`;
  let guard = 0;
  while (url && guard++ < 10) {
    const j = await gget(url);
    out.push(...(j.data || []));
    url = j.paging?.next || null;
  }
  return out.map((a) => ({
    id: a.id as string, name: (a.name || a.id) as string, currency: a.currency as string,
    business: a.business?.name || null, active: a.account_status === 1
  }));
}
