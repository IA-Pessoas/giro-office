# Regularize orientação independente e checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir a orientação do Regularize para PJ, PF ou não cliente, com processo opcional, vínculo isolado por organização, checklist exato de 17 itens, filial condicional, auditoria atômica e cobertura de API/frontend.

**Architecture:** Usar uma evolução aditiva de `ProceduralGuidance`: manter os campos legados, tornar `process_id` opcional, adicionar alvo/snapshot/filial e criar uma tabela filha para os itens do checklist. Centralizar códigos, rótulos, status e tipos públicos em `@workspace/shared`; o serviço valida tenant, executa pai+itens+log em uma transação e o frontend envia a orientação completa em uma única mutação.

**Tech Stack:** TypeScript, Express, Zod, Prisma 7/PostgreSQL, Vitest, React/Next.js, TanStack Query, Playwright, OpenAPI e pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-09-16-regularize-orientacao-checklist-design.md`

## Global Constraints

- Responder e manter cópia documental em português neste workspace.
- Preservar os campos legados, ids e histórico de `ProceduralGuidance`; não apagar orientações antigas.
- O conjunto canônico contém exatamente estes 17 códigos, nesta ordem: `type`, `request`, `framework_obs`, `legal_nature`, `company_name`, `trade_name`, `cpf_cnpj`, `share_capital`, `iptu`, `address`, `comporate_purpose`, `carryng`, `regime`, `legal_representative`, `economic_activities`, `partners`, `branch`.
- Os status dos itens são exatamente `Pendente`, `Concluído` e `Não se aplica`.
- `process_id`, `client_pj_id` e `client_pf_id` só podem resolver registros da organização autenticada.
- `branch_data` só pode existir quando `branch` estiver `Concluído`; qualquer transição para outro status limpa o dado na mesma transação.
- Toda alteração de orientação, checklist, vínculo e log deve ser atômica.
- Uma orientação `Em andamento` por organização/processo; processo nulo não participa do índice de unicidade.
- A criação/alteração deve manter a permissão Regularize e os estados de carregamento, erro, vazio e somente leitura do frontend.
- Não instalar hooks automáticos do Graphify e não versionar `graphify-out/`.
- Usar TDD: teste falhando, implementação mínima, teste verde, refatoração e commit pequeno.

## Mapa de arquivos

### Contrato compartilhado

- Criar `shared/src/regularize/guidance.ts`: tipos, códigos, rótulos, status e shape de snapshot/filial.
- Modificar `shared/src/index.ts` e `shared/package.json`: exportar o módulo `regularize` para backend e frontend.
- Criar `shared/tests/regularize-guidance.test.ts`: contrato de cardinalidade, ordem e valores canônicos.
- Modificar `app/package.json` e `pnpm-lock.yaml`: permitir que o frontend consuma `@workspace/shared`.

### Banco

- Modificar `infra/prisma/schema.prisma`: processo opcional, alvo/snapshot/filial, relações PJ/PF e modelo de itens.
- Criar `infra/prisma/migrations/20260916150000_regularize_guidance_checklist/migration.sql`: alteração aditiva, backfill, 17 linhas por orientação e índice único parcial.
- Criar `infra/prisma/scripts/test/regularize-guidance-schema.test.mjs`: contrato textual mínimo do schema e migration.

### Backend Regularize

- Modificar `services/regularize-service/src/schemas/guidance.schemas.ts`: payloads estritos e validações condicionais.
- Criar `services/regularize-service/src/services/guidanceChecklist.ts`: validação pura dos 17 itens, projeção legada e regra de filial.
- Criar `services/regularize-service/src/services/guidanceTarget.ts`: resolução PJ/PF/não cliente e construção do snapshot.
- Modificar `services/regularize-service/src/services/regularizeLogService.ts`: aceitar o executor Prisma da transação.
- Modificar `services/regularize-service/src/services/guidanceService.ts`: criação, update, vínculo, list/detail, compatibilidade de atividades/sócios e auditoria transacional.
- Modificar `services/regularize-service/src/routes/guidance.routes.ts`: query opcional e contratos evoluídos.
- Modificar `services/regularize-service/src/openapi/spec.ts`: schemas, parâmetros, respostas e conflitos da guidance.
- Criar `services/regularize-service/src/test/guidance.schemas.test.ts`.
- Criar `services/regularize-service/src/test/guidanceChecklist.test.ts`.
- Criar `services/regularize-service/src/test/guidanceTarget.test.ts`.
- Criar `services/regularize-service/src/test/guidanceService.test.ts`.
- Modificar `services/regularize-service/src/test/remaining.routes.test.ts` e `status.schemas.test.ts`.

### Frontend Regularize

- Modificar `app/src/modules/regularize/types.ts`: orientação, alvo, snapshot, filial, checklist e filtros opcionais.
- Modificar `app/src/modules/regularize/services/regularizeService.contract.ts`: parâmetros de lista opcionais e contratos de payload.
- Modificar `app/src/modules/regularize/services/regularizeService.ts`: enviar update completo, sem descartar vínculo, alvo ou checklist.
- Modificar `app/src/modules/regularize/hooks/queryKeys.ts` e `useRegularizeOperations.ts`: filtros, habilitação e invalidação corretos.
- Modificar `app/src/modules/regularize/components/RegularizeGuidanceForm.tsx`: fluxo independente, 17 linhas, filial condicional e snapshot.
- Modificar `app/src/modules/regularize/components/RegularizePage.tsx`: criar/listar orientação sem processo selecionado e manter fluxo processual.
- Modificar `app/src/modules/regularize/run-regularize-tests.mjs`: testes estáticos dos contratos e estados essenciais.

### Verificação

- Atualizar `services/regularize-service/src/test/internalReporting.openapi.test.ts` somente se o contrato OpenAPI compartilhado exigir cobertura adicional.
- Gerar screenshots em `output/playwright` durante o smoke manual/browser da tela de orientação.
- Atualizar o contexto Graphify com `pnpm graphify:update:services` e `pnpm graphify:update:ui` se os grafos forem criados durante a implementação.

---

### Task 1: Publicar o contrato canônico compartilhado

**Files:**
- Create: `shared/src/regularize/guidance.ts`
- Modify: `shared/src/index.ts`
- Modify: `shared/package.json`
- Create: `shared/tests/regularize-guidance.test.ts`
- Modify: `app/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `REGULARIZE_GUIDANCE_TARGET_TYPES`, `REGULARIZE_GUIDANCE_CHECKLIST_ITEMS`, `REGULARIZE_GUIDANCE_CHECKLIST_CODES`, `REGULARIZE_GUIDANCE_CHECKLIST_STATUSES`.
- Produces types `RegularizeGuidanceTargetType`, `RegularizeGuidanceChecklistCode`, `RegularizeGuidanceChecklistStatus`, `RegularizeGuidanceSnapshot` e `RegularizeGuidanceBranchData`.
- Later tasks import esses nomes de `@workspace/shared/regularize`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `shared/tests/regularize-guidance.test.ts` usando `node:test` e `node:assert/strict`, verificando que a lista tem 17 itens, códigos únicos e a ordem aprovada:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  REGULARIZE_GUIDANCE_CHECKLIST_CODES,
  REGULARIZE_GUIDANCE_CHECKLIST_ITEMS,
  REGULARIZE_GUIDANCE_CHECKLIST_STATUSES,
  REGULARIZE_GUIDANCE_TARGET_TYPES,
} from "../src/regularize/guidance.js";

