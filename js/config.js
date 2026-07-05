/* ============================================================
   Configuração do PlanoFerias
   ------------------------------------------------------------
   Mesmo projeto Supabase partilhado do Bet4Fun
   (diogoandrefsilva-personalapps-database) — cada app no seu
   próprio schema (aqui: "planoferias"). Ver db/README.md.

   ⚠️ A anon key é PÚBLICA por design — pode ficar aqui. A
   segurança vem toda das políticas RLS + da RPC ensure_profile()
   no Supabase (ver db/README.md). NUNCA metas aqui a service_role key.
   ============================================================ */

export const CONFIG = {
  SUPABASE_URL: "https://gjweqwfbnkgnibhajldc.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdqd2Vxd2ZibmtnbmliaGFqbGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDk4NzUsImV4cCI6MjA5NjY4NTg3NX0.h6st-RayGhQdsqH7E2Ko-rPWk2QZUpTevO6cbjvlSnk",
};

/* A app está configurada quando o URL/anon key deixaram de ser os placeholders. */
export const IS_CONFIGURED =
  !!CONFIG.SUPABASE_URL &&
  !CONFIG.SUPABASE_URL.includes("YOUR-PROJECT") &&
  !!CONFIG.SUPABASE_ANON_KEY &&
  !CONFIG.SUPABASE_ANON_KEY.includes("YOUR-ANON");
