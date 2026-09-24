# Proposta: como disparar a reconciliação da outbox de auditoria da Triagem

Data: 2026-09-22
Branch: `cf/triagem-reconcile`, a partir de `34958e27` (`cloudflare-migration`)
Tipo: proposta. O trigger não foi implementado e não houve deploy. Os únicos artefatos são este documento e os casos `it.todo` em `workers/triagem-service/src/reconcile-trigger.test.ts`.
Referências: plano `docs/superpowers/plans/2026-09-21-cloudflare-migration.md` (lido do workspace principal, porque não está versionado nesta base), `triagem-remainder.md` e o código citado abaixo.

## 1. Situação atual

### O que a rota faz

`POST /internal/triagem/audit/reconcile` (`workers/triagem-service/src/app.ts:307`) chama `TriageAuditService.reconcile` (`services/triagem-service/src/services/triageAuditService.ts`), o mesmo service canônico do Node. A execução tem duas fases:

1. **Backfill.** Um `INSERT ... SELECT ... ON CONFLICT (event_key) DO NOTHING` cria na outbox um evento para cada linha de `triagem.competence_history` que ainda não tem evento. Essa fase é idempotente.
2. **Dispatch.** A fase lê até **100** eventos com `dispatched_at IS NULL`, em ordem de `occurred_at`. Para cada evento, incrementa `attempts` (o "claim") e chama o dispatcher, que usa o binding `AUDIT_SERVICE` com `AbortSignal.timeout(5_000)` e não tenta de novo. Se a chamada der certo, grava `dispatched_at`. Se falhar, só registra no log e o evento continua pendente. A outbox é a retentativa.

Restrições que qualquer trigger precisa respeitar:

- **O escopo é uma organização.** `reconcile(auth)` exige `userId` e `organizationId` não vazios e permissão `triagem >= 2`, ou `permission >= 2` global. Todo acesso passa por `SET LOCAL ROLE giro_user_runtime` com `app.organization_id`. As três tabelas `triagem.*` usam `FORCE ROW LEVEL SECURITY`, com policy só para `giro_user_runtime`. Não existe "reconcilie tudo" numa chamada.
- **A rota exige duas credenciais.** Ela só aceita chamadas que tenham ao mesmo tempo:
  - auth de usuário, encaminhada pelo gateway (`x-internal-service-token` junto com `x-auth-user-id`, `x-auth-organization-id` e permissão) ou por Bearer;
  - `x-internal-service-token` igual a `INTERNAL_SERVICE_TOKEN`.

  Quem dispara precisa, portanto, forjar um contexto de usuário por organização.
- **O claim não trava nada.** Ele só incrementa `attempts`, sem status `processing` e sem lease. Duas execuções simultâneas podem enviar o mesmo evento.
- **O efeito ponta a ponta é idempotente.** O dispatcher envia `requestId = event_key`, e o audit-service grava com `auditRequest.upsert({ where: { request_id }, update: {} })` (`workers/audit-service/src/repository.ts:143`), com `request_id @unique`. Um envio duplicado custa uma chamada a mais e não gera linha duplicada.
- **As mutações só escrevem na outbox.** `TriageCompetenceService` grava o evento de outbox na mesma transação da mutação (linha 336) e nunca despacha. **A reconciliação é o único caminho pelo qual um evento chega ao audit-service.**

### Quem chama a rota hoje (Node)

Ninguém em produção. A busca com `rg` por `audit/reconcile` e `triagem/audit` em todo o repositório (sem `node_modules`) encontrou só:

- a rota e os testes de `services/triagem-service`;
- `services/triagem-service/README.md` e a spec OpenAPI;
- `scripts/generated/triagem-service.smoke.mjs`, que é um smoke, não um agendamento;
- os testes do Worker e o relatório `triagem-remainder.md`.

Nenhum destes lugares chama a rota:

| Onde procurei | O que existe |
|---|---|
| `.github/workflows/*` | só os crons de `supply-chain-integrity` e `github-audit-monitor` |
| `docker-compose*.yml` | só o container do serviço |
| `supabase/functions/*` | três funções do regularize e uma do client |
| SQL com `pg_cron` ou `net.http_post` | nada |
| k8s | não existe no repositório |
| `node-cron` | usado só no `services/src` legado (regularize, certificate, pessoal, agenda, client) |

