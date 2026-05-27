# CLAUDE.md

Instrucoes do Claude para este repositorio.

## Regras base
- Siga `AGENTS.md` como fonte principal de regras do workspace.
- Responda sempre em portugues neste workspace.
- Antes de alterar arquivos, consulte `.codex/config.toml` e carregue as regras de `.codex/rules/` cujo `paths` combine com a tarefa.
- Preserve as regras originais em `.cursor/rules/` e as regras adaptadas em `.codex/rules/`.

## Graphify
- Use Graphify como ferramenta local de contexto antes de tarefas nao triviais.
- Frontend: leia `app/graphify-out/AGENT_BRIEF.md` quando existir, depois rode `pnpm graphify:context:ui -- "<task>"`.
- Backend: leia `services/graphify-out/AGENT_BRIEF.md` quando existir, depois rode `pnpm graphify:context:services -- "<task>"`.
- Use `GRAPH_REPORT.md` e `FILE_MAP.md` apenas quando o contexto curto nao bastar.
- Para perguntas de arquitetura, prefira `graphify query`, `graphify path` ou `graphify explain` com `--budget 1500` e `--graph <escopo>/graphify-out/graph.json`.
- Depois de mudancas relevantes, rode `pnpm graphify:update:ui` ou `pnpm graphify:update:services` quando o grafo do escopo existir.
- Nao instale hooks automaticos do Graphify e nao versione `graphify-out/` sem pedido explicito.
- Nao cole relatorios inteiros no contexto; abra primeiro os arquivos candidatos retornados por `graphify:context:*`.

## Fallback sem Graphify
- Se `graphify` nao estiver disponivel, se o grafo nao existir ou se a extracao falhar, nao bloqueie a tarefa.
- Informe brevemente que vai usar descoberta manual.
- Use `rg --files`, `rg -n`, leitura direta dos arquivos, regras do repo e validacoes escopadas.
- Antes de editar, identifique arquivos provaveis, fluxo principal, dependencias afetadas e testes.
- Depois de editar, revise impacto com `git diff --stat`, `git diff`, busca de call sites com `rg` e testes relevantes.
