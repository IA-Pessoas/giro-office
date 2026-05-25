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
- Se Graphify nao estiver disponivel ou o grafo nao existir, use o fallback manual de `../AGENTS.md`.

## Validacao
- Prefira validacoes escopadas do app.
- Quando a mudanca for de UI, valide tipos, testes relevantes e comportamento no navegador quando aplicavel.