Consequência: no Node os eventos da Triagem se acumulam na outbox e não são despachados. No primeiro disparo haverá backlog, drenado em lotes de 100 por organização a cada execução.

### Como os outros Workers resolveram casos parecidos

| Worker | Rotina | Disparo | Observação |
|---|---|---|---|
| `commercial-service` | outbox (`CommercialOutboxWorkerService`) | **Cron Trigger** `*/1 * * * *` + handler `scheduled` com `ctx.waitUntil` | É o único Worker com trigger. Valida as dependências e falha explicitamente antes do SQL. Tem lease (`status: processing`, `locked_at`, 120 s) e `wrangler.test.ts` para o cron. |
| `pessoal-service` | `/internal/pessoal/group-assignments/audit-outbox/reconcile`, `/internal/pessoal/union-notifications/run` | HTTP interno com token; o README e `docs/vps-deploy.md` falam em "scheduler externo (Supabase/Vercel)" | Escopo global, sem organização. O claim muda o status para `processing`. |
| `regularize-service` | quatro rotas `/internal/reconciliation/*/run` | HTTP interno, chamado hoje pelas três Supabase Edge Functions | O plano manda migrar essas funções para `scheduled`/Queue. |
| `certificate-service` | `/internal/notifications/run` | HTTP interno com token | O plano cita "reconciliação agendada". |

O plano diz o seguinte:

- Linha 43: jobs de `setInterval`/`node-cron` viram Workers com `scheduled`, Queues e/ou Durable Objects conforme a necessidade de lease/ordenação.
- Linha 72: "uma execução de outbox/reconciliation/report com idempotência, retry e lease".
- Linha 115: o triagem fica com "outbox/dispatch por Queue".
- Linha 202: as Edge Functions viram handlers `scheduled`/Queue.
- Linha 225: confirmar cron/Queues/outbox sem duplicação e com retry.

O único precedente implementado é o **Cron Trigger do commercial**.

## 2. Opções

### A. Cron Trigger no próprio Worker (`scheduled`)

O handler `scheduled` lista as organizações com trabalho pendente e chama o mesmo `TriageAuditService.reconcile` para cada uma, com contexto de sistema, sem passar pela rota HTTP.

### B. Cloudflare Queue

Existem duas variantes:

- **B1.** Um cron publica uma mensagem por organização pendente, e um consumer da Queue reconcilia cada uma. Isso é a opção A com uma fila no meio.
- **B2.** A mutação publica na Queue depois do commit. Isso exige mudar `TriageCompetenceService` ou o Worker. Cria o problema de dual-write: se o `send` falhar, a mensagem se perde, e continua sendo preciso um cron de varredura da outbox para cobrir essa perda.

### C. Serviço externo chamando a rota HTTP

Um agendador de fora chama a rota: Supabase Edge Function + `pg_cron`, GitHub Actions `schedule` ou similar. É o padrão das Edge Functions do regularize.

### Comparação

