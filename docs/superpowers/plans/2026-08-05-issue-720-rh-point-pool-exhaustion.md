# Issue #720 RH Point Pool Exhaustion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que ações de Ponto refaçam queries não relacionadas e limitar explicitamente o pool de conexões do `rh-service`, eliminando o erro secundário `EMAXCONN` em uso normal.

**Architecture:** O cache React Query será separado por prefixo de domínio: mutações de Ponto invalidam somente `['rh', 'point']`. O contador de solicitações só fica ativo na aba de solicitações. O `rh-service` recebe `DATABASE_POOL_MAX` validado e o injeta diretamente no `PrismaPg`, sem nova abstração ou dependência.

**Tech Stack:** React, TanStack Query, Next.js, TypeScript, Express, Prisma 7, `@prisma/adapter-pg`, Vitest, scripts de teste do app.

## Global Constraints

- Não alterar endpoints, payloads, status HTTP ou schema Prisma.
- Usar pnpm e os runners já adotados pelo pacote.
- Não adicionar dependências.
- Seguir aspas duplas, dois espaços, trailing commas e imports locais `.js` nos services.
- `DATABASE_POOL_MAX` aceita inteiro positivo; ausência usa `5`; valor inválido falha na validação de ambiente.
- Não editar ou versionar `.env`, `.env.local` ou `.env.vps`.
- Manter a mudança mínima: sem retry, fila, cache novo ou refactor transversal de todos os serviços.

---

### Task 1: Isolar invalidação de Ponto e contador de solicitações

**Files:**
- Modify: `app/src/modules/rh/hooks/useRhPoint.ts`
- Modify: `app/src/shared/components/newLayout/RH.tsx`
- Modify: `app/src/modules/rh/run-rh-tests.mjs`

**Interfaces:**
- Consumes: `RH_QUERY_KEY` de `useRhRequests.ts`, `activeTab` do shell RH e as query keys existentes de Ponto.
- Produces: `RH_POINT_QUERY_KEY` exportada por `useRhPoint.ts`; mutações de Ponto invalidam esse prefixo; queries do contador recebem `enabled: canManageRhRequests && activeTab === "requests"`.

- [ ] **Step 1: Escrever os testes de regressão falhando**

Adicionar ao script existente `run-rh-tests.mjs` asserções que leiam `useRhPoint.ts` e `RH.tsx` e verifiquem:

```js
runTest("RH ponto nao invalida queries fora do dominio", () => {
  const pointSource = readFileSync("src/modules/rh/hooks/useRhPoint.ts", "utf8");

  assert.match(pointSource, /RH_POINT_QUERY_KEY/);
  assert.doesNotMatch(pointSource, /invalidateQueries\(\{ queryKey: RH_QUERY_KEY \}\)/);
});

runTest("contador de solicitacoes so fica ativo na aba de solicitacoes", () => {
  const shellSource = readFileSync("src/shared/components/newLayout/RH.tsx", "utf8");

  assert.match(shellSource, /enabled: canManageRhRequests && activeTab === "requests"/);
});
```

- [ ] **Step 2: Rodar os testes para confirmar RED**

Run: `node --experimental-strip-types src/modules/rh/run-rh-tests.mjs` (a partir de `app`)

Expected: FAIL porque o código atual ainda invalida `RH_QUERY_KEY` e mantém o contador ativo em qualquer aba.

- [ ] **Step 3: Implementar a menor correção**

Em `useRhPoint.ts`, criar:

```ts
export const RH_POINT_QUERY_KEY = [...RH_QUERY_KEY, "point"] as const;
```

Usar `...RH_POINT_QUERY_KEY` nas query keys de Ponto e substituir o `queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY })` de cada mutação de Ponto por `queryClient.invalidateQueries({ queryKey: RH_POINT_QUERY_KEY })`. Em `RH.tsx`, condicionar as duas queries do contador à aba `requests`.

- [ ] **Step 4: Rodar os testes para confirmar GREEN**

Run: `node --experimental-strip-types src/modules/rh/run-rh-tests.mjs` (a partir de `app`)

Expected: PASS, incluindo os testes existentes do módulo RH.

- [ ] **Step 5: Verificar typecheck frontend**

Run: `pnpm --filter @workspace/app typecheck`

Expected: exit code `0`.

- [ ] **Step 6: Commitar a tarefa**

```bash
git add app/src/modules/rh/hooks/useRhPoint.ts app/src/shared/components/newLayout/RH.tsx app/src/modules/rh/run-rh-tests.mjs
git commit -m "fix(rh): isolate point query invalidation"
```

### Task 2: Limitar explicitamente o pool do `rh-service`

**Files:**
- Modify: `services/rh-service/src/config/env.ts`
- Modify: `services/rh-service/src/integrations/prisma.ts`
- Create: `services/rh-service/src/test/prisma.test.ts`
- Modify: `services/rh-service/.env.example`
- Modify: `services/rh-service/README.md`

**Interfaces:**
- Consumes: `DATABASE_URL` e `DATABASE_POOL_MAX` do ambiente do `rh-service`.
- Produces: `getRhEnv().databasePoolMax: number` e `new PrismaPg({ connectionString: databaseUrl, max: databasePoolMax })`.

