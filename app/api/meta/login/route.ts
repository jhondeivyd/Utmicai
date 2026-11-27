import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/session";
import { appCreds, authUrl } from "@/lib/metaoauth";

export const runtime = "nodejs";

// Manda a pessoa para o login do Facebook
export async function GET(req: NextRequest) {
  const wsId = req.nextUrl.searchParams.get("ws") || "";
  const ctx = await getContext();
  const can = ctx.isAdmin || ctx.workspaces.some((w) => w.id === wsId && w.role === "owner");
  const origin = req.nextUrl.origin;
  if (!can) return NextResponse.redirect(`${origin}/integracoes?m=${encodeURIComponent("e:Sem permissão")}`);
  const { id } = await appCreds();
  if (!id) return NextResponse.redirect(`${origin}/integracoes?m=${encodeURIComponent("e:O administrador ainda não configurou a App do Facebook")}`);
  const nonce = crypto.randomUUID();
  const res = NextResponse.redirect(authUrl(id, origin, `${nonce}.${wsId}`));
  res.cookies.set("mstate", nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