| Critério | A. Cron Trigger | B. Queue | C. Externo (HTTP) |
|---|---|---|---|
| **Idempotência** | Herdada: backfill com `ON CONFLICT`, `dispatched_at` e upsert por `request_id` no audit. | Igual à A. Em B2 a fila entrega pelo menos uma vez, e reentregas são absorvidas pelo upsert. | Igual à A. |
| **Concorrência entre execuções** | Com execuções em `*/5` e teto de tempo abaixo de 5 min, a sobreposição é rara. Quando acontece, gera no máximo um envio duplicado, sem efeito. Não há lock no v1. | A concorrência do consumer (`max_concurrency`) e uma mensagem por organização dão paralelismo controlado. Organizações diferentes não disputam. Mensagens duplicadas da mesma organização podem enviar em dobro, sem efeito. | Depende do agendador. GitHub Actions pode atrasar ou encavalar execuções. Pode haver duplicata, sem efeito. |
| **CPU/tempo** | Cron: até 15 min de duração, 30 s de CPU por padrão (até 5 min com `limits.cpu_ms`). O tempo de I/O não conta como CPU. O pior caso é 100 eventos × 5 s = 500 s por organização, por isso é preciso um orçamento de tempo. | Consumer: 15 min por lote. Isola o custo por organização. | O HTTP não tem limite de duração enquanto o cliente fica conectado, mas o Edge Function ou o runner tem timeout próprio (a Edge Function tem timeout curto), e a organização lenta derruba a chamada. |
| **Tamanho do lote** | 100 eventos por organização por execução, fixado no service. Um teto de organizações por execução fica no Worker. | Igual, mais `max_batch_size` do consumer. | 100 por chamada, uma chamada por organização. |
| **Observabilidade** | `observability.enabled` já está ligado. Tem o histórico de "Cron Events" no dashboard, `wrangler tail` e um log estruturado de resumo por execução. | Métricas da fila (backlog, retries, DLQ) somadas aos logs do consumer. É a melhor visibilidade de backlog. | Fica dividida entre dois sistemas: os logs do agendador e os do Worker. |
| **Custo** | Praticamente zero: 288 invocações por dia em `*/5`, com CPU baixa (I/O). | Cobrança por operação de fila, somada às invocações do cron e do consumer. Baixo, mas não é zero. | Invocações do Edge Function ou minutos de Actions, fora da Cloudflare. |
| **Falhas e retentativa** | A outbox já retenta: evento com falha fica pendente e `attempts++`. A falha de uma organização é isolada com `try/catch` por organização. | Tem retry e DLQ nativos, mas isso duplica o que a outbox já faz. O retry da fila refaria a reconciliação inteira da organização. | O agendador precisa tratar erros HTTP. O 502/503 do Worker só aparece no log do agendador. |
| **Token interno** | **Não precisa.** O `scheduled` não é exposto via HTTP e usa o binding e o `AUDIT_SERVICE_TOKEN` que já existem. | Não precisa, porque a fila é binding interno. | **Precisa:** `INTERNAL_SERVICE_TOKEN` fora da Cloudflare, mais auth encaminhada forjada por organização (`x-auth-user-id`, `x-auth-organization-id`, permissão) e a lista de organizações no agendador. Aumenta a superfície de segredo. |
| **Esforço** | Pequeno: `triggers.crons` no wrangler, handler `scheduled` (cerca de 60 linhas), query de organizações pendentes e testes. Segue o padrão do commercial. | Médio: provisionar a fila e o binding, criar producer e consumer, DLQ e testes. B2 ainda mexe no service canônico. | Médio: agendador, segredos, rota pública e enumeração de organizações fora do banco. |
| **Rollback** | Tirar `triggers` do wrangler e redeployar, ou `wrangler triggers deploy` com crons vazio. A rota manual continua funcionando. | Remover o binding e o consumer. A fila pode ficar com mensagens órfãs. | Desligar o agendador. |

## 3. Recomendação

**Opção A: Cron Trigger `*/5 * * * *` no `giro-triagem-service`, chamando o service diretamente e sem HTTP.**

Justificativa:

1. **A outbox já é a fila.** Ela é durável, retenta e é idempotente ponta a ponta graças ao upsert por `request_id`. Uma Queue (B) duplicaria retry e armazenamento sem ganho de correção. Faz sentido promover a B1 mais tarde, só se o número de organizações pendentes por execução passar do orçamento de tempo.
2. **Fica consistente com o único precedente implementado.** O commercial usa cron com `scheduled`, `waitUntil`, validação explícita de dependências e `wrangler.test.ts`. O plano aceita `scheduled` para jobs e reconciliações.
3. **Não tira segredos da Cloudflare e não exige forjar auth de usuário por organização**, dois problemas que a opção C tem por causa do desenho da rota. A rota HTTP continua para disparo manual e para o smoke.
4. **Não precisa de lock no v1.** A sobreposição é rara com o orçamento de tempo, e o efeito dela é só uma chamada duplicada. Um lease por organização (`pg_try_advisory_xact_lock` não serve, porque a reconciliação usa várias transações; seria preciso uma tabela de lease ou `status`) só se justifica se aparecer duplicação medida.

Pontos de desenho do handler:

