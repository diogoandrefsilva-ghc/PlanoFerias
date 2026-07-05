-- =====================================================================
-- PlanoFerias — RLS Policies + Grants (planoferias)
--
-- PRÉ-REQUISITO: DEPENDE das funções em functions.sql
--   planoferias.is_member()
-- Correr functions.sql ANTES deste ficheiro.
--
-- Ordem geral: schema.sql -> functions.sql -> policies.sql -> seed_migration.sql
--
-- Modelo simples: os 2 membros autorizados (Diogo + Margarida) são
-- colaboradores simétricos — qualquer um lê e escreve tudo. Sem RPCs
-- SECURITY DEFINER para as escritas (não há saldos/ledger sensível como
-- no Bet4Fun): a app fala diretamente com as tabelas, protegida pela RLS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- members: cada um vê-se a si e ao outro membro (para mostrar nomes);
-- sem escrita direta pelo cliente (só via ensure_profile()).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS members_select ON planoferias.members;
CREATE POLICY members_select ON planoferias.members
  FOR SELECT TO authenticated
  USING (planoferias.is_member());

-- ---------------------------------------------------------------------
-- config: singleton — membros leem e atualizam (sem insert/delete via
-- cliente; a linha única é criada pelo seed_migration.sql).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS config_select ON planoferias.config;
CREATE POLICY config_select ON planoferias.config
  FOR SELECT TO authenticated USING (planoferias.is_member());

DROP POLICY IF EXISTS config_update ON planoferias.config;
CREATE POLICY config_update ON planoferias.config
  FOR UPDATE TO authenticated
  USING (planoferias.is_member()) WITH CHECK (planoferias.is_member());

-- ---------------------------------------------------------------------
-- Restantes tabelas: CRUD completo para qualquer membro autorizado.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS seg_all ON planoferias.plano_segmentos;
CREATE POLICY seg_all ON planoferias.plano_segmentos
  FOR ALL TO authenticated
  USING (planoferias.is_member()) WITH CHECK (planoferias.is_member());

DROP POLICY IF EXISTS mov_all ON planoferias.movimentos;
CREATE POLICY mov_all ON planoferias.movimentos
  FOR ALL TO authenticated
  USING (planoferias.is_member()) WITH CHECK (planoferias.is_member());

DROP POLICY IF EXISTS penas_all ON planoferias.penas;
CREATE POLICY penas_all ON planoferias.penas
  FOR ALL TO authenticated
  USING (planoferias.is_member()) WITH CHECK (planoferias.is_member());

DROP POLICY IF EXISTS sims_all ON planoferias.sims;
CREATE POLICY sims_all ON planoferias.sims
  FOR ALL TO authenticated
  USING (planoferias.is_member()) WITH CHECK (planoferias.is_member());

-- =====================================================================
-- GRANTS
--   A RLS acima é que filtra as linhas; aqui damos apenas o acesso base.
--
--   ⚠️ EXPOR O SCHEMA: Project Settings → API → Data API → Exposed schemas
--      → adicionar "planoferias" (senão o PostgREST devolve 403/404).
-- =====================================================================

GRANT USAGE ON SCHEMA planoferias TO authenticated;
GRANT SELECT ON planoferias.members TO authenticated;
GRANT SELECT, UPDATE ON planoferias.config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planoferias.plano_segmentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planoferias.movimentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planoferias.penas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planoferias.sims TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA planoferias TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA planoferias TO authenticated;
