import { NextRequest } from "next/server";
import { handleGeneric } from "@/lib/generic-handler";

export const runtime = "nodejs";

// A KashPay usa o leitor genérico (detecta id, status, valor e cliente automaticamente).
// Se algum campo vier errado, ajuste o "Mapeamento" nas Configurações olhando o log do webhook.
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return handleGeneric(req, token, "kashpay");
}
