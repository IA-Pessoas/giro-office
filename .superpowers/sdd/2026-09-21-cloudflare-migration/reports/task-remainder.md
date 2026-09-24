# Task-service: migração para Worker

Data: 2026-09-22
Branch: `cf/task-worker`, criada de `cf/integracao-consolidada` (`2721dfc4`)

## Commits

| commit | o quê |
|---|---|
| `df3828c5` | pacote `@workspace/task-worker`, lockfile, schema Prisma e teste de paridade |
| `2e800682` | services portados atrás de um contexto por requisição |
| `f2cf049b` | todas as rotas em Hono, auth, wrangler e testes de rota |
| `4d4446c6` | gateway: `/task` vai para `TASK_SERVICE` |
| `b663b2dd` | commercial: binding `TASK_SERVICE` reposto |

Não houve deploy, push, reset, rebase, amend nem `--no-verify`. `app/` não foi tocado.
Os hooks de commit rodaram, e o scan de supply-chain não achou nada em nenhum commit.

## Bloqueio de pnpm: resolvido

O relatório final dizia que criar um pacote novo disparava `ERR_PNPM_EXOTIC_SUBDEP`.
Isso não aconteceu aqui. `pnpm install --lockfile-only` só acrescentou o importer
`workers/task-service` (+40 linhas, sem mudar outras resoluções), e
`pnpm install --frozen-lockfile` passou. `blockExoticSubdeps` continua ligado. Todas
as dependências do Worker já estavam no lockfile.

## Como foi feito

### Services reaproveitados sem alteração

Os 20 arquivos de `services/task-service/src/services/` foram copiados como estão.
As únicas mudanças:

- imports de módulos puros (schemas, constants, utils, provider de IA) passam a
  apontar para `@workspace/task-service/src/...`. É o mesmo padrão de regularize e
  triagem;
- `taskAttachmentStorage.ts` usa o `SupabaseStorageClient` do `@workspace/runtime`
  no lugar do supabase-js.

No Node, os services usam um `prismaClient` e um módulo de auditoria globais ao
processo. No Worker, um `AsyncLocalStorage` (`src/context.ts`) guarda o env da
requisição e um Prisma criado sob demanda, desconectado no fim da requisição.
`src/prisma/index.ts` e `src/integrations/*` leem desse contexto. Sem Hyperdrive nem
`DATABASE_URL`, o Worker responde 503.

Por isso os testes de service do Node, que mockam `../prisma/index.js` e
`../integrations/audit.js`, rodam contra as cópias do Worker sem mudança: 219 testes
herdados.

### Chamadas HTTP que viraram Service Binding

| Node | Worker |
|---|---|
| `POST {AUDIT_SERVICE_URL}/internal/audit/requests` | binding `AUDIT_SERVICE` + `AUDIT_SERVICE_TOKEN` |
| `POST {PROJECT_SERVICE_URL}/project/progress` | binding `PROJECT_SERVICE` + `INTERNAL_SERVICE_TOKEN` |
| sessão por cookie | binding `USER_SERVICE` + `USER_SERVICE_INTERNAL_TOKEN` (`validateWorkerSession`) |
| Supabase Storage (supabase-js) | `createSupabaseStorageClient` (REST) |

O client HTTP de criação de projeto (`integrations/projectWizard.ts`) não tem
chamador em produção: o wizard cria o projeto na própria transação com
`createProjectInTransaction`. Só os tipos foram mantidos.

Auditoria obrigatória (`required: true`) falha a operação, como o
`recordRequired` do Node. O resto é best-effort: registra a falha e segue. A
diferença é que o Worker não repete a tentativa, enquanto o Node tenta até 6 vezes
com backoff.

### Auth

`src/auth.ts` é o do project-service. Aceita a identidade repassada pelo gateway
com `INTERNAL_SERVICE_TOKEN`, com
`token: readCookie(cookie, AUTH_SESSION_COOKIE_NAME) ?? "forwarded-by-gateway"`.
Sessão por cookie exige CSRF em mutação e é revalidada no `USER_SERVICE`. Fora isso,
aceita Bearer com `JWT_SECRET`.

## Rotas migradas: 55 de 55 (51 públicas + 4 internas)

Todas as rotas mantêm path, método, schema Zod (importado do pacote Node), envelope
`createSuccessResponse`, status de sucesso (201 nas criações) e verificação de
permissão na rota.

