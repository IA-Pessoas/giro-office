# Dashboard Activity Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupar consultas automáticas idênticas em sequências de atividade para que o tempo relativo do dashboard avance sem apagar registros de auditoria.

**Architecture:** O gateway aplicará islands-and-gaps no SQL das atividades recentes. Registros com a mesma assinatura e lacunas de até 5 minutos formarão uma sequência; `createdAt` usará o primeiro registro e a ordenação usará a última ocorrência.

**Tech Stack:** TypeScript, PostgreSQL, node-postgres, Vitest, React 18, Docker Compose.

## Global Constraints

- O agrupamento deve ocorrer somente na leitura do dashboard.
- O banco e o fluxo de gravação da auditoria não podem ser alterados.
- A assinatura deve considerar usuário, método, rota, ação e item.
- Uma lacuna exatamente igual a 5 minutos pertence à sequência atual.
- Somente uma lacuna superior a 5 minutos inicia uma nova sequência.
- A resposta deve continuar usando `createdAt: string | null`.
- A lista deve retornar no máximo cinco sequências, ordenadas pela ocorrência mais recente.
- O frontend deve continuar atualizando o texto relativo a cada 30 segundos.

---

### Task 1: Agrupar sequências repetidas no gateway

**Files:**
- Modify: `services/gateway/src/services/dashboardStatsService.test.ts`
- Modify: `services/gateway/src/services/dashboardStatsService.ts`

**Interfaces:**
- Consumes: registros elegíveis de `public.audit_requests` filtrados por organização.
- Produces: linhas `ActivityRow` agrupadas, com `created_at` estável e ordenação por `last_seen_at`.
- Preserves: `DashboardStats.activities[number].createdAt: string | null`.

- [x] **Step 1: Escrever o teste regressivo que falha**

No teste que inspeciona `ACTIVITIES_SQL`, manter as verificações de visibilidade e acrescentar:

```ts
expect(activitiesSql).toContain("lag(created_at) over");
expect(activitiesSql).toContain("interval '5 minutes'");
expect(activitiesSql).toContain("previous_created_at is null");
expect(activitiesSql).toContain("created_at - previous_created_at > interval '5 minutes'");
expect(activitiesSql).toContain("sum(starts_new_sequence) over");
expect(activitiesSql).toContain("min(created_at) as created_at");
expect(activitiesSql).toContain("max(created_at) as last_seen_at");
expect(activitiesSql).toContain("order by last_seen_at desc");
expect(activitiesSql).toContain("limit 5");
```

Renomear o caso para:

```ts
it("groups continuous duplicate activities while preserving visibility rules", async () => {
```

- [x] **Step 2: Confirmar o estado vermelho**

Executar:

```bash
corepack pnpm --filter @workspace/gateway exec vitest run src/services/dashboardStatsService.test.ts
```

Esperado: o caso falha porque a consulta atual não usa janelas, sequências nem timestamps
agregados.

- [x] **Step 3: Implementar islands-and-gaps no SQL**

Substituir `ACTIVITIES_SQL` por uma consulta com estas etapas:

```sql
with eligible_activities as (
  select
    a.user_id,
    coalesce(nullif(u.full_name, ''), nullif(u.name, ''), nullif(u.login, '')) as user_name,
    a.action,
    a.method,
    coalesce(nullif(a.referring, ''), nullif(a.referring_id, '')) as item,
    a.path,
    a.created_at,
    a.outcome,
    (a.metadata_json ->> 'activityVisible')::boolean as activity_visible
  from public.audit_requests a
  left join public.users u on u.id = a.user_id
  where a.organization_id = $1
    and (
      not coalesce(a.metadata_json ? 'activityVisible', false)
      or (
        a.metadata_json @> '{"activityVisible": true}'::jsonb
        and a.outcome = 'success'
      )
    )
),
activities_with_previous as (
  select
    *,
    lag(created_at) over (
      partition by user_id, user_name, method, path, action, item
      order by created_at
    ) as previous_created_at
  from eligible_activities
),
activity_gaps as (
  select
    *,
    case
      when previous_created_at is null then 1
      when created_at - previous_created_at > interval '5 minutes' then 1
      else 0
    end as starts_new_sequence
  from activities_with_previous
),
sequenced_activities as (
  select
    *,
    sum(starts_new_sequence) over (
      partition by user_id, user_name, method, path, action, item
      order by created_at
      rows between unbounded preceding and current row
    ) as sequence_id
  from activity_gaps
),
grouped_activities as (
  select
    user_id,
    user_name,
    action,
    method,
    item,
    path,
    sequence_id,
    min(created_at) as created_at,
    max(created_at) as last_seen_at,
    case when bool_or(activity_visible is true) then 'success' else max(outcome) end as outcome,
    case when bool_or(activity_visible is true) then true else null end as activity_visible
  from sequenced_activities
  group by user_id, user_name, action, method, item, path, sequence_id
)
select
  user_name,
  action,
  method,
  item,
  path,
  created_at,
  outcome,
  activity_visible
from grouped_activities
order by last_seen_at desc
limit 5
```

Não alterar `isEligibleActivity`, `normalizeAction` nem o mapeamento para `createdAt`. Eles
continuam como defesa do contrato e serialização.

