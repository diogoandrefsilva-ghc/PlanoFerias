-- =====================================================================
-- PlanoFerias — Migração dos dados reais (de AppDataJSON/planoferias-data.json)
-- Corre UMA VEZ, depois de schema.sql -> functions.sql -> policies.sql,
-- numa BD limpa (schema planoferias sem linhas ainda).
-- =====================================================================

INSERT INTO planoferias.config (id, titulo, subtitulo, saldo_inicial, data_inicial, split_diogo_pct, buffer, plano_ativo, plano_dia_mes, plano_ate)
VALUES (1, 'Plano de Férias', 'Diogo + Margarida', 2900, '2026-04-04', 55, 0, true, 1, '2027-08')
ON CONFLICT (id) DO NOTHING;

INSERT INTO planoferias.plano_segmentos (desde, valor_total, diogo_pct) VALUES
  ('2026-05', 360, 55)
ON CONFLICT (desde) DO NOTHING;

INSERT INTO planoferias.movimentos (data, descricao, valor, tipo, pessoa) VALUES
  ('2026-04-23', 'Reembolso IRS',              1136.2,   'receita',      'Comum'),
  ('2026-04-23', 'Voos Paris',                 -513.99,  'despesa',      'Comum'),
  ('2026-04-23', 'Depósito Disney',            -344.46,  'despesa',      'Comum'),
  ('2026-04-23', 'Sinal Altura',                -450,    'despesa',      'Comum'),
  ('2026-05-26', 'Santa Eulália',              -1375.89, 'despesa',      'Comum'),
  ('2026-06-29', 'Depósito Férias Diogo',       825,     'contribuicao', 'Diogo'),
  ('2026-07-05', 'Depósito Férias Margarida',   675,     'contribuicao', 'Comum'),
  ('2026-07-12', 'Adriana',                    -1704.9,  'despesa',      'Comum'),
  ('2026-08-16', 'Altura',                      -950,    'despesa',      'Comum'),
  ('2026-11-25', 'Disneyland',                 -1985.12, 'despesa',      'Comum');

INSERT INTO planoferias.penas (data, valor, obs, ferias, ferias_manual, base, itens) VALUES
  ('2026-06-06', 826,     'Saldo Edenred',        0,   false, NULL, '[]'),
  ('2026-06-30', 320,     'Carregamento Edenred', 0,   false, NULL, '[]'),
  ('2026-06-30', -505,    'Mensalidade Penas',    0,   false, NULL, '[]'),
  ('2026-07-31', 320,     'Carregamento Edenred', 0,   false, NULL, '[]'),
  ('2026-07-31', -505,    'Mensalidade Ago/26',   0,   false, NULL, '[]'),
  ('2026-08-31', 320,     'Carregamento Edenred', 0,   false, NULL, '[]'),
  ('2026-08-31', -625,    'Mensalidade Set/26',   625, true,  590,  '[{"d":"Seguro Anual","v":35}]'),
  ('2026-09-30', 320,     'Carregamento Edenred', 0,   false, NULL, '[]'),
  ('2026-09-30', -514.25, 'Mensalidade Out/26',   0,   false, 590,  '[{"d":"Desconto Agosto","v":-75.75}]'),
  ('2026-10-31', 320,     'Carregamento Edenred', 0,   false, NULL, '[]'),
  ('2026-10-31', -590,    'Mensalidade Nov/26',   0,   false, NULL, '[]'),
  ('2026-11-30', 320,     'Carregamento Edenred', 0,   false, NULL, '[]'),
  ('2026-11-30', -590,    'Mensalidade Dez/26',   0,   false, NULL, '[]');