- **Enumerar organizações** antes do `SET ROLE`, com o papel de conexão. O `postgres` do Supabase tem `BYPASSRLS` (`docs/migration/v4.1/COMPATIBILIDADE-ACESSO-2026-09-13.md`). É preciso confirmar se é esse o usuário do Hyperdrive. Entram as organizações com evento pendente e as que têm histórico sem evento, limitadas por `MAX_ORGS_PER_RUN`.
- **Contexto de sistema** `{ userId: "system:triagem-reconcile", organizationId, permission: 2 }`. O `userId` só é usado em `requireContext` e não é gravado: o `actor_user_id` do evento vem do histórico. Isso evita mudar `services/**`. A alternativa mais limpa, que exige mudança no service canônico, é um método `reconcileForOrganization(organizationId)` sem checagem de permissão de usuário.
- **Orçamento de tempo.** O dispatcher do Worker ganha um wrapper: depois de `deadline` (4 min), ele lança sem chamar o audit-service. O evento fica pendente, com `attempts` incrementado, e vai para o próximo tick. O mesmo prazo interrompe o laço de organizações.
- **Falha isolada por organização.** Cada organização roda num `try/catch`, e o handler grava um único log de resumo.

## 4. Esboços (não aplicados)

### `workers/triagem-service/wrangler.jsonc`

```jsonc
{
  "$schema": "https://developers.cloudflare.com/workers/wrangler/config-schema.json",
  "name": "giro-triagem-service",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-22",
  "compatibility_flags": ["nodejs_compat"],
  "services": [{ "binding": "AUDIT_SERVICE", "service": "giro-audit-service" }],
  // Reconciliação da outbox de auditoria: backfill + dispatch, 100 eventos/org por execução.
  "triggers": { "crons": ["*/5 * * * *"] },
  "observability": { "enabled": true }
}
```

### `workers/triagem-service/src/index.ts` (handler)

```ts
import { withWorkerPrisma } from "@workspace/runtime";
import { TriageAuditService } from "@workspace/triagem-service/src/services/triageAuditService.js";
import { createTriagemWorkerApp } from "./app.js";
import { createTriageAuditDispatcher } from "./audit.js";
import type { TriagemWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

type ScheduledContext = { waitUntil(promise: Promise<unknown>): void };

const RUN_BUDGET_MS = 4 * 60_000; // abaixo do intervalo de 5 min do cron
const MAX_ORGS_PER_RUN = 50;
const SYSTEM_USER_ID = "system:triagem-reconcile";

function assertScheduledDependencies(env: TriagemWorkerEnv): void {
  if (!env.HYPERDRIVE?.connectionString && !env.DATABASE_URL) {
    throw new Error("Triagem reconcile scheduler requer HYPERDRIVE ou DATABASE_URL.");
  }
  if (!env.AUDIT_SERVICE || !env.AUDIT_SERVICE_TOKEN) {
    throw new Error("Triagem reconcile scheduler requer binding/token do audit-service.");
  }
}

export async function runTriagemReconcile(env: TriagemWorkerEnv, now = Date.now) {
  const deadline = now() + RUN_BUDGET_MS;
  const dispatch = createTriageAuditDispatcher(env);
  // Passou do prazo: não chama o audit; o evento fica pendente (attempts++) para o próximo tick.
  const budgeted: typeof dispatch = async (event) => {
    if (now() > deadline) throw new Error("Orçamento da execução esgotado.");
    return dispatch(event);
  };

  return withWorkerPrisma(env, PrismaClient, async (prisma) => {
    // Papel de conexão (BYPASSRLS), sem SET ROLE: só lista ids, não lê conteúdo.
    const orgs = (await prisma.$queryRaw`
      SELECT organization_id FROM "triagem.outbox_events" WHERE dispatched_at IS NULL
      UNION
      SELECT h.organization_id FROM "triagem.competence_history" h
      LEFT JOIN "triagem.outbox_events" e ON e.event_key = h.idempotency_key
      WHERE e.id IS NULL
      LIMIT ${MAX_ORGS_PER_RUN}
    `) as Array<{ organization_id: string }>;

    const service = new TriageAuditService(prisma as never, budgeted);
    const summary = { organizations: 0, reconciled: 0, dispatched: 0, pending: 0, failed: 0 };
    for (const { organization_id: organizationId } of orgs) {
      if (now() > deadline) break;
      try {
        const result = await service.reconcile({
          userId: SYSTEM_USER_ID,
          organizationId,
          permission: 2,
        });
        summary.organizations += 1;
        summary.reconciled += result.reconciled;
        summary.dispatched += result.dispatched;
        summary.pending += result.pending;
      } catch (error) {
        summary.failed += 1;
        console.error(JSON.stringify({ msg: "triagem.reconcile.org_failed", organizationId, error: String(error) }));
      }
    }
    console.log(JSON.stringify({ msg: "triagem.reconcile.run", ...summary }));
    return summary;
  });
}

export default {
  fetch(request: Request, env: TriagemWorkerEnv) {
    return createTriagemWorkerApp({ env }).fetch(request, env);
  },
  scheduled(_event: unknown, env: TriagemWorkerEnv, context: ScheduledContext) {
    assertScheduledDependencies(env);
    context.waitUntil(runTriagemReconcile(env));
  },
};
```

