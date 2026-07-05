/* ============================================================
   Cliente Supabase (singleton).
   supabase-js v2 **vendorizado** em js/vendor/supabase.umd.js (carregado
   como <script clássico> no index.html, antes deste módulo) — não depende
   de nenhum CDN externo (esm.sh, jsdelivr, ...). Um import dinâmico de CDN
   já causou uma página em branco sem qualquer erro visível quando a rede
   do utilizador bloqueava/atrasava esse pedido indefinidamente (o módulo
   nunca terminava de avaliar, e a app nunca chegava a arrancar).
   Só é criado quando o config.js tem credenciais reais; caso contrário
   `supabase` fica null e a app mostra o ecrã de configuração (não há modo
   demo/local).
   ============================================================ */

import { CONFIG, IS_CONFIGURED } from "./config.js";

let client = null;
// Se, por algum motivo, o vendor não carregar, `supabase` fica null e esta
// mensagem é usada pelo api.js/app.js para mostrar um ecrã com o erro real
// em vez de a página ficar em branco sem pista nenhuma.
export let LOAD_ERROR = null;

if (IS_CONFIGURED) {
  try {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("js/vendor/supabase.umd.js não carregou (verifica a tag <script> no index.html)");
    }
    client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
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
    console.error("[PlanoFerias] Falha ao iniciar o cliente Supabase:", e);
  }
}

export const supabase = client;
