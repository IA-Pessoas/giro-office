# task-service e reports-service: fechamento

Branch `cf/task-service` sobre `24363061`. Commits:

| commit | o quê |
|---|---|
| `b4f4633f` | Worker do task-service (versão Express, substituída) |
| `b3dcf1ad` | gateway: `/task` → `TASK_SERVICE` |
| `03b59115` | commercial: binding `TASK_SERVICE` reposto |
| `227a5626` | smoke: task-service |
| `d43ce81b` | reports: fila de jobs por cron e origens por Service Binding |
| `c72bc246` | smoke: preview e cron do reports |
| `94486932` | task-service Node: serviços com injeção |
| `19e0dce3` | task-service Node: integração HTTP sem env |
| `27d98563` | task Worker em Hono, no padrão dos outros |
| `25443c34` | smoke: remove o repasse de alias |

Nenhum deploy e nenhum push.

## task-service

Primeira versão (`b4f4633f`): o app Express do Node rodando no workerd, com
os módulos trocados por alias. A pedido do usuário foi substituída para seguir
o padrão dos outros 17 Workers (`94486932`, `19e0dce3`, `27d98563`).

Padrão seguido:

| peça | como |
|---|---|
| app | Hono, com as 55 rotas no `app.ts` e handlers espelhando os do Node |
| validação | schemas zod importados de `services/task-service/src/schemas` |
| regra de negócio | as classes de `services/task-service/src/services`, instanciadas por requisição (variante do reports, regularize, certificate e triagem) |
| banco | schema próprio `workers/task-service/prisma/schema.prisma`, com 31 dos 141 models, e `withWorkerPrisma` por requisição |
| auth | `auth.ts` copiado dos outros Workers |
| audit, project, storage | binding `AUDIT_SERVICE`, binding `PROJECT_SERVICE` e o client de Storage do `runtime` |

Mudança no Node, sem mudança de comportamento: os serviços recebem Prisma,
audit e a integração de progresso pelo construtor, e o processo Node monta
os singletons uma vez em `nodeDeps.ts`. Um teste estrutural impede que um
serviço volte a importar singleton. A classe HTTP de progresso foi para
`projectProgressHttp.ts`, sem `config/env`, porque importar `config/env` no
Worker executa `dotenv` e `fileURLToPath` no load.

Suíte Node: 499/499 com `--maxWorkers=2`. A execução paralela padrão dá
timeout em alguns testes sob carga (load average de 129 na máquina). Isso
também acontece no commit base `24363061`: 1 de 3 rodadas falhou.

### Prova de paridade

`app.parity.test.ts` usa o app Express do Node como oráculo. São 123 casos
cobrindo as 57 combinações de método e path, incluindo multipart, grant
HMAC e Idempotency-Key. Os dois apps recebem os mesmos mocks de serviço, e o
teste exige o mesmo status, o mesmo body e os mesmos argumentos passados a
cada serviço.

`prisma.test.ts` garante que todo model acessado pelos serviços existe no
schema próprio. A falha foi observada ao remover `TaskPostponement` de
propósito.

### Diferenças deliberadas (padrão dos Workers)

- JSON inválido: 400 "JSON inválido." (o Node dá 500, porque o erro do
  body-parser cai no fallback).
- Mensagem do 401: "Não autenticado." (o Node diz "Token de autenticação
  não informado.").
- Token do gateway e do project-service: `INTERNAL_SERVICE_TOKEN`, onde o
  Node usava o `AUDIT_SERVICE_TOKEN`.
- Auditoria best-effort: sem fila de retry em background.
- Sem rate limit em memória no upload e na extração (nenhum Worker tem) e
  sem a rota de OpenAPI.
- Extração por IA: sem `OPENAI_API_KEY`, a rota responde 503. O Node
  recusava subir.
- Algumas mensagens de erro do Node vêm com acentuação corrompida
  (`obrigatÃ³rio`). Foram copiadas iguais para manter a paridade, e a
  correção deve ser feita nos dois lados ao mesmo tempo.

Tamanho: 7,5 MB, 1,93 MB gzip. O `multer` e o busboy entram pelo barrel de
`@workspace/shared/upload`, mas não são usados.

### Observação de histórico

`19e0dce3` levou junto as remoções staged da versão Express. O Worker fica
sem `index.ts` nesse commit até `27d98563`. Não foi reescrito, porque as
regras proíbem amend.

## reports-service

Duas lacunas anteriores, fechadas:

1. **Fila de jobs sem consumidor.** O Node rodava `worker.ts` à parte, com
   polling a cada 5 s. O Worker não tinha nada, então job enfileirado nunca
   era processado. Agora há cron `*/1 * * * *` com o mesmo
   `ReportWorkerService`. Cada tick drena a fila até esvaziar ou até 50 s,
   e a latência passa a ser de até 1 min.
2. **Origens inalcançáveis.** Os adapters chamam `fetch(url)` com URLs que,
   no Worker, caíam no default `127.0.0.1:9`. Com binding, a URL vira
   `https://<svc>-service.binding` e um `fetch` roteador a entrega ao
   binding. São 11 bindings novos. Os 25 adapters Node ficaram intocados.

Continua como estava: o preview síncrono usa as claims do JWT para o
access context (`app.ts`, `accessContextClient`). O job revalida no
user-service pelo banco, como no Node.

## Validação

- task-worker: 136 testes (123 de paridade), typecheck, build, check, dry-run.
- reports-worker: 30 testes, typecheck, build, check, dry-run (1,80 MB gzip).
- gateway: 92 testes. commercial: 18 testes.
- Smoke local contra Postgres real, 9 Workers: **26/27**. A única falha é
  `cleanup.dados_de_teste`, que é anterior a este trabalho. Checks novos:
  CRUD de tarefa pelo gateway, isolamento de tenant, `ENTITY_CHANGE`,
  token do commercial, preview reports → fiscal por binding, e job
  `queued → completed` pelo cron.
- Corrigido no smoke: a assinatura "adulterada" do grant era igual à válida
  sempre que já terminava em `0` (1 em 16 execuções).

## Bloqueios para deploy (credencial, só o usuário)

`giro-task-service`: `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`,
`AUDIT_SERVICE_TOKEN`, `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET`,
`USER_SERVICE_INTERNAL_TOKEN` e `COMMERCIAL_SERVICE_TOKEN` (os dois
últimos com o valor do token interno), mais `OPENAI_API_KEY`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e
`TASK_ATTACHMENT_STORAGE_BUCKET`. Sem a chave da OpenAI, a extração da Ata
responde 503. Sem o Supabase, os anexos respondem 503. O resto do Worker
funciona.

`giro-commercial-service`: faltam `TASK_SERVICE_INTERNAL_TOKEN` e
`INTERNAL_REQUEST_ORIGIN`. Sem eles o cron do outbox continua parado mesmo
com o binding reposto. O relatório final atribuía a parada só ao binding.

Ordem de deploy: task → commercial, reports → gateway. Todos declaram
binding para o task.

## Dívidas

- A branch ainda não foi integrada a `cf/integracao-consolidada`. O
  `/platform` está sendo feito em outra sessão, na worktree `cf-integracao`.
- `reports` sobe com `NODE_ENV=development` nos vars (herdado, não mexido).
- A tabela de jobs de relatório não está na limpeza do smoke.
