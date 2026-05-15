# Regras globais do Workspace

Estas regras devem ser aplicadas em todas as tarefas do Codex neste repositorio.

Fonte original: .cursor/rules/projeto-workspace.mdc

Metadados originais do Cursor:
System.Object[]

# Regras do Projeto Workspace

## Idioma
- Sempre responder em portugues.

## Stack
- Microservices em `services/` (pnpm workspace)
- TypeScript, ESM (imports com extensao `.js`)
- Biome para lint/format
- Express, Prisma, Supabase

## Formatacao (Biome)
- Aspas duplas
- 2 espacos de indentacao
- Trailing commas
- Line width: 100
- Semicolons sempre

## Logging (`@workspace/shared`)
- Imports: `debug`, `info`, `warn`, `error` de `@workspace/shared`.
- Assinatura: `(message: string, context?: Record<string, unknown>)`.
- Quando `error` conflitar com nome de variavel, usar `import { error as logError }`.
- Servicos com `createLogger` devem preferir o logger da instancia (`logger.info`, `logger.error`, etc.).

## Tratamento de erros
- Usar `ServiceError` de `@workspace/shared` para erros HTTP 4xx/5xx.
- Rotas devem preferir `throw new ServiceError(...)` para erros esperados, deixando o handler global serializar a resposta.
- Em `catch`, registrar erro como primeira linha util com `error` ou `logError`, antes de ramificacoes.

## Respostas da API
- Sucesso: `createSuccessResponse` de `@workspace/shared`.
- Erro: deixar o handler de erro serializar; nao montar corpo de erro manualmente sem necessidade documentada.

## Arquitetura e estrutura
- O padrao oficial do projeto esta em `services/`.
- A estrutura legado fora desse padrao nao deve ser usada como referencia para novos contratos ou novas implementacoes.
- Servicos atuais: `user-service`, `audit-service`, `organization-service`, `rh-service`, `task-service`, `project-service`, `contabil-service` e `gateway`.
- Codigo compartilhado fica em `shared`.
- Convencao oficial de nomes de arquivos nos servicos atuais:
  - services: `camelCaseService.ts`
  - routes: `camelCase.routes.ts`
  - teste de service: `camelCaseService.test.ts`
  - teste de rota: `camelCase.routes.test.ts`
- Rotas orquestram services; services nao chamam rotas.
- Metodos publicos de service devem ter tipo de retorno explicito; ver `typescript-services.mdc`.
- Em servicos Express, o padrao oficial de entrypoint e:
  - `src/app.ts` para compor a aplicacao
  - `src/server.ts` para bootstrap e inicializacao
- `index.ts` nao deve ser usado como entrypoint principal quando misturar composicao da app com `listen`, logger e leitura de env.

## Gateway
- A configuracao de upstreams pertence ao proprio gateway.
- URLs de upstream devem ser centralizadas em `services/gateway/src/config/env.ts`.
- O gateway deve usar uma registry unica de servicos para runtime, audit e OpenAPI agregada.
- Nao espalhar configuracao de upstream entre `app.ts`, OpenAPI, middlewares e arquivos compartilhados.

## Padrao de rotas HTTP
- O padrao oficial e prefix-based routing.
- Evitar paths redundantes como `/user/users`, `/task/tasks` e `/project/projects`.
- Preferir paths publicos como `/user`, `/task`, `/project`, `/organizations` e `/rh`.
- Quando houver conflito entre `GET` de detalhe e `GET` de colecao no mesmo prefixo, usar:
  - `GET /prefixo` para detalhe
  - `GET /prefixo/list` para colecao
- O `app.ts` do servico deve ser o ponto de montagem dos routers por prefixo.
- Arquivos em `routes/` devem trabalhar com paths relativos ao mount definido no `app.ts`.
- Nao repetir prefixo de dominio dentro do proprio router quando ele ja e aplicado no `app.ts`.
- Para servicos com contrato publico e interno, separar routers explicitamente no `app.ts` em vez de misturar os contextos no mesmo arquivo.
- Exemplo de referencia atual:
  - `organization-service`: `app.use("/organizations", organizationRoutes)`
  - `audit-service`: `app.use("/audit", createAuditPublicRouter(...))` e `app.use("/internal", createAuditInternalRouter(...))`

## Bootstrap de servicos
- O bootstrap de servicos deve ser separado da composicao da aplicacao.
- `server.ts` deve ser responsavel por:
  - carregar env
  - criar logger
  - instanciar a app
  - subir o servidor
- `app.ts` deve permanecer reutilizavel em testes sem subir socket real.
- Scripts de pacote devem preferir:
  - `dev`: `tsx watch src/server.ts`
  - `start`: `node dist/server.js`
  - `main`: `dist/server.js`

