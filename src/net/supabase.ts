import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Cliente do Supabase. Só a chave pública (anon/publishable) vai no front. Sem login. */
let cliente: SupabaseClient | null = null;

export function temSupabase(): boolean {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function supabase(): SupabaseClient {
  if (!cliente) {
    cliente = createClient(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 40 } },
    });
  }
  return cliente;
}
