import { NextRequest, NextResponse } from "next/server";

// Troca o dashboard atual e vai para a página pedida
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || "";
  let to = req.nextUrl.searchParams.get("to") || "/dashboard";
  if (!to.startsWith("/") || to.startsWith("//")) to = "/dashboard";
  const res = NextResponse.redirect(new URL(to, req.url));
  if (/^[0-9a-f-]{36}$/.test(id)) res.cookies.set("ws", id, { path: "/", maxAge: 31536000, sameSite: "lax" });
  return res;
}