## README de servicos
- Todo servico em `services/` deve ter um `README.md` proprio.
- Ao criar um servico novo ou alterar contrato/porta/variaveis relevantes de um servico existente, atualizar tambem o `README.md`.
- O README deve seguir o padrao atual usado em `services/`, com secoes curtas e objetivas:
  - titulo com o nome do servico
  - breve descricao do servico
  - `## Porta local` com a porta padrao atual do env
  - `## Variaveis de ambiente` apontando para `src/config/env.ts` e destacando as principais
  - `## Gateway` ou `## Upstreams`, quando aplicavel
  - `## Desenvolvimento` com o comando `pnpm --filter @workspace/<nome-do-pacote> dev`
- Quando houver prefixo publico no gateway, documentar o prefixo e exemplos de paths publicos.
- Quando houver URL configurada no gateway, documentar a variavel e o exemplo com a porta atual.
- Nao deixar README com portas, URLs ou nomes de variaveis desatualizados em relacao ao codigo.

## Testes
- Toda alteracao de contrato HTTP deve alinhar:
  - rota do servico
  - OpenAPI do servico
  - gateway, se aplicavel
  - testes do servico e do gateway
- Toda rota nova exposta em `services/<servico>/src/openapi/spec.ts` deve entrar tambem no smoke end-to-end do workspace.
- Ao criar um servico novo com contrato HTTP:
  - registrar o `spec.ts` do servico em `scripts/all-services-smoke.manifest.mjs` (`specFiles`)
  - adicionar cobertura do contrato no manifesto do smoke
- O smoke deve refletir o contrato publico real:
  - rotas publicas via gateway devem usar o path publico do gateway
  - rotas internas ou de infraestrutura devem usar `target: "direct"` quando esse for o contrato real
- A cobertura do smoke por rota deve preservar o padrao atual do workspace:
  - 1 expectativa `good` por `service|method|path`
  - ao menos 1 expectativa `bad` por rota, explicita ou gerada automaticamente pelas regras ja existentes
  - excecoes continuam restritas aos casos ja tratados com `pairCoverageExempt`
- Ao alterar rotas, OpenAPI ou manifesto do smoke, validar com `pnpm smoke:coverage`.
- O padrao oficial de organizacao de testes em servicos e:
  - `src/test/`
  - um arquivo `camelCaseService.test.ts` para o service
  - um arquivo `camelCase.routes.test.ts` para a rota
- A referencia de estrutura e o `project-service`.

---

Fonte original: .cursor/rules/engineering-rules.mdc

Metadados originais do Cursor:
- alwaysApply: true

## Para tarefas não triviais

Considere não trivial qualquer tarefa com 3 ou mais etapas relevantes, decisões de arquitetura, integração, ambiguidade, dependências externas ou alto risco de retrabalho.

Nesses casos:

* Escreva um plano curto antes de implementar.
* Quebre o trabalho em etapas objetivas e verificáveis.
* Liste premissas, riscos e dependências.
* Implemente em passos pequenos.
* Verifique cada etapa importante antes de avançar.
* Se a abordagem falhar, pare e replaneje.

---

## Ao implementar

* Faça a menor mudança útil que avance o objetivo.
* Mantenha o código legível e previsível.
* Evite abstrações prematuras.
* Evite duplicação quando ela gerar manutenção ruim.
* Não invente arquitetura para problemas que ainda não existem.
* Explique mudanças importantes em alto nível.

---

## Ao corrigir bugs

* Reproduza o problema antes de corrigir.
* Colete evidências: logs, traces, testes falhando, inputs e contexto.
* Forme hipóteses com base em evidência, não em feeling.
* Teste primeiro a hipótese mais provável e barata.
* Corrija a causa raiz, não apenas o sintoma.
* Verifique se a correção não gerou regressões.
* Não faça mudanças aleatórias só para “ver se resolve”.

---

## Antes de concluir

* Confirme que o resultado atende ao objetivo original.
* Rode testes relevantes.
* Verifique logs, saídas e integrações afetadas.
* Revise casos de borda relevantes.
* Faça uma checagem rápida de regressão.
* Não declare como pronto sem evidência suficiente.

---

## Comunicação

* Resuma plano, progresso, decisões e riscos com clareza.
* Não narre o óbvio.
* Não use texto longo para esconder falta de substância.
* Diga claramente o que foi feito, o que não foi feito e o que ainda é incerto.

---

## Documentação e rastreabilidade

Se o projeto usar arquivos de tarefa, mantenha-os atualizados.
Exemplos:

* `tasks/todo.md` para plano e progresso
* `tasks/lessons.md` para erros recorrentes e prevenção

Se o projeto não usar esses arquivos, mantenha a mesma disciplina no formato existente.

---

## Anti-padrões proibidos

* Codar antes de entender o problema
* Tratar suposição como fato
* Continuar em plano ruim por teimosia
* Declarar sucesso sem verificação
* Fazer hack sem sinalizar limitação
* Expandir escopo sem alinhamento
* Confundir atividade com progresso
* Criar complexidade sem necessidade real

---

## Regra final

Planeje quando necessário. Verifique antes de concluir. Prefira simplicidade. Corrija a causa raiz. Seja honesto sobre o que sabe, o que supõe e o que realmente comprovou.

