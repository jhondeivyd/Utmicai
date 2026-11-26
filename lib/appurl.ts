import { headers } from "next/headers";
// URL pública do painel (usa o domínio pelo qual o utilizador está a aceder)
export async function appUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  if (host && !host.startsWith("localhost")) return `https://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL || "";
}
