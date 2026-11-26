import { createClient } from "@supabase/supabase-js";

// Cliente com service role: só no servidor. Ignora RLS.
export function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
