import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { exchangeCode } from "@/lib/metaoauth";

export const runtime = "nodejs";

// Volta do Facebook: guarda o acesso no dashboard.
// Dois caminhos: dentro do painel (cookie) ou por link de ligação (multilogin).
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const sp = req.nextUrl.searchParams;
  const state = String(sp.get("state") || "");
  const porLink = state.startsWith("l.");
  const linkToken = porLink ? state.slice(2) : "";

  const go = (m: string, ok = false) => NextResponse.redirect(
    porLink ? `${origin}/ligado?e=${encodeURIComponent(m)}`
            : `${origin}/integracoes?tab=anuncios&m=${encodeURIComponent((ok ? "ok:" : "e:") + m)}`);

  if (sp.get("error")) return go(sp.get("error_description") || "Ligação cancelada no Facebook");
  const code = sp.get("code");
  if (!code) return go("O Facebook não devolveu o código de acesso");

  const db = admin();
  let wsId = "";

  if (porLink) {
    const { data: link } = await db.from("connect_links").select("*").eq("token", linkToken).maybeSingle();
    if (!link) return go("Este link não existe");
    if (link.used_at) return go("Este link já foi usado. Peça um novo no painel.");
    if (new Date(link.expires_at) < new Date()) return go("Este link expirou. Peça um novo no painel.");
    wsId = link.workspace_id;
  } else {
    const [nonce, id] = state.split(".");
    if (!nonce || !id || req.cookies.get("mstate")?.value !== nonce) return go("Ligação expirou. Tente outra vez.");
    const ctx = await getContext();
    if (!(ctx.isAdmin || ctx.workspaces.some((w) => w.id === id && w.role === "owner"))) return go("Sem permissão");
    wsId = id;
  }

  try {
    const { token, name, expiresAt } = await exchangeCode(code, origin);
    const { error } = await db.from("workspaces")
      .update({ meta_access_token: token, meta_token_expires_at: expiresAt, meta_account_name: name }).eq("id", wsId);
    if (error) return go(error.message);

    if (porLink) {
      await db.from("connect_links").update({ used_at: new Date().toISOString(), used_name: name }).eq("token", linkToken);
      return NextResponse.redirect(`${origin}/ligado?nome=${encodeURIComponent(name || "")}`);
    }
    const res = NextResponse.redirect(`${origin}/integracoes?tab=anuncios&pick=1&m=${encodeURIComponent("ok:Facebook ligado" + (name ? ` — ${name}` : "") + ". Agora escolha as contas de anúncio.")}`);
    res.cookies.delete("mstate");
    return res;
  } catch (e: any) {
    return go(e?.message || "Não foi possível ligar ao Facebook");
  }
}
