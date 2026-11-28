import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { appCreds, authUrl } from "@/lib/metaoauth";

export const runtime = "nodejs";

// Link para ligar o Facebook noutro navegador (multilogin).
// Não precisa de sessão no UtmCai: o próprio link dá a autorização, uma vez só.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const origin = req.nextUrl.origin;
  const bad = (m: string) => NextResponse.redirect(`${origin}/ligado?e=${encodeURIComponent(m)}`);

  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return bad("Link inválido");
  const { data: link } = await admin().from("connect_links").select("*").eq("token", token).maybeSingle();
  if (!link) return bad("Este link não existe");
  if (link.used_at) return bad("Este link já foi usado. Peça um novo no painel.");
  if (new Date(link.expires_at) < new Date()) return bad("Este link expirou. Peça um novo no painel.");

  const { id } = await appCreds();
  if (!id) return bad("A App do Facebook ainda não está configurada");
  return NextResponse.redirect(authUrl(id, origin, `l.${token}`));
}