| router Node | rotas |
|---|---|
| taskModel | `POST/GET/PUT/DELETE /task/model`, `GET /task/model/list` |
| taskDependent | `POST/GET/DELETE /task/model/dependent` |
| taskIntegrationRegularize | `POST/DELETE/GET /task/integration` |
| taskLifecycle | `PUT /task/conclusion`, `POST/PUT/DELETE /task/complete-request`, `GET /task/complete-request/list`, `PUT /task/reopen` |
| taskPostponement | `POST /task/postponement`, `GET /task/postponement/list` |
| taskOperationalNotification | `GET /task/notifications`, `PUT /task/notifications/read` |
| taskAttachment | `POST /task/attachment` (multipart), `GET /task/attachment/list`, `GET /task/attachment/access`, `DELETE /task/attachment` |
| taskFinanceiro | `PUT /task/financeiro`, `GET /task/financeiro/queue`, `PUT/GET /task/financeiro/collectors`, `POST /task/financeiro/settle`, `POST /task/financeiro/express` |
| taskCrud | `POST/GET/PUT/DELETE /task`, `GET /task/list` |
| projectWizard | `POST /task/project-wizard`, `POST /task/project-wizard/preview`, `POST /task/project-wizard/extract-tasks` (JSON ou multipart .txt/.md/.docx/.pdf) |
| projectPlan | `POST/GET/PUT/DELETE /task/project-plan`, `GET /task/project-plan/list`, `POST/PUT/DELETE /task/project-plan/task`, `GET /task/project-plan/task/list`, `POST /task/project-plan/hire` |
| depsTasks | `GET /task/deps/list`, `GET /task/deps/options` |
| internalReporting | `GET /internal/reporting/catalog`, `POST /internal/reporting/extract` |
| internalCommercialTaskBilling | `POST /internal/commercial/task-billing` |
| internalCommercialProspecting | `POST /internal/commercial/prospecting-close` |

Mais `GET /health` e `GET /ready`, como no Node.

Todos os paths `/task*` que `app/src` chama existem no Worker (conferido com
`rg '/task' app/src`). As ocorrências de `/tasks` são rotas de página do Next.

### Divergências deliberadas

- **Mensagens com mojibake corrigidas.** O Node responde, por exemplo,
  `"task_id Ã© obrigatÃ³rio"`. O Worker responde `"task_id é obrigatório"`. Status e
  `code` não mudam.
- **JSON malformado responde 400** "JSON inválido.", como nos outros Workers. No
  Node ele caía no 500 genérico.
- **Corpo acima de 1 MB responde 413.** No Node era 500. A extração de Ata mantém o
  limite maior do Node.
- **Sem autenticação, a mensagem é "Não autenticado."** O Node dizia "Token de
  autenticação não informado." quando faltava o header. O status 401 é o mesmo.
- **Rate limit em memória por isolate** (upload de anexo 10/min; extração
  `AI_EXTRACTION_RATE_LIMIT_*`). O Node contava por processo. Um limite global exige
  o binding de Rate Limiting ou um Durable Object. O código marca isso com
  `ponytail:`.
- **Configuração ausente vira 503 na hora do uso, não falha no boot.** Vale para IA
  sem `OPENAI_API_KEY` (a menos que `AI_EXTRACTION_MODE=fake`), anexos sem Supabase,
  reporting sem token/segredo e rotas do commercial sem `COMMERCIAL_SERVICE_TOKEN`.
  Em produção, o Node recusava subir nesses casos.
- **A identidade repassada é validada com `INTERNAL_SERVICE_TOKEN`**, que é o que o
  gateway Worker envia. O Node usava o `AUDIT_SERVICE_TOKEN` para isso.

## Gateway

`{ prefix: "/task", binding: "TASK_SERVICE" }` em `workers/gateway/src/app.ts`, sem
`module`, espelhando `TASK_SERVICE_PREFIXES = ["/task"]` do `serviceRegistry.ts`.
Como no Node, a permissão global é repassada e a policy vem de `getRoutePolicy`, a
mesma tabela do Node: `/task/financeiro*`, `/task/notifications`, a policy de
responsável e a de edição. O binding está em `wrangler.jsonc` e `env.ts`.
`/internal/*` do task-service continua fora do gateway (404).

## Commercial

O binding `TASK_SERVICE → giro-task-service` voltou e o comentário DÍVIDA saiu.
`wrangler.test.ts` agora trava esse binding na config.

## Testes

| pacote | resultado |
|---|---|
| `@workspace/task-worker` test | **457/457**, 22 arquivos |
| `@workspace/task-worker` typecheck / build / check | PASS |
| `@workspace/gateway-worker` test | **136/136** (8 novos em `taskRoute.test.ts`) |
| `@workspace/gateway-worker` typecheck / check | PASS |
| `@workspace/commercial-worker` test | **27/27** |
| `@workspace/commercial-worker` typecheck / check | PASS |
| `prisma validate` (schema do Worker) | PASS |