test("exposes exactly the approved checklist", () => {
    assert.equal(REGULARIZE_GUIDANCE_CHECKLIST_ITEMS.length, 17);
    assert.deepEqual([...REGULARIZE_GUIDANCE_CHECKLIST_CODES], [
      "type", "request", "framework_obs", "legal_nature", "company_name",
      "trade_name", "cpf_cnpj", "share_capital", "iptu", "address",
      "comporate_purpose", "carryng", "regime", "legal_representative",
      "economic_activities", "partners", "branch",
    ]);
    assert.equal(new Set(REGULARIZE_GUIDANCE_CHECKLIST_CODES).size, 17);
    assert.deepEqual(REGULARIZE_GUIDANCE_CHECKLIST_STATUSES, [
      "Pendente", "Concluído", "Não se aplica",
    ]);
    assert.deepEqual(REGULARIZE_GUIDANCE_TARGET_TYPES, ["PJ", "PF", "SEM_CLIENTE"]);
});
```

- [ ] **Step 2: Executar o teste para confirmar a falha**

Rodar `corepack pnpm --filter @workspace/shared exec tsx --test tests/regularize-guidance.test.ts`.

Esperado: falha porque o módulo canônico ainda não existe.

- [ ] **Step 3: Implementar o contrato mínimo**

Criar os arrays `as const` com os 17 objetos `{ code, label }`, os três tipos de alvo, os três status e os tipos derivados. Definir `RegularizeGuidanceSnapshot` com `version: 1`, `source: "client_pj" | "client_pf" | "manual"` e campos cadastrais opcionais; definir `RegularizeGuidanceBranchData` com `name`, `document`, `address`, `city` e `state`.

Adicionar o export `./regularize` em `shared/package.json` e `export * from "./regularize/guidance.js"` no índice do pacote. Adicionar `@workspace/shared: workspace:*` às dependências do app e atualizar o lockfile com `corepack pnpm install --lockfile-only`.

- [ ] **Step 4: Executar o teste para confirmar o verde**

Rodar `corepack pnpm --filter @workspace/shared exec tsx --test tests/regularize-guidance.test.ts` e `corepack pnpm --filter @workspace/shared typecheck`.

Esperado: ambos passam e o subpath `@workspace/shared/regularize` resolve.

- [ ] **Step 5: Commit**

```bash
git add shared/src/regularize/guidance.ts shared/src/index.ts shared/package.json shared/tests/regularize-guidance.test.ts app/package.json pnpm-lock.yaml
git commit -m "feat: publish regularize guidance contract"
```

### Task 2: Evoluir o schema Prisma e a migração aditiva

**Files:**
- Modify: `infra/prisma/schema.prisma:612-700,819-851,1879-1935`
- Create: `infra/prisma/migrations/20260916150000_regularize_guidance_checklist/migration.sql`
- Create: `infra/prisma/scripts/test/regularize-guidance-schema.test.mjs`

**Interfaces:**
- Produces nullable `Process.guidances` relation through `ProceduralGuidance.process_id String?`.
- Produces `ProceduralGuidance.target_type`, `client_pj_id`, `client_pf_id`, `target_snapshot`, `branch_data` and `checklist_items`.
- Produces `ProceduralGuidanceChecklistItem` mapped to `regularize.proceduralGuidanceChecklistItems`, unique by `(guidance_id, code)`.

- [ ] **Step 1: Escrever a verificação de schema que falha**

Criar `infra/prisma/scripts/test/regularize-guidance-schema.test.mjs` com `node:test`, lendo `schema.prisma` e a migration e exigindo `process_id String?`, `target_type`, `target_snapshot`, `branch_data`, o modelo filho, os 17 códigos e o índice parcial. Antes da alteração, a leitura/asserção deve falhar porque esses trechos ainda não existem:

```powershell
corepack pnpm --filter @workspace/infra exec tsx --test prisma/scripts/test/regularize-guidance-schema.test.mjs
```

Esperado: FAIL nas asserções do contrato, sem modificar o banco.

- [ ] **Step 2: Alterar o schema Prisma mínimo**

Em `ProceduralGuidance`, tornar `process_id` e `process` opcionais; adicionar os campos de alvo, snapshot e filial; adicionar `checklist_items`. Adicionar relações nomeadas para `Client` e `ClientPF` para evitar conflito com as relações já existentes em `Process`:

```prisma
clientPJ Client?  @relation("proceduralGuidanceClientPJ", fields: [client_pj_id], references: [id])
clientPF ClientPF? @relation("proceduralGuidanceClientPF", fields: [client_pf_id], references: [id])
```

Adicionar os lados correspondentes em `Client` e `ClientPF`. Criar o modelo filho com `id`, `guidance_id`, `code`, `label`, `status`, `observation`, `created_at`, `updated_at`, relação cascade para a orientação e `@@unique([guidance_id, code])`.

- [ ] **Step 3: Escrever a migração SQL e o backfill**

Criar a migration com esta ordem:

1. adicionar colunas anuláveis ou com defaults seguros;
2. tornar `process_id` anulável e manter a FK existente;
3. criar a tabela filha e suas FKs/indexes;
4. preencher `target_type` como `PJ` quando o processo tiver `client_pj_id`, `PF` quando tiver `client_pf_id` e `SEM_CLIENTE` nos demais casos;
5. preencher `client_pj_id`/`client_pf_id` somente a partir do processo da mesma organização;
6. construir `target_snapshot` com `jsonb_build_object('version', 1, 'source', 'legacy', ...)`, incluindo os campos legados sem inventar dados;
7. inserir, via `CROSS JOIN (VALUES (...))`, exatamente as 17 linhas canônicas para cada orientação existente com status `Pendente` e `ON CONFLICT (guidance_id, code) DO NOTHING`;
8. criar `procedural_guidance_active_process_unique` em `(organization_id, process_id)` com filtro `process_id IS NOT NULL AND status = 'Em andamento'`.

Antes do índice, adicionar um bloco `DO $$` que detecta colisões por organização/processo/status e lança erro com a contagem, preservando os registros para saneamento explícito. Não excluir nem consolidar orientações.

- [ ] **Step 4: Validar schema e migration**

Rodar `corepack pnpm --filter @workspace/infra exec tsx --test prisma/scripts/test/regularize-guidance-schema.test.mjs`, `corepack pnpm --filter @workspace/infra exec prisma format`, `corepack pnpm --filter @workspace/infra exec prisma validate` e `corepack pnpm prisma:generate`.

Esperado: Prisma valida, gera o cliente e a migration contém a tabela, backfill e índice parcial sem alterar os arquivos de `graphify-out`.

- [ ] **Step 5: Commit**

```bash
git add infra/prisma/schema.prisma infra/prisma/migrations/20260916150000_regularize_guidance_checklist/migration.sql infra/prisma/scripts/test/regularize-guidance-schema.test.mjs
git commit -m "feat: add regularize guidance checklist persistence"
```

### Task 3: Implementar schemas Zod e validadores puros em TDD

**Files:**
- Modify: `services/regularize-service/src/schemas/guidance.schemas.ts`
- Create: `services/regularize-service/src/services/guidanceChecklist.ts`
- Create: `services/regularize-service/src/services/guidanceTarget.ts`
- Create: `services/regularize-service/src/test/guidance.schemas.test.ts`
- Create: `services/regularize-service/src/test/guidanceChecklist.test.ts`
- Create: `services/regularize-service/src/test/guidanceTarget.test.ts`

**Interfaces:**
- `createGuidanceBodySchema` exige `target_type`, snapshot coerente, status-pai e os 17 itens.
- `updateGuidanceBodySchema` preserva updates legados parciais, mas quando `checklist` for enviado exige os 17 itens sem duplicidade.
- `assertCompleteGuidanceChecklist(items)` retorna os itens ordenados canonicamente ou lança `ServiceError(422, ...)`.
- `resolveGuidanceTarget(prismaLike, organizationId, input)` retorna `{ targetType, clientPjId, clientPfId, snapshot }` depois do filtro organizacional.
- `resolveBranchData(checklist, branchData)` retorna `null` ou o shape validado da filial.

- [ ] **Step 1: Escrever testes vermelhos de schema**

Criar fixture com os 17 itens e testar:

```ts
it("rejects a checklist with a missing, duplicated or unknown code", () => {
  expect(createGuidanceBodySchema.safeParse({ ...validCreate, checklist: validCreate.checklist.slice(1) }).success).toBe(false);
  expect(createGuidanceBodySchema.safeParse({ ...validCreate, checklist: [...validCreate.checklist, validCreate.checklist[0]] }).success).toBe(false);
  expect(createGuidanceBodySchema.safeParse({ ...validCreate, checklist: validCreate.checklist.map((item, index) => index === 0 ? { ...item, code: "unknown" } : item) }).success).toBe(false);
});