- [ ] **Step 1: Escrever o teste Vitest falhando**

Criar `src/test/prisma.test.ts` mockando `getRhEnv` e `PrismaPg`, e verificar o contrato de construção:

```ts
it("configura o limite de conexoes do adapter PrismaPg", async () => {
  await import("../integrations/prisma.js");

  expect(PrismaPg).toHaveBeenCalledWith({
    connectionString: "postgres://test",
    max: 5,
  });
});
```

O mock de `getRhEnv` deve retornar `{ databaseUrl: "postgres://test", databasePoolMax: 5 }`; o mock de `PrismaPg` deve ser um construtor que possa ser inspecionado.

- [ ] **Step 2: Rodar o teste para confirmar RED**

Run: `pnpm --filter @workspace/rh-service exec vitest run src/test/prisma.test.ts`

Expected: FAIL porque o adapter atual não recebe `max`.

- [ ] **Step 3: Implementar parsing e wiring mínimos**

Em `env.ts`, adicionar `databasePoolMax` com default textual `"5"`, transformar para inteiro e rejeitar valores menores que `1`. Passar esse valor para `PrismaPg` em `integrations/prisma.ts`. Documentar `DATABASE_POOL_MAX=5` no `.env.example` e a descrição da variável no README.

- [ ] **Step 4: Rodar o teste para confirmar GREEN**

Run: `pnpm --filter @workspace/rh-service exec vitest run src/test/prisma.test.ts`

Expected: PASS sem warnings adicionais.

- [ ] **Step 5: Rodar testes e typecheck do serviço**

Run: `pnpm --filter @workspace/rh-service test`

Run: `pnpm --filter @workspace/rh-service typecheck`

Expected: exit code `0` nos dois comandos.

- [ ] **Step 6: Commitar a tarefa**

```bash
git add services/rh-service/src/config/env.ts services/rh-service/src/integrations/prisma.ts services/rh-service/src/test/prisma.test.ts services/rh-service/.env.example services/rh-service/README.md
git commit -m "fix(rh): bound postgres adapter pool"
```

### Task 3: Integração, revisão e evidências da issue

**Files:**
- Review: `app/src/modules/rh/hooks/useRhPoint.ts`
- Review: `app/src/shared/components/newLayout/RH.tsx`
- Review: `services/rh-service/src/config/env.ts`
- Review: `services/rh-service/src/integrations/prisma.ts`
- Review: `docs/superpowers/specs/2026-08-05-issue-720-rh-point-pool-exhaustion-design.md`

**Interfaces:**
- Consumes: commits das Tasks 1 e 2, critérios de aceite da issue #720 e o diff completo da branch.
- Produces: testes finais, análise de performance, revisão do código, commit final, push e PR para `develop`.

- [ ] **Step 1: Conferir o diff e a higiene da branch**

Run: `git diff --check`, `git status --short`, `git diff --stat origin/develop...HEAD`, `git diff origin/develop...HEAD`

Expected: sem whitespace inválido, sem arquivos `.env`, sem artefatos gerados indevidos e apenas arquivos relacionados à issue.

- [ ] **Step 2: Rodar os gates finais**

Run: `node --experimental-strip-types src/modules/rh/run-rh-tests.mjs` (em `app`)

Run: `pnpm --filter @workspace/app typecheck`

Run: `pnpm --filter @workspace/rh-service test`

Run: `pnpm --filter @workspace/rh-service typecheck`

Run: `pnpm --filter @workspace/rh-service build`

Expected: todos os comandos terminam com exit code `0`; qualquer bloqueio de ambiente deve ser separado de falha de código.

- [ ] **Step 3: Fazer a revisão de performance**

Registrar no relatório final:

```md
## Performance Review

### Before / After Complexity
- Current: cada mutação de Ponto invalida o prefixo inteiro `['rh']` e refaz todas as queries ativas desse domínio.
- Proposed: invalidação por prefixo `['rh', 'point']`; as queries não relacionadas não são refetchadas.

### Dominant Bottleneck
- Conexões simultâneas e I/O no Postgres/pooler, não CPU.

### Proposed Change
- Reduzir refetches concorrentes no frontend e limitar o pool do `rh-service` a um valor configurável.

### Tradeoff / Proof
- O contador pode permanecer com valor em cache fora da aba de solicitações; ao abrir a aba ele é atualizado. Os testes de cache e o wiring do adapter provam a separação.
```

- [ ] **Step 4: Solicitar revisão ampla e corrigir achados**

Usar `superpowers:requesting-code-review` com o intervalo `origin/develop..HEAD`. Corrigir achados Critical/Important, reexecutar os gates afetados e só prosseguir sem pendências relevantes.

- [ ] **Step 5: Commitar ajustes finais e publicar**

Após verificação fresca, criar o commit final, fazer push da branch e abrir PR para `develop` com `gh`, vinculando `Closes #720`, evidências dos testes e assinatura do usuário Git local. Como a alteração não é visual, omitir screenshots em vez de criar evidência artificial.
