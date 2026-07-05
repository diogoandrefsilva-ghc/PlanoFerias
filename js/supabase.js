/* ============================================================
   Cliente Supabase (singleton).
   supabase-js v2 via CDN esm — sem build step.
   Só é criado quando o config.js tem credenciais reais; caso
   contrário `supabase` fica null e a app mostra o ecrã de
   configuração (não há modo demo/local).
   ============================================================ */

import { CONFIG, IS_CONFIGURED } from "./config.js";

let client = null;

if (IS_CONFIGURED) {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    // Esta app vive no schema `planoferias` (partilha o projeto Supabase com
    // as outras apps, ex. Bet4Fun). Tem de estar exposto na Data API — ver db/README.md.
    db: { schema: "planoferias" },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // completa o fluxo OAuth no redirect de volta
    },
  });
}

export const supabase = client;