it("requires a completed branch item before accepting branch data", () => {
  const branchData = { name: "Filial Centro", address: "Rua A", city: "São Paulo", state: "SP" };
  expect(createGuidanceBodySchema.safeParse({ ...validCreate, branch_data: branchData }).success).toBe(false);
  expect(createGuidanceBodySchema.safeParse({ ...validCreate, checklist: withBranchStatus("Concluído"), branch_data: branchData }).success).toBe(true);
});
```

Adicionar casos PJ com `client_pj_id`, PF com `client_pf_id`, `SEM_CLIENTE` com snapshot manual, processo omitido/nulo e ids incompatíveis com o alvo.

- [ ] **Step 2: Executar os testes para confirmar a falha**

Rodar `corepack pnpm --filter @workspace/regularize-service exec vitest run src/test/guidance.schemas.test.ts src/test/guidanceChecklist.test.ts src/test/guidanceTarget.test.ts`.

Esperado: falha por schemas, constantes e funções ainda não implementados.

- [ ] **Step 3: Implementar schemas e validadores mínimos**

Usar `z.enum([...REGULARIZE_GUIDANCE_CHECKLIST_STATUSES])`, `z.enum([...REGULARIZE_GUIDANCE_TARGET_TYPES])`, `z.array(...).length(17)` e refinements que comparem o conjunto ordenado aos códigos compartilhados. Para criação, o alvo deve ser uma união discriminada; para update, aceitar `process_id: z.string().uuid().nullable().optional()` e manter a compatibilidade de campos legados.

Em `guidanceChecklist.ts`, rejeitar código ausente/duplicado/desconhecido, normalizar na ordem canônica e validar a relação `branch`/`branch_data`. Em `guidanceTarget.ts`, fazer as consultas por `id` e `organization_id`, rejeitando PF/PJ incompatível e retornando `ServiceError(404, "Cadastro nao encontrado.")` sem expor tenant.

- [ ] **Step 4: Executar testes e typecheck**

Rodar novamente os três testes e `corepack pnpm --filter @workspace/regularize-service typecheck`.

Esperado: schemas e validadores passam, com mensagens `422` para payload inválido e sem dependência de dados de outra organização.

- [ ] **Step 5: Commit**

```bash
git add services/regularize-service/src/schemas/guidance.schemas.ts services/regularize-service/src/services/guidanceChecklist.ts services/regularize-service/src/services/guidanceTarget.ts services/regularize-service/src/test/guidance.schemas.test.ts services/regularize-service/src/test/guidanceChecklist.test.ts services/regularize-service/src/test/guidanceTarget.test.ts
git commit -m "feat: validate regularize guidance targets and checklist"
```

### Task 4: Tornar o caso de uso transacional e compatível

**Files:**
- Modify: `services/regularize-service/src/services/regularizeLogService.ts`
- Modify: `services/regularize-service/src/services/guidanceService.ts`
- Create: `services/regularize-service/src/test/guidanceService.test.ts`

**Interfaces:**
- `GuidanceService.create({ organizationId, userId, body })` cria pai, 17 itens e log na mesma transação.
- `GuidanceService.update({ organizationId, userId, body })` altera pai, vínculo, checklist, projeção legada e filial atomicamente.
- `GuidanceService.listByProcess(organizationId, processId?)` lista por organização e, quando informado, por processo; sem filtro lista orientações da organização.
- Todas as respostas de create/update/detail/list incluem `checklist_items` e os dados de alvo/vínculo necessários.

- [ ] **Step 1: Escrever testes vermelhos de serviço**

Criar um fake Prisma com `$transaction`, `proceduralGuidance`, `proceduralGuidanceChecklistItem`, `process`, `client` e `clientPF`, e testar:

```ts
it("creates independent PF guidance with 17 items and an audit log atomically", async () => {
  const prisma = makePrismaFake({ clientPF: { id: "pf-1", organization_id: "org-1", name: "Ana" } });
  const result = await new GuidanceService(prisma).create({
    organizationId: "org-1",
    userId: "user-1",
    body: validPfCreateBody({ process_id: undefined }),
  });

  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(prisma.lastTransactionClient.proceduralGuidanceChecklistItem.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([{ code: "branch", status: "Pendente" }]) });
  expect(prisma.lastTransactionClient.logs.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ referring: "regularize.guidance" }) }));
  expect(result).toEqual(expect.objectContaining({ target_type: "PF", process_id: null }));
});

