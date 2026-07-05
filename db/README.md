# PlanoFerias — Base de dados (Supabase)

Fonte de verdade do schema. **Edita aqui primeiro, depois aplica no Supabase** — nunca ao contrário.

App-alvo: *PlanoFerias*, de uso pessoal só para 2 pessoas (Diogo + Margarida). Ao contrário do
Bet4Fun, aqui não há conceito de admin/aprovação: os 2 emails autorizados (fixos, ver
`functions.sql`) são colaboradores simétricos com acesso total de leitura e escrita a todos os
dados — é a conta partilhada do casal.

## Schema dedicado

Como no Bet4Fun, esta app vive num **schema próprio** (`planoferias`) dentro do projeto Supabase
partilhado (`diogoandrefsilva-personalapps-database`), para não colidir com as outras apps. Isto
implica dois passos de configuração:

1. **Expor o schema**: Project Settings → API → Data API → *Exposed schemas* → adiciona
   `planoferias`. (Sem isto o PostgREST devolve 403/404.)
2. O frontend já aponta para o schema em `js/supabase.js` (`db: { schema: 'planoferias' }`).

## Ordem de execução (BD limpa)

Corre no SQL Editor do Supabase, **por esta ordem**:

1. **`schema.sql`** — schema `planoferias`, tabelas (+ RLS ativa).
2. **`functions.sql`** — `is_member()` e a RPC `ensure_profile()` (inscrição no 1º login; só
   aceita os 2 emails autorizados — ver abaixo).
3. **`policies.sql`** — RLS policies + grants.
4. **`seed_migration.sql`** — migração dos dados reais que estavam em
   `AppDataJSON/planoferias-data.json`. Corre **uma única vez**, numa BD limpa (não é idempotente
   para `movimentos`/`penas` — voltar a correr duplica as linhas).

`policies.sql` depende de `functions.sql` (usa `planoferias.is_member()`). Correr fora de ordem
rebenta com *"function ... does not exist"*.

## Passos completos (uma vez)

1. Corre os 4 ficheiros SQL pela ordem acima.
2. **Authentication → Providers → Google** — já deve estar ativo (partilhado com o Bet4Fun). Em
   **URL Configuration**, garante que o Site URL / Redirect URLs incluem o endereço onde vais
   alojar o PlanoFerias (ex.: `https://diogoandrefsilva-ghc.github.io/PlanoFerias/`), já que é um
   caminho diferente do Bet4Fun no mesmo domínio GitHub Pages.
3. **Expor o schema `planoferias`** na Data API (ver acima).
4. `js/config.js` já aponta para o mesmo `SUPABASE_URL` + `anon key` do Bet4Fun (mesmo projeto
   partilhado) — não precisas de mexer, a não ser que uses um projeto Supabase diferente.

## Modelo de segurança

- **Membro autorizado** (`planoferias.members`): só existe para os 2 emails fixos em
  `ensure_profile()` (`diogo.andre.f.silva@gmail.com` → Diogo, `margaridamano.lgf@gmail.com` →
  Margarida). Qualquer outro email autenticado com Google não recebe perfil — a RPC lança
  exceção e a app termina a sessão e mostra "não autorizado".
- Sem gate de aprovação: quem tem perfil, tem acesso total (leitura + escrita direta às tabelas,
  sem RPCs `SECURITY DEFINER` — não há saldos/ledger sensível a proteger como no Bet4Fun).
- **`config`** é uma tabela singleton (`id` fixo = 1); os membros só a atualizam (sem
  insert/delete pelo cliente).

## Alterar os emails autorizados

Só há 2, fixos no código da RPC (`functions.sql`, função `ensure_profile`). Para trocar/adicionar
um email, edita o `CASE` dessa função e volta a correr `functions.sql` no SQL Editor.

## Nota sobre IDs

Como o Bet4Fun, as tabelas usam `GENERATED ALWAYS AS IDENTITY` — o cliente nunca atribui IDs,
só os recebe de volta depois do INSERT.

## Checklist rápida (testar com a anon key, autenticado com um email não autorizado)

- [ ] `ensure_profile()` → erro *"Utilizador não autorizado"*
- [ ] SELECT a qualquer tabela `planoferias.*` sem perfil → 0 linhas (RLS bloqueia)
- [ ] com um dos 2 emails autorizados → lê e escreve tudo normalmente
