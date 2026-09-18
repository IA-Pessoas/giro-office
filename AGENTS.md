# AGENTS.md

Instrucoes do Codex para este repositorio.

## Fonte das regras
- As regras originais do Cursor ficam em `.cursor/rules/` e devem ser preservadas.
- As regras adaptadas para o Codex ficam em `.codex/rules/`.
- A configuracao de escopo fica em `.codex/config.toml`.

## Como aplicar
- Sempre aplique `.codex/rules/default.rules.md`.
- Antes de alterar arquivos, consulte `.codex/config.toml` e carregue os arquivos de `.codex/rules/` cujo `paths` combine com a tarefa.
- Quando houver conflito entre regra global e regra especifica, prefira a regra especifica.
- Responda sempre em portugues neste workspace.

## Seguranca (sempre)
- Leia e aplique `.codex/rules/agent-safety.rules.md` em qualquer tarefa deste repositorio.
- Nunca reescreva historico publicado: nada de `push --force`/`--force-with-lease`,
  `rebase`, `reset --hard` ou `amend` sobre commits ja empurrados, e nunca em `main`,
  `develop` ou `staging`. Divergiu? `git fetch` e reaplique por cima.
- Nunca empurre com `--no-verify` nem contorne os hooks.
- Nunca gere codigo ofuscado, minificado ou codificado em arquivo versionado, e nunca
  anexe nada depois do fim logico de uma config executavel.
- Achou codigo suspeito: pare antes de buildar ou instalar, preserve a evidencia, avise
  o usuario e so entao restaure a versao limpa.

## Graphify
- Use Graphify como ferramenta local de contexto antes de tarefas nao triviais.
- O grafo e apoio de navegacao; a fonte da verdade continua sendo o codigo real, as regras do repo e os testes.
- Nao instale hooks automaticos do Graphify neste workspace sem pedido explicito.
- Nao versione diretorios `graphify-out/`; eles sao artefatos locais.

### Escopos
- Frontend: use o grafo local em `app/graphify-out/`.
- Backend: use o grafo local em `services/graphify-out/`.
- Global: para tarefas em scripts, CI, hooks, workspace, gateway ou contratos compartilhados, leia tambem `shared/`, `packages/api/`, `infra/prisma/`, `scripts/` e as regras `.codex/rules/` aplicaveis. So rode Graphify no repo inteiro quando o escopo global justificar o custo.

### Protocolo antes de editar
1. Classifique a tarefa como frontend, backend ou global.
2. Se existir, leia primeiro `app/graphify-out/AGENT_BRIEF.md` ou `services/graphify-out/AGENT_BRIEF.md`.
3. Rode `pnpm graphify:context:ui -- "<task>"` ou `pnpm graphify:context:services -- "<task>"` para gerar um pacote curto de planejamento.
4. Abra primeiro apenas os arquivos candidatos retornados pelo contexto.
5. Use `GRAPH_REPORT.md`, `FILE_MAP.md`, `graphify query`, `graphify path` ou `graphify explain` so quando precisar expandir a navegacao.
6. Leia os arquivos reais apontados pelo grafo antes de alterar codigo.
7. Para mudancas relevantes, rode `pnpm graphify:update:ui` ou `pnpm graphify:update:services` depois de editar, quando o grafo do escopo existir.
8. Valide com testes, lint, typecheck ou smoke escopados conforme a area alterada.

### Token budget
- Nao cole `GRAPH_REPORT.md` inteiro no contexto.
- Prefira `AGENT_BRIEF.md` e `graphify:context:*` para iniciar o planejamento.
- Abra no maximo os arquivos candidatos iniciais; expanda com `rg` somente quando o codigo real exigir.
- Use consultas abertas com limite de tokens, por exemplo `graphify query "<pergunta>" --budget 1500 --graph <escopo>/graphify-out/graph.json`.

### Comandos locais
- Gerar grafo do frontend: `pnpm graphify:ui`.
- Gerar grafo dos services: `pnpm graphify:services`.
- Atualizar grafo do frontend apos mudancas de codigo: `pnpm graphify:update:ui`.
- Atualizar grafo dos services apos mudancas de codigo: `pnpm graphify:update:services`.
- Gerar brief/file map do frontend: `pnpm graphify:postprocess:ui`.
- Gerar brief/file map dos services: `pnpm graphify:postprocess:services`.
- Atualizar escopos afetados por diff ou grafo stale: `pnpm graphify:refresh`.
- Contexto curto do frontend: `pnpm graphify:context:ui -- "<task>"`.
- Contexto curto dos services: `pnpm graphify:context:services -- "<task>"`.
- Consultar frontend: `graphify query "<pergunta>" --graph app/graphify-out/graph.json`.
- Consultar services: `graphify query "<pergunta>" --graph services/graphify-out/graph.json`.

### Chave Gemini
- `pnpm graphify:ui` e `pnpm graphify:services` podem precisar de `GEMINI_API_KEY` ou `GOOGLE_API_KEY` para extracao semantica.
- O wrapper carrega essas chaves do ambiente, de `.env.local`, de `.env`, ou dos arquivos equivalentes dentro de `app/` e `services/`.
- Nunca versione chaves; `.env*` ja deve ficar local.
- `pnpm graphify:update:ui`, `pnpm graphify:update:services`, `graphify:postprocess:*` e `graphify:context:*` continuam utilizaveis sem chave, pois dependem do grafo/AST local.

### Fallback sem Graphify
- Se `graphify` nao estiver disponivel, se o grafo ainda nao existir ou se a extracao falhar, nao bloqueie a tarefa apenas por isso.
- Informe brevemente: `Graphify indisponivel ou sem grafo local; vou usar descoberta manual.`
- Use `rg --files` e `rg -n` para localizar entrypoints, rotas, services, schemas, specs OpenAPI, testes e scripts de validacao.
- Antes de editar, monte um mini mapa com arquivos provaveis, fluxo principal, dependencias afetadas e testes.
- Depois de editar, substitua a revisao pelo grafo por `git diff --stat`, `git diff`, busca de call sites com `rg` e validacoes escopadas.
- Se a descoberta manual apontar multiplos fluxos plausiveis, pare e peca clarificacao.
