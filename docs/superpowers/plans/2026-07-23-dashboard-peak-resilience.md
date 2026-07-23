# Dashboard Peak Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manter o dashboard disponível e atualizado sem exceder o limite de conexões do banco em picos de acesso.

**Architecture:** O gateway usará uma fila FIFO compartilhada com duas consultas simultâneas e deduplicará cargas concorrentes da mesma organização. O frontend migrará o hook do dashboard para React Query, mantendo o último resultado válido durante recargas e atualizando-o em segundo plano.

**Tech Stack:** TypeScript, Node.js, `pg`, Vitest, React 18, TanStack React Query 5.

## Global Constraints

- No máximo duas consultas SQL do dashboard podem executar simultaneamente.
- O `pg.Pool` do dashboard também deve usar `max: 2`.
- Solicitações simultâneas da mesma organização devem compartilhar uma única carga.
- O frontend não deve persistir dados do dashboard no armazenamento do navegador.
- A atualização em segundo plano deve ocorrer a cada 60 segundos.
- Implementar por TDD e manter isolamento por organização ou usuário autenticado.

---

### Task 1: Fila e deduplicação no gateway

**Files:**
- Modify: `services/gateway/src/services/dashboardStatsService.test.ts`
- Modify: `services/gateway/src/services/dashboardStatsService.ts`

**Interfaces:**
- Consumes: `DashboardStatsService.getStats(organizationId: string): Promise<DashboardStats>`.
- Produces: `DashboardQueryQueue.run<T>(task: () => Promise<T>): Promise<T>` e opção interna `maxConcurrentQueries`.

- [ ] **Step 1: Escrever testes que falham**

Adicionar casos que iniciam consultas controladas e comprovam:

```ts
const service = new DashboardStatsService({
  pool: { query } as never,
  maxConcurrentQueries: 2,
});

const statsPromise = service.getStats("org-1");
await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));
expect(maxActiveQueries).toBe(2);
```

Adicionar também um caso com duas chamadas concorrentes:

```ts
await Promise.all([service.getStats("org-1"), service.getStats("org-1")]);
expect(query).toHaveBeenCalledTimes(10);
```

E um caso em que a primeira consulta rejeita, mas as consultas seguintes entram na fila.

- [ ] **Step 2: Confirmar o estado vermelho**

Executar:

```bash
pnpm --filter @workspace/gateway exec vitest run src/services/dashboardStatsService.test.ts
```

Esperado: falha porque `maxConcurrentQueries` ainda não existe e todas as consultas iniciam juntas.

- [ ] **Step 3: Implementar a fila mínima**

Criar uma fila FIFO privada:

```ts
class DashboardQueryQueue {
  private activeTasks = 0;
  private readonly pendingTasks: Array<() => void> = [];

  constructor(private readonly concurrency: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
}
```

Fazer as dez consultas existentes passarem por `queue.run`, configurar `new Pool({ max: 2 })` e
manter um `Map<string, Promise<DashboardStats>>` para compartilhar cargas por organização. Remover
a entrada do mapa em `finally`.

- [ ] **Step 4: Confirmar o estado verde**

Executar:

```bash
pnpm --filter @workspace/gateway exec vitest run src/services/dashboardStatsService.test.ts
pnpm --filter @workspace/gateway typecheck
```