it("rejects a process from another organization and rolls back parent, items and log", async () => {
  const prisma = makePrismaFake({ process: null });
  await expect(new GuidanceService(prisma).create({ organizationId: "org-1", userId: "user-1", body: validPjCreateBody({ process_id: "foreign-process" }) })).rejects.toMatchObject({ statusCode: 404 });
  expect(prisma.proceduralGuidance.create).not.toHaveBeenCalled();
  expect(prisma.logs.create).not.toHaveBeenCalled();
});
```

Adicionar casos de conflito de processo em andamento (`409`), histórico finalizado permitido, vínculo posterior, remoção/troca, filial inválida, checklist incompleto e rollback quando o log falha.

- [ ] **Step 2: Executar testes para confirmar a falha**

Rodar `corepack pnpm --filter @workspace/regularize-service exec vitest run src/test/guidanceService.test.ts`.

Esperado: falha porque o serviço atual exige sempre processo, não cria filhos e grava log fora da transação.

- [ ] **Step 3: Implementar a transação mínima**

Alterar `RegularizeLogService` para aceitar uma interface com `logs.create`, compatível tanto com `PrismaClient` quanto com `Prisma.TransactionClient`. Em `GuidanceService`, encapsular cada operação em `this.prisma.$transaction(async (tx) => { ... })`; instanciar o log com `tx` dentro da callback.

No create, resolver alvo, validar processo opcional, criar pai com ids/snapshot/filial, criar os 17 filhos e registrar `Cadastro`. No update, carregar por `{ id, organization_id }`, resolver novo processo no mesmo tenant, checar conflitos, atualizar todos os campos legados enviados, substituir os itens em uma operação controlada e limpar `branch_data` quando necessário; registrar `Atualizacao` com diff.

Para a projeção legada, `type` até `legal_representative` continua no pai; `economic_activities` e `partners` continuam JSON e são sincronizados a partir dos itens/arrays recebidos. Os endpoints de atividade/sócio devem usar a mesma transação, carregar a orientação por organização e retornar o detalhe expandido.

- [ ] **Step 4: Executar testes e validar regras de isolamento**

Rodar `corepack pnpm --filter @workspace/regularize-service exec vitest run src/test/guidanceService.test.ts src/test/guidanceChecklist.test.ts src/test/guidanceTarget.test.ts` e `corepack pnpm --filter @workspace/regularize-service typecheck`.

Esperado: criação sem processo, vínculo controlado, histórico preservado, conflito `409`, rollback completo e auditoria na mesma transação.

- [ ] **Step 5: Commit**

```bash
git add services/regularize-service/src/services/regularizeLogService.ts services/regularize-service/src/services/guidanceService.ts services/regularize-service/src/test/guidanceService.test.ts
git commit -m "feat: make regularize guidance updates atomic"
```

### Task 5: Evoluir rotas, OpenAPI e testes de integração

**Files:**
- Modify: `services/regularize-service/src/routes/guidance.routes.ts`
- Modify: `services/regularize-service/src/openapi/spec.ts`
- Modify: `services/regularize-service/src/test/remaining.routes.test.ts`
- Modify: `services/regularize-service/src/test/status.schemas.test.ts`

**Interfaces:**
- `GET /regularize/guidance/list` aceita `process_id` ausente e encaminha `undefined`.
- `POST /regularize/guidance` retorna `201` com orientação completa.
- `PUT /regularize/guidance` retorna `200` com orientação completa.
- OpenAPI documenta `target_type`, `target_snapshot`, `process_id` anulável, `checklist`, `branch_data`, `404`, `409` e `422`.

- [ ] **Step 1: Escrever testes vermelhos de rota/contrato**

Estender `remaining.routes.test.ts` com requisição de criação sem processo e filtro de lista sem `process_id`; verificar 17 itens na resposta. Adicionar casos para conflito e payload de filial inválido. Em `status.schemas.test.ts`, verificar que o schema OpenAPI do POST contém os três status de item e a propriedade `checklist` com `minItems: 17` e `maxItems: 17`.

```ts
it("lists independent guidance when process_id is omitted", async () => {
  prisma.proceduralGuidance.findMany.mockResolvedValue([guidanceWithChecklist]);
  const response = await request(app).get("/regularize/guidance/list").set(gatewayHeaders());

  expect(response.status).toBe(200);
  expect(prisma.proceduralGuidance.findMany).toHaveBeenCalledWith({
    where: { organization_id: TEST_ORGANIZATION_ID },
    include: expect.anything(),
  });
});
```

- [ ] **Step 2: Executar testes para confirmar a falha**

Rodar `corepack pnpm --filter @workspace/regularize-service exec vitest run src/test/remaining.routes.test.ts src/test/status.schemas.test.ts`.

Esperado: falha porque a query ainda é obrigatória e o OpenAPI não descreve o checklist.

- [ ] **Step 3: Implementar rotas e documentação**

Trocar `listGuidanceByProcessQuerySchema` por schema com `process_id` opcional/nullável, preservando `strict()`. Atualizar a chamada do serviço e incluir respostas expandidas. Em `spec.ts`, criar helpers para o schema compartilhado de checklist/target/branch e usar `additionalProperties: false`; adicionar respostas `404`, `409` e `422` além das respostas protegidas existentes.

Manter os endpoints de atividade/sócio e documentar que são compatibilidade; não criar rotas paralelas para orientação independente.

- [ ] **Step 4: Executar testes, OpenAPI e smoke coverage**

Rodar `corepack pnpm --filter @workspace/regularize-service exec vitest run src/test/remaining.routes.test.ts src/test/status.schemas.test.ts src/test/internalReporting.openapi.test.ts`, `corepack pnpm --filter @workspace/regularize-service build` e `corepack pnpm smoke:coverage`.

Esperado: rotas, OpenAPI e manifesto de smoke permanecem consistentes.

- [ ] **Step 5: Commit**

```bash
git add services/regularize-service/src/routes/guidance.routes.ts services/regularize-service/src/openapi/spec.ts services/regularize-service/src/test/remaining.routes.test.ts services/regularize-service/src/test/status.schemas.test.ts
git commit -m "feat: expose independent regularize guidance API"
```

### Task 6: Atualizar tipos, serviço e cache do frontend

**Files:**
- Modify: `app/src/modules/regularize/types.ts`
- Modify: `app/src/modules/regularize/services/regularizeService.contract.ts`
- Modify: `app/src/modules/regularize/services/regularizeService.ts`
- Modify: `app/src/modules/regularize/hooks/queryKeys.ts`
- Modify: `app/src/modules/regularize/hooks/useRegularizeOperations.ts`
- Modify: `app/src/modules/regularize/run-regularize-tests.mjs`

**Interfaces:**
- `RegularizeGuidanceListFilters = { process_id?: RegularizeId; target_type?: RegularizeGuidanceTargetType }`.
- `RegularizeGuidance.checklist_items` tem exatamente 17 `RegularizeGuidanceChecklistItem`.
- `CreateRegularizeGuidancePayload` aceita processo opcional, alvo, snapshot e checklist completo.
- `UpdateRegularizeGuidancePayload` inclui `id` e aceita `process_id: RegularizeId | null`.
- `buildRegularizeGuidanceListParams` omite parâmetros ausentes, sem enviar `process_id: ""`.

- [ ] **Step 1: Escrever os testes estáticos que falham**

Em `run-regularize-tests.mjs`, adicionar verificações de que:

```js
assert.match(typesSource, /checklist_items/);
assert.match(contractSource, /target_type/);
assert.match(operationsSource, /enabled: \(options\?\.enabled \?\? true\)/);
assert.deepEqual(buildRegularizeGuidanceListParams({}), {});
assert.deepEqual(buildRegularizeGuidanceListParams({ process_id: "process-1", target_type: "PJ" }), {
  process_id: "process-1",
  target_type: "PJ",
});
```

Adicionar teste de query key distinguindo `{}` de `{ process_id: "process-1" }` e de `{ target_type: "PF" }`.

- [ ] **Step 2: Executar o teste para confirmar a falha**

Rodar `corepack pnpm --filter @workspace/app test:regularize`.

Esperado: falha porque os tipos e a query atual exigem processo.

- [ ] **Step 3: Implementar contratos e cache**

Importar os tipos compartilhados de `@workspace/shared/regularize`, adicionar `checklist_items`, `target_type`, `client_pj_id`, `client_pf_id`, `target_snapshot`, `branch_data` e processo nullable aos tipos. Atualizar `buildRegularizeGuidanceListParams`, `regularizeQueryKeys.guidance` e `useRegularizeGuidance` para habilitar a consulta quando houver filtros válidos ou quando a tela pedir todas as orientações.

Em `regularizeService.updateGuidance`, não remover `process_id`; enviar o payload completo ao endpoint. Manter as mutações legadas de atividade/sócio e a invalidação das operações, acrescentando a chave de detalhe/lista quando possível.

- [ ] **Step 4: Executar testes e typecheck do app**

Rodar `corepack pnpm --filter @workspace/app test:regularize` e `corepack pnpm --filter @workspace/app typecheck`.

Esperado: contratos, cache e chamadas compilam; filtros independentes não ficam desabilitados por `process_id` vazio.

- [ ] **Step 5: Commit**

```bash
git add app/src/modules/regularize/types.ts app/src/modules/regularize/services/regularizeService.contract.ts app/src/modules/regularize/services/regularizeService.ts app/src/modules/regularize/hooks/queryKeys.ts app/src/modules/regularize/hooks/useRegularizeOperations.ts app/src/modules/regularize/run-regularize-tests.mjs
git commit -m "feat: support independent guidance in regularize client"
```

### Task 7: Construir o formulário de orientação independente

**Files:**
- Modify: `app/src/modules/regularize/components/RegularizeGuidanceForm.tsx`
- Modify: `app/src/modules/regularize/components/RegularizePage.tsx`
- Modify: `app/src/modules/regularize/run-regularize-tests.mjs`

**Interfaces:**
- O formulário recebe `defaultProcessId?: string`, opções de processo opcionais e listas de PJ/PF já filtradas pela organização.
- O estado mantém `target_type`, ids cadastrais, snapshot, processo opcional, os campos legados, `checklist_items` e `branch_data`.
- `onSubmit` sempre envia checklist completo; em edição envia também `id` e `process_id` atual/null.

- [ ] **Step 1: Escrever testes estáticos vermelhos do formulário**

Adicionar ao runner de Regularize verificações para os textos e invariantes essenciais:

```js
assert.match(guidanceFormSource, /SEM_CLIENTE/);
assert.match(guidanceFormSource, /Pendente/);
assert.match(guidanceFormSource, /Não se aplica/);
assert.match(guidanceFormSource, /branch_data/);
assert.match(guidanceFormSource, /disabled=\{!isBranchCompleted\}/);
assert.match(pageSource, /useRegularizeGuidance\(undefined/);
```

- [ ] **Step 2: Executar o teste para confirmar a falha**

Rodar `corepack pnpm --filter @workspace/app test:regularize`.

Esperado: falha porque o formulário ainda exige processo e não renderiza checklist/alvo/filial.

- [ ] **Step 3: Implementar o formulário mínimo completo**

Adicionar seletor de alvo com `PJ`, `PF` e `SEM_CLIENTE`; exibir seletor PJ/PF compatível com os componentes existentes; permitir processo vazio; preservar os campos legados como edição do snapshot/projeção. Renderizar `REGULARIZE_GUIDANCE_CHECKLIST_ITEMS.map(...)` com `RegularizeNativeSelect` para o status e textarea para observação.

Derivar `isBranchCompleted` do item `branch`. Renderizar os campos de filial desabilitados quando falso e limpar o estado local ao mudar para `Pendente`/`Não se aplica`. Antes do submit, normalizar texto/números, exigir alvo válido e montar os 17 itens na ordem canônica.

Na página, separar a consulta de orientação da seleção de processo, manter detalhe processual quando houver processo selecionado e permitir o botão “Nova orientação” para usuários autorizados mesmo sem processo. Ao abrir edição, preencher o vínculo atual e permitir removê-lo/trocá-lo.

- [ ] **Step 4: Executar runner e typecheck**

Rodar `corepack pnpm --filter @workspace/app test:regularize` e `corepack pnpm --filter @workspace/app typecheck`.

Esperado: formulário independente, checklist, filial condicional, permissões e query sem processo passam.

- [ ] **Step 5: Commit**

```bash
git add app/src/modules/regularize/components/RegularizeGuidanceForm.tsx app/src/modules/regularize/components/RegularizePage.tsx app/src/modules/regularize/run-regularize-tests.mjs
git commit -m "feat: add independent regularize guidance form"
```

### Task 8: Exercitar o fluxo no navegador e produzir evidências

**Files:**
- Create: `output/playwright/regularize-guidance-independent.png`
- Create: `output/playwright/regularize-guidance-linked.png`
- Modify: `app/src/modules/regularize/run-regularize-tests.mjs` somente se o smoke revelar um contrato faltante.

**Interfaces:**
- Fluxo manual: abrir Regularize, criar orientação `SEM_CLIENTE` sem processo, preencher checklist e confirmar filial bloqueada até `Concluído`.
- Fluxo manual: editar a orientação, vincular processo da mesma organização, salvar e verificar que aparece no detalhe/lista processual.

- [ ] **Step 1: Iniciar o ambiente de teste**

Criar junctions para `node_modules` somente se o worktree não tiver dependências, seguindo o padrão já usado neste repositório; não reinstalar dependências duplicadas. Iniciar o serviço/API e app pelos comandos documentados no repositório e confirmar que a rota do Regularize responde.

- [ ] **Step 2: Executar o smoke browser**

Usar Playwright com seletores acessíveis para:

1. autenticar com a conta de teste;
2. abrir Regularize;
3. acionar “Nova orientação” sem selecionar processo;
4. escolher `SEM_CLIENTE`;
5. confirmar que os 17 itens aparecem;
6. confirmar que campos de filial começam desabilitados;
7. marcar `branch` como `Concluído`, preencher filial e salvar;
8. capturar `output/playwright/regularize-guidance-independent.png`;
9. editar, selecionar processo da mesma organização, salvar e capturar `output/playwright/regularize-guidance-linked.png`.

- [ ] **Step 3: Verificar isolamento e erros visíveis**

Enviar, via teste de API ou UI, um `process_id`/cadastro de outra organização e confirmar `404`/mensagem genérica. Confirmar que conflito de processo retorna `409` e que o formulário permanece aberto com mensagem acionável.

- [ ] **Step 4: Executar validações da área**

Rodar `corepack pnpm --filter @workspace/regularize-service test`, `corepack pnpm --filter @workspace/regularize-service build`, `corepack pnpm --filter @workspace/app test:regularize`, `corepack pnpm --filter @workspace/app typecheck` e `corepack pnpm smoke:coverage`.

- [ ] **Step 5: Commit das evidências**

```bash
git add output/playwright/regularize-guidance-independent.png output/playwright/regularize-guidance-linked.png
git commit -m "test: capture independent regularize guidance flow"
```

### Task 9: Atualizar contexto, revisar diff e preparar integração

**Files:**
- Modify generated Graphify context only if a graph exists.
- Review all files changed by Tasks 1–8; do not add unrelated formatting.

**Interfaces:**
- Produces a clean `codex/issue-1125` branch with spec, implementation, tests and screenshots.

- [ ] **Step 1: Atualizar Graphify quando disponível**

Se `services/graphify-out/graph.json` existir, rodar `corepack pnpm graphify:update:services`; se `app/graphify-out/graph.json` existir, rodar `corepack pnpm graphify:update:ui`. Se não existir, registrar no relatório final que o fallback manual foi usado.

- [ ] **Step 2: Revisar mudanças e call sites**

Rodar `git diff --stat`, `git diff --check`, `git diff`, `rg -n "process_id|checklist_items|target_type|branch_data" services/regularize-service app/src/modules/regularize infra/prisma shared` e verificar que nenhum caller continua descartando `process_id` no update.

- [ ] **Step 3: Executar validação final antes de PR**

Rodar `corepack pnpm --filter @workspace/shared typecheck`, `corepack pnpm --filter @workspace/regularize-service typecheck`, `corepack pnpm --filter @workspace/regularize-service test`, `corepack pnpm --filter @workspace/regularize-service build`, `corepack pnpm --filter @workspace/app test:regularize`, `corepack pnpm --filter @workspace/app typecheck` e `corepack pnpm smoke:coverage`.

- [ ] **Step 4: Commit de correções de revisão**

```bash
git add -u -- shared app infra services/regularize-service pnpm-lock.yaml
git add -f output/playwright/regularize-guidance-independent.png output/playwright/regularize-guidance-linked.png
git commit -m "chore: finalize regularize guidance validation"
```

O staging deve conter apenas arquivos da #1125; não incluir o checkout principal, caches ou `graphify-out`.

- [ ] **Step 5: Entregar para revisão/PR**

Usar a skill `superpowers:requesting-code-review` antes de abrir o PR. O PR deve apontar para `INTEGRATION_BRANCH` (`feature/milestone-21`), referenciar #1125, listar validações, anexar screenshots e registrar qualquer limitação real de ambiente. Depois aguardar review/CI, corrigir feedback, fazer merge na integração e fechar a issue conforme o objetivo do milestone.

## Self-review do plano

- A seção de modelo de dados da especificação está coberta pela Task 1 (contrato), Task 2 (Prisma/migration) e Task 3 (schemas/shape).
- O fluxo transacional, vínculo, conflito, histórico, filial e auditoria está coberto pela Task 4 e seus testes de rollback.
- API, OpenAPI, erros e smoke coverage estão cobertos pela Task 5.
- Tipos, cache, permissões, estados do formulário e integração de tela estão cobertos pelas Tasks 6 e 7.
- Evidências Playwright, validações finais, Graphify/fallback e PR estão cobertos pelas Tasks 8 e 9.
- A busca de placeholders não encontrou `TBD`, `TODO`, “implement later”, “Similar to Task” ou instruções sem arquivos/comandos associados.
- As interfaces usadas entre tarefas são consistentes: `checklist_items`, `target_type`, `branch_data` e `process_id: string | null | undefined` mantêm os mesmos nomes no shared, backend e frontend.
