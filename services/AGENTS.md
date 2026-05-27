# AGENTS.md

Instrucoes especificas para agents trabalhando no backend.

## Escopo
- Este escopo cobre `services/**`.
- Aplique tambem as regras da raiz em `../AGENTS.md`.
- Para rotas, schemas, app composition, gateway e services TypeScript, carregue as regras escopadas de `.codex/config.toml`.

## Graphify
- Antes de tarefas backend nao triviais, leia `graphify-out/AGENT_BRIEF.md` se existir.
- Rode `pnpm graphify:context:services -- "<task>"` e abra primeiro apenas os arquivos candidatos retornados.
- Use `graphify-out/GRAPH_REPORT.md`, `graphify-out/FILE_MAP.md` ou a wiki apenas quando precisar expandir contexto.
- Para gerar o grafo dos services, rode a partir da raiz:

```bash
pnpm graphify:services
```

- Para atualizar apos mudancas de codigo:

```bash
pnpm graphify:update:services
```

- Para gerar apenas `AGENT_BRIEF.md` e `FILE_MAP.md` a partir do grafo existente:

```bash
pnpm graphify:postprocess:services
```

- Para consultar o grafo a partir da raiz:

```bash
graphify query "<pergunta>" --graph services/graphify-out/graph.json
```

- Quando a tarefa tocar contratos compartilhados, leia manualmente `../shared/`, `../packages/api/`, `../infra/prisma/` e `../scripts/` conforme necessario.
- Leia os arquivos reais antes de editar.
- Nao cole `GRAPH_REPORT.md` inteiro no contexto; prefira o brief e o contexto curto.
- Se Graphify nao estiver disponivel ou o grafo nao existir, use o fallback manual de `../AGENTS.md`.

## Validacao
- Mudancas de contrato HTTP devem alinhar rota, OpenAPI, gateway quando aplicavel, testes do service e smoke.
- Para rotas expostas em OpenAPI, rode `pnpm smoke:coverage` quando o manifesto ou specs forem alterados.