Esperado: todos os testes passam e o typecheck termina com código zero.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/dashboardStatsService.ts services/gateway/src/services/dashboardStatsService.test.ts
git commit -m "fix(gateway): queue dashboard database queries"
```

### Task 2: Cache resiliente e estados do frontend

**Files:**
- Modify: `app/src/modules/dashboard/run-dashboard-tests.mjs`
- Modify: `app/src/modules/dashboard/hooks/useDashboard.ts`
- Modify: `app/src/shared/components/newLayout/Dashboard.tsx`

**Interfaces:**
- Consumes: `dashboardService.getStats(): Promise<DashboardStats>` e `useAuth().user`.
- Produces: `useDashboard()` com `stats`, `isLoading`, `error`, `isFetching` e `refetch`.

- [ ] **Step 1: Escrever testes que falham**

Estender o teste estático do módulo para exigir:

```js
assert.match(dashboardHook, /useQuery/);
assert.match(dashboardHook, /refetchInterval:\s*60_000/);
assert.match(dashboardHook, /user\?\.organization_id \?\? user\?\.id/);
assert.doesNotMatch(dashboardHook, /useState|useEffect/);
assert.match(dashboardComponent, /Carregando atividades/);
assert.match(dashboardComponent, /Tentar novamente/);
```

- [ ] **Step 2: Confirmar o estado vermelho**

Executar:

```bash
pnpm --filter @workspace/app test:dashboard
```

Esperado: falha porque o hook ainda descarta os dados ao desmontar e o componente não apresenta os
estados iniciais.

- [ ] **Step 3: Implementar o React Query e os estados visuais**

Substituir o estado manual por:

```ts
const query = useQuery({
  queryKey: ["dashboard", "stats", user?.organization_id ?? user?.id ?? "anonymous"],
  queryFn: () => dashboardService.getStats(),
  enabled: Boolean(user),
  refetchInterval: 60_000,
});
```

Retornar `stats: query.data ?? null`. No card de atividades, manter a lista quando `stats` existir;
sem dado válido, mostrar `Carregando atividades...` ou o erro com botão `Tentar novamente`. Quando
a carga válida não tiver eventos, mostrar `Nenhuma atividade recente`.

- [ ] **Step 4: Confirmar o estado verde**

Executar:

```bash
pnpm --filter @workspace/app test:dashboard
pnpm --filter @workspace/app typecheck
```

Esperado: teste e typecheck encerram com código zero.

- [ ] **Step 5: Commit**

```bash
git add app/src/modules/dashboard/run-dashboard-tests.mjs app/src/modules/dashboard/hooks/useDashboard.ts app/src/shared/components/newLayout/Dashboard.tsx
git commit -m "fix(app): preserve dashboard data during refresh"
```

### Task 3: Verificação integrada e atualização do ambiente

**Files:**
- Verify only: changes from Tasks 1 and 2.

**Interfaces:**
- Consumes: imagem de gateway e web do slot `develop`.
- Produces: contêineres atualizados e endpoint pronto para teste manual.

- [ ] **Step 1: Rodar verificações escopadas**

```bash
pnpm --filter @workspace/gateway test
pnpm --filter @workspace/gateway typecheck
pnpm --filter @workspace/app test:dashboard
pnpm --filter @workspace/app typecheck
pnpm exec biome check services/gateway/src/services/dashboardStatsService.ts services/gateway/src/services/dashboardStatsService.test.ts app/src/modules/dashboard/hooks/useDashboard.ts app/src/shared/components/newLayout/Dashboard.tsx
```

Esperado: zero falhas.

- [ ] **Step 2: Revisar o diff e os call sites**

```bash
git diff --check
git status --short
rg -n "useDashboard|DashboardStatsService" app/src services/gateway/src
```

Esperado: somente arquivos desta correção e nenhum erro de whitespace.

- [ ] **Step 3: Atualizar os grafos se disponíveis**

```bash
pnpm graphify:update:ui
pnpm graphify:update:services
```

Esperado: grafos atualizados; se os artefatos locais não existirem, registrar o fallback manual já
executado.

- [ ] **Step 4: Reconstruir e recriar somente gateway e web**

Usar os mesmos arquivos Compose e variáveis do slot `workspace-develop`, reconstruindo `gateway` e
`web` e executando `up -d --no-deps` somente para esses serviços.

- [ ] **Step 5: Fazer smoke**

Confirmar `GET /ready` do gateway e inspecionar os logs novos para garantir ausência de
`EMAXCONNSESSION`. Navegar entre dashboard e outro menu e voltar, verificando que o cache aparece e
a atualização continua em segundo plano.
