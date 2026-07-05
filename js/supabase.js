/* ============================================================
   Cliente Supabase (singleton).
   supabase-js v2 via CDN esm — sem build step.
   Só é criado quando o config.js tem credenciais reais; caso
   contrário `supabase` fica null e a app mostra o ecrã de
   configuração (não há modo demo/local).
   ============================================================ */

import { CONFIG, IS_CONFIGURED } from "./config.js";

let client = null;
// Se o import do CDN falhar (rede/firewall/anti-adblock), `supabase` fica
// null e esta mensagem é usada pelo api.js/app.js — sem isto, uma falha
// aqui rebentava a avaliação do módulo inteiro e a página ficava em branco
// sem pista nenhuma do que correu mal.
export let LOAD_ERROR = null;

if (IS_CONFIGURED) {
  try {
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
  } catch (e) {
    LOAD_ERROR = e;
    console.error("[PlanoFerias] Falha ao carregar supabase-js:", e);
  }
}

export const supabase = client;
