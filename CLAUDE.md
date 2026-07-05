# PlanoFerias — guia para o assistente

App pessoal de plano de férias, só para 2 pessoas (Diogo + Margarida).
**Sem build, sem npm.** Site estático (GitHub Pages), PWA. Dados e login vivem no **Supabase**
(schema `planoferias`, no mesmo projeto partilhado do Bet4Fun). Já não há sincronização via
GitHub nem `localStorage` como fonte de dados.

## Estrutura
- `index.html` — markup + CSS + ecrãs de login/sem-acesso/configuração. Carrega `js/app.js`
  como módulo (`<script type="module">`).
- `js/config.js` — credenciais do Supabase (URL + anon key, públicas por design).
- `js/supabase.js` — cliente `supabase-js` (singleton, schema `planoferias`).
- `js/api.js` — camada de dados: todas as queries/CRUD ao Supabase + auth (Google OAuth).
- `js/app.js` — lógica de negócio (ledger, poupança, Edenred Penas, simulação) + rendering +
  ligação de eventos. Sem `localStorage`/GitHub — os dados só existem no Supabase.
- `db/` — SQL do Supabase (`schema.sql`, `functions.sql`, `policies.sql`, `seed_migration.sql`)
  + `db/README.md` com os passos de setup.
- `sw.js` — service worker (cache PWA).
- Não mexer: `apple-touch-icon.png`, `manifest.json`.

## Como NÃO gastar tokens à toa
- Cada ficheiro tem uma responsabilidade (config/cliente/dados/lógica). Para localizar algo,
  procura primeiro o `id` no `index.html`, depois o handler equivalente em `js/app.js`.
- Faz **edições cirúrgicas** (diffs pequenos) dentro de cada ficheiro — não precisas de tocar
  nos outros só porque um mudou.

## Regras técnicas (não partir a app)
- `js/app.js` é um **módulo ES** (`import`/`export`) — os handlers são ligados via
  `addEventListener`/`.onclick =` em `bindEvents()` (chamado uma vez, após o 1º login), não há
  `onclick="…"` inline no HTML.
- **PWA/cache:** se alterares o HTML/CSS/JS, **sobe a versão do CACHE em `sw.js`**.
- **Supabase:** toda a leitura/escrita passa por `js/api.js`. As tabelas vivem no schema
  `planoferias` (RLS restringe a leitura/escrita aos 2 membros autorizados — ver
  `db/functions.sql`, `ensure_profile()`). Se mudares o modelo de dados, atualiza sempre
  `db/schema.sql` primeiro e corre a migração no Supabase antes/depois de alterar o código.
- Os 2 emails autorizados estão fixos em `db/functions.sql` (`ensure_profile`). Não há
  admin/aprovação como no Bet4Fun — quem tem perfil tem acesso total.
- `js/config.js` reaproveita o mesmo `SUPABASE_URL`/anon key do Bet4Fun (projeto Supabase
  partilhado, schema próprio). A anon key é pública por design.

## Deploy
GitHub Pages a partir de `main`. Um push para `main` publica.
