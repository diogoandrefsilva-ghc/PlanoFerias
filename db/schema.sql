-- =====================================================================
-- PlanoFerias — Schema DDL (planoferias)
-- Projeto Supabase: diogoandrefsilva-personalapps-database (partilhado
-- com o Bet4Fun, cada app no seu próprio schema).
-- Fonte de verdade. Correr numa BD limpa, por esta ordem:
--   schema.sql -> functions.sql -> policies.sql -> seed_migration.sql
--
-- App só para 2 pessoas fixas (Diogo + Margarida): sem conceito de
-- admin/aprovação como no Bet4Fun — quem entra com um dos 2 emails
-- autorizados (ver functions.sql) fica logo com acesso total de leitura
-- e escrita a todos os dados (conta partilhada do casal).
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS planoferias;

-- ---------------------------------------------------------------------
-- Membros (1:1 com auth.users, criado por ensure_profile() no 1º login)
-- ---------------------------------------------------------------------
CREATE TABLE planoferias.members (
  id           uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  pessoa       text NOT NULL,
  email        text NOT NULL,
  display_name text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT members_pkey PRIMARY KEY (id),
  CONSTRAINT members_pessoa_check CHECK (pessoa IN ('Diogo','Margarida'))
);

-- ---------------------------------------------------------------------
-- Configuração (singleton — 1 única linha, id fixo = 1)
-- ---------------------------------------------------------------------
CREATE TABLE planoferias.config (
  id              smallint NOT NULL DEFAULT 1,
  titulo          text NOT NULL DEFAULT 'Plano de Férias',
  subtitulo       text NOT NULL DEFAULT 'Diogo + Margarida',
  saldo_inicial   numeric NOT NULL DEFAULT 0,
  data_inicial    date NOT NULL,
  split_diogo_pct int NOT NULL DEFAULT 55,
  buffer          numeric NOT NULL DEFAULT 0,
  plano_ativo     boolean NOT NULL DEFAULT false,
  plano_dia_mes   int NOT NULL DEFAULT 1,
  plano_ate       text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT config_pkey PRIMARY KEY (id),
  CONSTRAINT config_singleton_check CHECK (id = 1)
);

-- ---------------------------------------------------------------------
-- Intervalos do plano de poupança mensal (config.planoMensal.segmentos)
-- ---------------------------------------------------------------------
CREATE TABLE planoferias.plano_segmentos (
  id         bigint GENERATED ALWAYS AS IDENTITY,
  desde      text NOT NULL,           -- 'YYYY-MM'
  valor_total numeric NOT NULL,
  diogo_pct  int NOT NULL,
  CONSTRAINT plano_segmentos_pkey PRIMARY KEY (id),
  CONSTRAINT plano_segmentos_desde_unique UNIQUE (desde)
);

-- ---------------------------------------------------------------------
-- Movimentos da conta de férias
-- ---------------------------------------------------------------------
CREATE TABLE planoferias.movimentos (
  id         bigint GENERATED ALWAYS AS IDENTITY,
  data       date NOT NULL,
  descricao  text NOT NULL,
  valor      numeric NOT NULL,
  tipo       text NOT NULL,
  pessoa     text NOT NULL DEFAULT 'Comum',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT movimentos_pkey PRIMARY KEY (id),
  CONSTRAINT movimentos_tipo_check CHECK (tipo IN ('contribuicao','receita','despesa')),
  CONSTRAINT movimentos_pessoa_check CHECK (pessoa IN ('Diogo','Margarida','Comum'))
);
CREATE INDEX idx_movimentos_data ON planoferias.movimentos (data);

-- ---------------------------------------------------------------------
-- Edenred Penas
-- ---------------------------------------------------------------------
CREATE TABLE planoferias.penas (
  id             bigint GENERATED ALWAYS AS IDENTITY,
  data           date NOT NULL,
  valor          numeric NOT NULL,
  obs            text NOT NULL,
  ferias         numeric NOT NULL DEFAULT 0,
  ferias_manual  boolean NOT NULL DEFAULT false,
  base           numeric,
  itens          jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT penas_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_penas_data ON planoferias.penas (data);

-- ---------------------------------------------------------------------
-- Cenários de simulação (não afetam o plano real até serem aplicados)
-- ---------------------------------------------------------------------
CREATE TABLE planoferias.sims (
  id          bigint GENERATED ALWAYS AS IDENTITY,
  tipo        text NOT NULL,
  data        date,
  valor       numeric,
  descricao   text,
  desde       text,
  valor_total numeric,
  diogo_pct   int,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sims_pkey PRIMARY KEY (id),
  CONSTRAINT sims_tipo_check CHECK (tipo IN ('deposito','mensal'))
);

-- ---------------------------------------------------------------------
-- Row Level Security ativa em todas as tabelas (policies em policies.sql)
-- ---------------------------------------------------------------------
ALTER TABLE planoferias.members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE planoferias.config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE planoferias.plano_segmentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE planoferias.movimentos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE planoferias.penas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE planoferias.sims            ENABLE ROW LEVEL SECURITY;
