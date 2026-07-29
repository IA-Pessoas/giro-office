# Dashboard Live Activity Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atualizar o tempo relativo das atividades localmente, sem depender de novas atividades ou requisições ao gateway.

**Architecture:** O gateway entregará o timestamp ISO original em `createdAt`. Uma função pura no frontend formatará o tempo relativo usando um relógio local, atualizado por um hook a cada 30 segundos com cleanup ao desmontar.

**Tech Stack:** TypeScript, Vitest, React 18, TanStack React Query 5, Node.js 22.

## Global Constraints

- O contrato da atividade deve usar `createdAt: string | null`.
- O texto relativo não deve ser calculado pelo gateway.
- O relógio local deve atualizar a cada 30 segundos sem tráfego de rede.
- Datas ausentes, inválidas ou futuras devem resultar em `agora`.
- Todo timer deve ser limpo no cleanup do `useEffect`.

---

### Task 1: Entregar o timestamp original pelo gateway

**Files:**
- Modify: `services/gateway/src/services/dashboardStatsService.test.ts`
- Modify: `services/gateway/src/services/dashboardStatsService.ts`

**Interfaces:**
- Consumes: `ActivityRow.created_at: Date | string | null`.
- Produces: `DashboardStats.activities[number].createdAt: string | null`.

- [x] **Step 1: Escrever o teste de contrato que falha**

No teste de atividade amigável, usar uma data fixa e exigir:

```ts
expect(stats.activities[0]).toMatchObject({
  user: "Davi",
  action: "consultou",
  item: "a lista de tarefas",
  createdAt: "2026-07-23T12:00:00.000Z",
});
expect(stats.activities[0]).not.toHaveProperty("time");
```

- [x] **Step 2: Confirmar o estado vermelho**

```bash
corepack pnpm --filter @workspace/gateway exec vitest run src/services/dashboardStatsService.test.ts
```

Esperado: falha porque a resposta ainda contém `time` e não contém `createdAt`.

- [x] **Step 3: Implementar o contrato mínimo**

Substituir no tipo e no mapeamento:

```ts
createdAt: formatNullableIsoDate(activity.created_at),
```

Remover `formatElapsedTime`, pois o gateway não deve mais converter tempo relativo.

- [x] **Step 4: Confirmar o estado verde**

```bash
corepack pnpm --filter @workspace/gateway exec vitest run src/services/dashboardStatsService.test.ts
corepack pnpm --filter @workspace/gateway exec tsc --noEmit
```

Esperado: teste e typecheck terminam com código zero.

- [x] **Step 5: Commit**

```bash
git add services/gateway/src/services/dashboardStatsService.ts services/gateway/src/services/dashboardStatsService.test.ts
git commit -m "fix(gateway): expose dashboard activity timestamp"
```

### Task 2: Formatar e atualizar o tempo no frontend

**Files:**
- Create: `app/src/modules/dashboard/utils/activityTime.ts`
- Create: `app/src/modules/dashboard/hooks/useActivityClock.ts`
- Modify: `app/src/modules/dashboard/types/index.ts`
- Modify: `app/src/modules/dashboard/run-dashboard-tests.mjs`
- Modify: `app/src/shared/components/newLayout/Dashboard.tsx`

**Interfaces:**
- Consumes: `DashboardActivity.createdAt: string | null`.
- Produces: `formatActivityTime(createdAt: string | null, nowMs?: number): string`.
- Produces: `useActivityClock(): number`.

- [x] **Step 1: Escrever testes determinísticos que falham**

Importar a função no runner do dashboard e validar:

```js
assert.equal(formatActivityTime("2026-07-23T11:59:30.000Z", now), "agora");
assert.equal(formatActivityTime("2026-07-23T11:55:00.000Z", now), "há 5 min");
assert.equal(formatActivityTime("2026-07-23T10:00:00.000Z", now), "há 2 horas");
assert.equal(formatActivityTime("2026-07-21T12:00:00.000Z", now), "há 2 dias");
assert.equal(formatActivityTime("invalid", now), "agora");
```

Exigir também no código do hook:

```js
assert.match(activityClockHook, /30_000/);
assert.match(activityClockHook, /clearInterval/);
```

- [x] **Step 2: Confirmar o estado vermelho**

Executar o runner em Node.js 22:

```bash
docker run --rm -v "$PWD:/workspace" -w /workspace node:22-bookworm-slim node --experimental-strip-types app/src/modules/dashboard/run-dashboard-tests.mjs
```

Esperado: falha porque a função e o hook ainda não existem.

- [x] **Step 3: Implementar função pura e relógio local**

Criar:

```ts
export function formatActivityTime(createdAt: string | null, nowMs = Date.now()): string {
  if (!createdAt) return "agora";
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return "agora";
  const seconds = Math.max(0, Math.floor((nowMs - timestamp) / 1000));
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} hora${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days === 1 ? "" : "s"}`;
}
```

E:

```ts
export function useActivityClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);
  return now;
}
```

Usar `createdAt` e o valor do relógio ao montar as atividades em `Dashboard.tsx`.

- [x] **Step 4: Confirmar o estado verde**

```bash
docker run --rm -v "$PWD:/workspace" -w /workspace node:22-bookworm-slim node --experimental-strip-types app/src/modules/dashboard/run-dashboard-tests.mjs
corepack pnpm --filter @workspace/app exec tsc --noEmit
corepack pnpm --filter @workspace/app exec tsc -p tsconfig.usefetch-types.json --noEmit
```

Esperado: testes e typechecks terminam com código zero.

- [x] **Step 5: Commit**

```bash
git add app/src/modules/dashboard/utils/activityTime.ts app/src/modules/dashboard/hooks/useActivityClock.ts app/src/modules/dashboard/types/index.ts app/src/modules/dashboard/run-dashboard-tests.mjs app/src/shared/components/newLayout/Dashboard.tsx
git commit -m "fix(app): refresh dashboard activity time locally"
```

### Task 3: Verificação e publicação

**Files:**
- Verify only: arquivos das Tasks 1 e 2.

**Interfaces:**
- Consumes: imagens `workspace-gateway:vps-develop` e `workspace-web:vps-develop`.
- Produces: gateway e web atualizados no ambiente `develop`.

- [x] **Step 1: Rodar a validação final**

```bash
corepack pnpm --filter @workspace/gateway exec vitest run
corepack pnpm --filter @workspace/gateway exec tsc --noEmit
docker run --rm -v "$PWD:/workspace" -w /workspace node:22-bookworm-slim node --experimental-strip-types app/src/modules/dashboard/run-dashboard-tests.mjs
corepack pnpm --filter @workspace/app exec tsc --noEmit
git diff --check
```

Esperado: zero falhas.

- [x] **Step 2: Atualizar Graphify quando disponível**

```bash
corepack pnpm graphify:update:ui
corepack pnpm graphify:update:services
```

Se o Graphify continuar indisponível, aplicar o fallback manual com diff e busca de call sites.

- [x] **Step 3: Gerar as imagens e recriar os contêineres afetados**

Reconstruir `gateway` e `web` com os arquivos Compose do slot `workspace-develop` e executar
`up -d --no-deps gateway web`.

- [x] **Step 4: Fazer smoke e push**

Confirmar `/ready`, ausência de erros nos logs, criar os commits previstos e enviar `develop` para
`origin`.