- [x] **Step 4: Confirmar o estado verde escopado**

Executar:

```bash
corepack pnpm --filter @workspace/gateway exec vitest run src/services/dashboardStatsService.test.ts
corepack pnpm --filter @workspace/gateway exec tsc --noEmit
```

Esperado: todos os casos do arquivo e o typecheck terminam com código zero.

- [x] **Step 5: Medir a consulta no ambiente develop**

Executar `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` para `ACTIVITIES_SQL`, substituindo `$1` apenas
na execução diagnóstica por um parâmetro da organização autenticada. A consulta deve:

- usar somente leitura;
- retornar no máximo cinco grupos;
- não realizar escrita nem criar índice;
- concluir sem erro e sem bloquear o dashboard;
- ficar abaixo de 500 ms no conjunto atual do ambiente `develop`.

Se ultrapassar 500 ms, parar e revisar o desenho antes de publicar.

- [x] **Step 6: Commit**

```bash
git add services/gateway/src/services/dashboardStatsService.ts services/gateway/src/services/dashboardStatsService.test.ts
git commit -m "fix(gateway): group repeated dashboard activities"
```

### Task 2: Verificar o contrato completo

**Files:**
- Verify: `services/gateway/src/services/dashboardStatsService.ts`
- Verify: `services/gateway/src/services/dashboardStatsService.test.ts`
- Verify: `app/src/modules/dashboard/run-dashboard-tests.mjs`

**Interfaces:**
- Consumes: `DashboardStats.activities[number].createdAt`.
- Produces: evidência de compatibilidade entre gateway e frontend.

- [x] **Step 1: Executar a validação completa**

```bash
corepack pnpm --filter @workspace/gateway exec vitest run
corepack pnpm --filter @workspace/gateway exec tsc --noEmit
docker run --rm \
  -v /data/workspace-develop/.worktrees/develop:/workspace:ro \
  -w /workspace \
  node:22-bookworm-slim \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
  --experimental-strip-types \
  app/src/modules/dashboard/run-dashboard-tests.mjs
corepack pnpm --filter @workspace/app exec tsc --noEmit
corepack pnpm --filter @workspace/app exec tsc -p tsconfig.usefetch-types.json --noEmit
git diff --check
```

Esperado: 123 ou mais testes do gateway, nove ou mais testes do dashboard e todos os typechecks
terminam sem falha.

- [x] **Step 2: Atualizar Graphify ou aplicar fallback**

```bash
corepack pnpm graphify:update:services
```

Se o Graphify continuar indisponível, revisar:

```bash
git diff --stat
git diff
rg -n "ACTIVITIES_SQL|createdAt|activity\\.time" services/gateway/src app/src/modules/dashboard app/src/shared/components/newLayout/Dashboard.tsx
```

Esperado: nenhum consumidor volta a depender de `activity.time`.

### Task 3: Publicar no ambiente develop

**Files:**
- Build only: `docker-compose.vps.yml`
- Build only: `docker-compose.vps.runtime-override.yml`
- Build only: `docker-compose.vps.slot-develop.yml`

**Interfaces:**
- Consumes: imagem `workspace-gateway:vps-develop`.
- Produces: gateway atualizado no slot `workspace-develop`.

- [x] **Step 1: Reconstruir somente o gateway**

Usar os mesmos valores do slot atual:

```bash
WORKSPACE_VPS_IMAGE_TAG=vps-develop \
NEXT_PUBLIC_API_URL=http://147.93.66.91:8086 \
NEXT_PUBLIC_AUTH_COOKIE_SECURE=false \
API_INTERNAL_URL=http://gateway:3010 \
docker compose \
  -f docker-compose.vps.yml \
  -f docker-compose.vps.runtime-override.yml \
  -f docker-compose.vps.slot-develop.yml \
  -f /tmp/workspace-develop-skip-incomplete-services.yml \
  -p workspace-develop \
  build gateway
```

- [x] **Step 2: Recriar somente o gateway**

```bash
WORKSPACE_VPS_IMAGE_TAG=vps-develop \
NEXT_PUBLIC_API_URL=http://147.93.66.91:8086 \
NEXT_PUBLIC_AUTH_COOKIE_SECURE=false \
API_INTERNAL_URL=http://gateway:3010 \
docker compose \
  -f docker-compose.vps.yml \
  -f docker-compose.vps.runtime-override.yml \
  -f docker-compose.vps.slot-develop.yml \
  -f /tmp/workspace-develop-skip-incomplete-services.yml \
  -p workspace-develop \
  up -d --no-deps gateway
```

- [x] **Step 3: Fazer smoke**

```bash
curl -fsS --max-time 10 http://127.0.0.1:3011/ready
docker logs --tail 80 workspace-develop-gateway-1
```

Esperado: `/ready` retorna `success: true`, o container permanece ativo e os logs não mostram
falha de inicialização.

- [x] **Step 4: Concluir o plano e publicar**

Marcar os checkboxes concluídos, criar o commit documental e enviar:

```bash
git push origin develop
```

Esperado: `origin/develop` e `develop` apontam para o mesmo commit.
