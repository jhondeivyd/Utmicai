import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { exchangeCode } from "@/lib/metaoauth";

export const runtime = "nodejs";

// Volta do Facebook: guarda o acesso no dashboard
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const sp = req.nextUrl.searchParams;
  const go = (m: string, ok = false, tab = "anuncios") =>
    NextResponse.redirect(`${origin}/integracoes?tab=${tab}&m=${encodeURIComponent((ok ? "ok:" : "e:") + m)}`);

  const [nonce, wsId] = String(sp.get("state") || "").split(".");
  if (!nonce || !wsId || req.cookies.get("mstate")?.value !== nonce) return go("Ligação expirou. Tente outra vez.");
  if (sp.get("error")) return go(sp.get("error_description") || "Ligação cancelada no Facebook");
  const code = sp.get("code");
  if (!code) return go("O Facebook não devolveu o código de acesso");

  const ctx = await getContext();
  if (!(ctx.isAdmin || ctx.workspaces.some((w) => w.id === wsId && w.role === "owner"))) return go("Sem permissão");

  try {
    const { token, name, expiresAt } = await exchangeCode(code, origin);
    const { error } = await admin().from("workspaces")
      .update({ meta_access_token: token, meta_token_expires_at: expiresAt, meta_account_name: name }).eq("id", wsId);
    if (error) return go(error.message);
    const res = NextResponse.redirect(`${origin}/integracoes?tab=anuncios&pick=1&m=${encodeURIComponent("ok:Facebook ligado" + (name ? ` — ${name}` : "") + ". Agora escolha as contas de anúncio.")}`);
    res.cookies.delete("mstate");
    return res;
  } catch (e: any) {
    return go(e?.message || "Não foi possível ligar ao Facebook");
  }
}