Composição do task Worker:

- `app.routes.test.ts`: 226 testes. Cada uma das 48 rotas públicas sem upload tem
  sucesso (envelope + argumentos repassados ao service), 401 sem identidade,
  propagação de 403 do service e, quando valida entrada, 400. Upload, extração,
  wizard, reporting interno e commercial têm casos próprios: multipart, assinatura
  de arquivo, 429 com `Retry-After`, grant HMAC válido e adulterado, token do
  commercial, 503 sem configuração, 500 com log.
- 20 arquivos de testes de service herdados do Node (219 testes).
- `workerIntegrations.test.ts`: contexto e 503 sem banco, payload e token da
  auditoria, best-effort versus obrigatória, progresso pelo `PROJECT_SERVICE`.
- `schemaParity.test.ts`: copiado do user-service e estendido. Falha se o Worker
  omitir coluna `@updatedAt` **ou coluna NOT NULL sem default** do schema canônico,
  ou se mapear tabela inexistente. Foi validado em RED removendo
  `integracao.tasks.date_updated` e `status`.

### Runtime workerd

O Worker foi executado com `wrangler dev --local` e uma conexão de banco
inalcançável. `/health` respondeu 200. Sem identidade, 401. JSON malformado, 400.
Commercial sem token, 403. Ata vazia em multipart, 400. `/task/list` e
`/task/notifications` chegaram ao Prisma e falharam com `connection attempt failed`,
com o erro inesperado registrado pelo `onError`.

Isso prova que o client Prisma `workerd` compila a query e abre conexão **sem**
"Wasm code generation disallowed", e que o contexto por requisição funciona no
workerd. Não houve teste contra um Postgres real.

### Dry-run

| Worker | resultado |
|---|---|
| `giro-task-service` | PASS: 5569.92 KiB, gzip 1554.03 KiB. Bindings `HYPERDRIVE`, `AUDIT_SERVICE`, `USER_SERVICE`, `PROJECT_SERVICE` |
| `giro-gateway` | PASS: gzip 77.94 KiB, com `TASK_SERVICE` |
| `giro-commercial-service` | PASS: gzip 1472.53 KiB, com `TASK_SERVICE` |

## Secrets do `giro-task-service`

Obrigatórios:

- `JWT_SECRET`
- `INTERNAL_SERVICE_TOKEN`
- `USER_SERVICE_INTERNAL_TOKEN`
- `AUDIT_SERVICE_TOKEN`
- `COMMERCIAL_SERVICE_TOKEN`: mesmo valor de `TASK_SERVICE_INTERNAL_TOKEN` no
  commercial Worker
- `REPORTS_INTERNAL_TOKEN`
- `REPORTS_GRANT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Opcionais (vars, com default):

- `TASK_ATTACHMENT_STORAGE_BUCKET` (default `task-attachments-private`; o Node exigia
  essa variável em produção)
- `AI_EXTRACTION_MODE` (`openai`)
- `OPENAI_BASE_URL`
- `OPENAI_MODEL` (`gpt-4o-mini`)
- `AI_EXTRACTION_TIMEOUT_MS` (30000)
- `AI_EXTRACTION_RATE_LIMIT_MAX` (10)
- `AI_EXTRACTION_RATE_LIMIT_WINDOW_MS` (60000)

`DATABASE_URL` não é necessário: o banco vem do Hyperdrive
`da08299aa9604daaa985fc2ba12fce04`, o mesmo dos outros Workers.

No commercial Worker, confirme também o secret `TASK_SERVICE_INTERNAL_TOKEN`: sem ele
o cron continua lançando em `assertScheduledDependencies`.

## Ordem de deploy

Deploy de `giro-task-service` primeiro, depois `giro-commercial-service` e
`giro-gateway`. Os dois últimos fazem binding no task Worker; sem ele no ar, o deploy
falha com code 10143.

## Pendências

- **Não validado contra banco real nem pelo stack deployado.** O Cloudflare Access
  continua barrando o `*.workers.dev`.
- **O reports Worker aponta para o task-service por `TASK_SERVICE_URL`**
  (`workers/reports-service/src/env.ts:23`), não por binding. Com `workers_dev: false`
  essa URL não existe. É a mesma lacuna para o reporting interno de integração, e
  ficou fora deste escopo.
- **O schema do Worker é uma cópia de 24 modelos.** Mudança no canônico exige
  atualizá-la; o teste de paridade só pega coluna obrigatória faltando.
- **As cópias dos services divergem do Node a partir de agora.** Correção em
  `services/task-service/src/services` precisa ser replicada até o Node ser
  desligado.
