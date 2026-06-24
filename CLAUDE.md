# PlanoFerias — guia para o assistente

App pessoal de plano de férias.
**Sem build, sem npm.** Site estático (GitHub Pages), PWA. `localStorage` + sincronização opcional via **GitHub** (não tem Supabase).

## Estrutura
- `index.html` — **ficheiro único** (~1387 linhas): markup + CSS + JS tudo dentro. (Ainda NÃO dividido como o SplitBill/FestasBV.)
- `sw.js` — service worker (cache PWA).
- Não mexer: `apple-touch-icon.png`, `manifest.json`.

## Como NÃO gastar tokens à toa
- Lê só o troço relevante do `index.html`, não o ficheiro todo. Para localizar um botão/campo, procura o `id` no markup e salta para o handler no `<script>`.
- Faz **edições cirúrgicas** (diffs pequenos). **Nunca reescrevas o ficheiro inteiro.**
- Se crescer, vale a pena dividir em `index.html` + `app.js` + `style.css` (como já fiz no SplitBill e FestasBV).

## Regras técnicas (não partir a app)
- O JS está inline e há handlers `onclick="…"` → as funções têm de ser **globais** (não converter para module).
- **PWA/cache:** se alterares o HTML/CSS/JS, **sobe a versão do CACHE no `sw.js`**.
- **Sync GitHub:** o token é **introduzido pelo utilizador em runtime** (guardado em `localStorage`) — **não está no código, nunca o coloques hardcoded**. Os dados vão para `diogoandrefsilva-ghc/AppDataJSON` → `planoferias-data.json`. ⚠️ Esse repo é **público**.

## Deploy
GitHub Pages a partir de `main`. Um push para `main` publica.