Custo da consulta de enumeração: o `UNION` com `LEFT JOIN` varre `competence_history` inteiro a cada tick, e o backfill do service faz o mesmo por organização. Com volume alto seria preciso um índice por `idempotency_key` no histórico (a verificar) ou limitar o backfill a uma janela recente. Nada disso é necessário no v1.

## 5. Plano de testes (RED)

Os casos já estão como `it.todo` em `workers/triagem-service/src/reconcile-trigger.test.ts`. A suíte continua verde: 13 testes passando e 15 todo. Na implementação, cada `todo` vira um teste que falha primeiro. Os testes usam um Prisma falso no estilo de `remainder.routes.test.ts`, um `AUDIT_SERVICE` falso e um relógio injetado.

**Wrangler**
- `triggers.crons` tem exatamente `["*/5 * * * *"]`.
- O binding `AUDIT_SERVICE` continua declarado.

**`scheduled`**
- Sem `HYPERDRIVE`/`DATABASE_URL`, lança antes do SQL (como `commercial/index.test.ts`).
- Sem `AUDIT_SERVICE`/`AUDIT_SERVICE_TOKEN`, lança antes do SQL.
- Registra o trabalho em `waitUntil` e não lança fora da promise.
- Reconcilia só as organizações retornadas pela enumeração, cada uma com `SET LOCAL ROLE` e `set_config('app.organization_id', org)` próprios.
- Usa o contexto de sistema e não depende de `INTERNAL_SERVICE_TOKEN` nem de headers de auth.
- A falha de uma organização não para as outras e gera um log com `organizationId`.
- Respeita `MAX_ORGS_PER_RUN`.
- Grava um log de resumo `{ organizations, reconciled, dispatched, pending, failed }`.

**Concorrência e idempotência**
- Duas execuções sobrepostas no máximo reenviam o mesmo `event_key`, e o upsert no audit absorve o reenvio.
- Um evento já com `dispatched_at` não é reenviado.
- Uma falha 5xx do audit mantém o evento pendente, com `attempts` incrementado.
- Depois do prazo, o dispatcher não chama o binding e os eventos restantes ficam pendentes.

**Regressão**
- A rota `POST /internal/triagem/audit/reconcile` mantém o 401/403 do token interno e o escopo da organização.

Validações previstas na implementação:

- `pnpm --filter @workspace/triagem-worker test`, `typecheck`, `build` e `check`;
- `wrangler deploy --dry-run`, que deve listar o cron;
- `wrangler dev --test-scheduled` com `curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"` num banco local.

## 6. Perguntas para decidir

1. **Frequência:** `*/5` é aceitável para a latência de auditoria da Triagem, ou é preciso `*/1` como no commercial? Com `*/1`, o orçamento cai para cerca de 50 s e a sobreposição fica mais provável.
2. **Papel de conexão:** o usuário do Hyperdrive/`DATABASE_URL` do Worker é o `postgres` com `BYPASSRLS`? Se não for, a enumeração de organizações precisa de outra fonte, por exemplo `organizations`, ou de uma função `SECURITY DEFINER`.
3. **Contexto de sistema:** um `userId` sintético com `permission: 2` é aceitável no v1, ou vocês preferem mexer em `services/triagem-service` e criar `reconcileForOrganization` sem checagem de usuário?
4. **Backlog atual:** há volume relevante acumulado na outbox do ambiente de destino? Drenar em lotes de 100 por organização a cada 5 min é suficiente, ou é preciso uma execução manual inicial pela rota?
5. **Queue no futuro:** o plano (linha 115) diz "dispatch por Queue". Vocês aceitam registrar o cron como a implementação dessa linha, deixando a Queue (B1) como evolução condicionada a volume?
6. **Plano Workers:** a conta está no Workers Paid? O limite de CPU e subrequests do cron muda muito no plano gratuito.
