import { NextRequest } from "next/server";
import { handleGeneric } from "@/lib/generic-handler";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return handleGeneric(req, token, "generic");
}
