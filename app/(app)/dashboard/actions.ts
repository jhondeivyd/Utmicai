"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertCanEdit } from "@/lib/session";
import { syncWorkspaceSpend } from "@/lib/ingest";

export async function syncNow(fd: FormData) {
  const ctx = await assertCanEdit(String(fd.get("ws")));
  const r = await syncWorkspaceSpend(ctx.ws, Number(fd.get("days")) || 7);
  revalidatePath("/dashboard");
  redirect(`/dashboard?sync=${encodeURIComponent((r.ok ? "ok:" : "e:") + r.msg)}`);
}
