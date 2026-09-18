# AGENTS.md

Instrucoes especificas para agents trabalhando no frontend.

## Escopo
- Este escopo cobre `app/**`.
- Aplique tambem as regras da raiz em `../AGENTS.md`.
- Para UI React/Next, carregue `.codex/rules/frontend-ui-patterns.rules.md` quando a tarefa tocar `app/**/*.tsx` ou `app/**/*.jsx`.

## Graphify
- Antes de tarefas frontend nao triviais, leia `graphify-out/AGENT_BRIEF.md` se existir.
- Rode `pnpm graphify:context:ui -- "<task>"` e abra primeiro apenas os arquivos candidatos retornados.
- Use `graphify-out/GRAPH_REPORT.md`, `graphify-out/FILE_MAP.md` ou a wiki apenas quando precisar expandir contexto.
- Para gerar o grafo do frontend, rode a partir da raiz:

```bash
pnpm graphify:ui
```

- Para atualizar apos mudancas de codigo:

```bash
pnpm graphify:update:ui
```

- Para gerar apenas `AGENT_BRIEF.md` e `FILE_MAP.md` a partir do grafo existente:

```bash
pnpm graphify:postprocess:ui
```

- Para consultar o grafo a partir da raiz:

```bash
graphify query "<pergunta>" --graph app/graphify-out/graph.json
```

- Leia os arquivos reais antes de editar.
- Nao cole `GRAPH_REPORT.md` inteiro no contexto; prefira o brief e o contexto curto.
- Para `pnpm graphify:ui`, use `GEMINI_API_KEY` ou `GOOGLE_API_KEY` no ambiente, `.env.local` ou `app/.env.local` quando a extracao semantica for necessaria.
- `pnpm graphify:update:ui`, `pnpm graphify:postprocess:ui` e `pnpm graphify:context:ui` nao exigem chave.
- Se Graphify nao estiver disponivel ou o grafo nao existir, use o fallback manual de `../AGENTS.md`.

## Validacao
- Prefira validacoes escopadas do app.
- Quando a mudanca for de UI, valide tipos, testes relevantes e comportamento no navegador quando aplicavel.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
