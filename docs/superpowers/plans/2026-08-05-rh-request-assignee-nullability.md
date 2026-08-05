# RH Request Assignee Nullability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinhar `rh.requests.assigned_to_user_id` ao comportamento legado, permitindo solicitações sem responsável no Prisma, no serviço RH e no mapeamento V4, sem escrever no banco remoto.

**Architecture:** A ausência de responsável será representada por SQL `NULL` de ponta a ponta. Uma migration versionada fará novos bancos convergirem ao estado já existente no Supabase, o serviço deixará de fabricar atribuição automática e a V4 converterá o sentinela legado `0` em ausência, mantendo referências não nulas inválidas em quarentena.

**Tech Stack:** PostgreSQL, Prisma 7.4.1, TypeScript 5.3.3, Vitest 4.1.9, Node.js `node:test`, scripts ESM da migration V4.

## Global Constraints

- Tenant fixo: Castelo Contabilidade, `e8048d1c-0830-45d7-84de-68e20abd685b`.
- Não executar `prisma migrate`, DDL, DML, limpeza, backfill ou carga no banco remoto.
- O preflight real deve permanecer em `BEGIN TRANSACTION READ ONLY` e registrar `writesPerformed=false`.
- Não criar tabelas nem serviços; a única alteração física versionada é remover `NOT NULL` da coluna existente.
- `atribuido` igual a `0`, vazio ou ausente significa sem responsável e mapeia para `NULL`.
- Referência legada não nula inválida, ambígua ou não resolvida continua em quarentena.
- Não fabricar usuários nem escolher automaticamente um responsável elegível.
- O corpo HTTP continua aceitando responsável explícito ou omissão; esta mudança não cria operação explícita de desatribuição por `null`.
- Todo artefato V4 deve permanecer sanitizado, determinístico e sem dumps, segredos ou valores pessoais brutos.

---

## File Structure

- `infra/prisma/schema.prisma`: torna a chave estrangeira do responsável opcional no contrato Prisma.
- `infra/prisma/migrations/20260805144655_allow_unassigned_rh_request_assignee/migration.sql`: faz o histórico de migrations convergir para a nulabilidade já observada no banco.
- `scripts/rh-request-assignee-nullability.test.mjs`: protege o contrato textual entre schema e migration sem conectar ao banco.
- `services/rh-service/src/services/requestService.ts`: persiste `NULL` quando não há responsável e permite atualizar solicitações não atribuídas.
- `services/rh-service/src/services/messageService.ts`: tipa corretamente o responsável como `string | null` sem ampliar autorização.
- `services/rh-service/src/test/requestService.test.ts`: cobre criação e atualização sem responsável.
- `services/rh-service/src/test/messageService.test.ts`: cobre autorização de mensagens quando o responsável é nulo.
- `docs/migration/v4/scripts/rules/rh-pessoal.mjs`: classifica o sentinela `0` como ausência válida e preserva quarentena para referências não nulas inválidas.
- `docs/migration/v4/scripts/evidence/rh-pessoal.mjs`: registra a criação legada com `0` e a atribuição posterior por `assumirRH`.
- `docs/migration/v4/scripts/test/rules-rh-pessoal.test.mjs`: protege as decisões do mapeamento de responsável.
- `docs/migration/v4/scripts/test/evidence-rh-pessoal.test.mjs`: protege a evidência semântica do fluxo legado.
- `docs/migration/v4/scripts/test/preflight-engine.test.mjs`: prova que catálogos Prisma/PostgreSQL igualmente anuláveis não geram os dois blockers.
- `docs/migration/v4/{mapping,pending-mapping,preflight,quarantine,reports}` e `manifest.json`: artefatos regenerados; não editar dados gerados seletivamente, exceto o manifesto após recalcular todos os hashes.

---

### Task 1: Contrato Prisma e migration versionada

**Files:**
- Create: `scripts/rh-request-assignee-nullability.test.mjs`
- Modify: `infra/prisma/schema.prisma:1839-1853`
- Create: `infra/prisma/migrations/20260805144655_allow_unassigned_rh_request_assignee/migration.sql`

**Interfaces:**
- Consumes: tabela física existente `public."rh.requests"` e FK existente para `users(id)`.
- Produces: `RhRequest.assigned_to_user_id: string | null` nos clientes Prisma gerados e uma migration exclusivamente DDL para `DROP NOT NULL`.

- [ ] **Step 1: Escrever o teste de contrato que falha no schema e pela migration ausente**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../infra/prisma/schema.prisma", import.meta.url), "utf8");
const migration = await readFile(
  new URL(
    "../infra/prisma/migrations/20260805144655_allow_unassigned_rh_request_assignee/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

test("RhRequest permite responsável ausente no campo escalar e na relação", () => {
  const model = schema.match(/model RhRequest \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(model, /assigned_to_user_id\s+String\?/);
  assert.match(model, /assigned_to\s+User\?\s+@relation/);
});

test("migration remove somente NOT NULL de assigned_to_user_id", () => {
  assert.equal(
    migration.trim(),
    [
      'ALTER TABLE "rh.requests"',
      'ALTER COLUMN "assigned_to_user_id" DROP NOT NULL;',
    ].join("\n"),
  );
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP TABLE|CREATE TABLE)\b/i);
});
```

- [ ] **Step 2: Executar o teste para confirmar o estado vermelho**

Run: `node --test scripts/rh-request-assignee-nullability.test.mjs`

Expected: FAIL porque a migration ainda não existe; depois que o arquivo de teste puder carregar, a asserção `String?` também deve falhar contra o schema atual.

- [ ] **Step 3: Tornar o campo escalar opcional no Prisma**

```prisma
assigned_to_user_id String?
assigned_to         User?   @relation("RequestAssignee", fields: [assigned_to_user_id], references: [id])
```

Manter a relação opcional e todas as demais colunas, índices e nomes físicos inalterados.

- [ ] **Step 4: Criar a migration mínima, sem DML**

```sql
ALTER TABLE "rh.requests"
ALTER COLUMN "assigned_to_user_id" DROP NOT NULL;
```

- [ ] **Step 5: Validar o contrato e a sintaxe Prisma**

Run: `node --test scripts/rh-request-assignee-nullability.test.mjs`

Expected: PASS em 2 testes.

Run: `pnpm --dir infra exec prisma validate`

Expected: `The schema at prisma/schema.prisma is valid` e nenhuma conexão ou escrita no banco.

- [ ] **Step 6: Revisar e commitar somente schema, migration e teste**

Run: `git diff --check && git diff -- infra/prisma/schema.prisma infra/prisma/migrations/20260805144655_allow_unassigned_rh_request_assignee/migration.sql scripts/rh-request-assignee-nullability.test.mjs`

Expected: apenas a mudança de nulabilidade, o `DROP NOT NULL` e os dois testes de contrato.

```bash
git add infra/prisma/schema.prisma infra/prisma/migrations/20260805144655_allow_unassigned_rh_request_assignee/migration.sql scripts/rh-request-assignee-nullability.test.mjs
git commit -m "fix(rh): allow requests without assignee"
```

---

### Task 2: Comportamento do serviço RH sem autoatribuição

**Files:**
- Modify: `services/rh-service/src/test/requestService.test.ts:1-118`
- Modify: `services/rh-service/src/test/messageService.test.ts:1-99`
- Modify: `services/rh-service/src/services/requestService.ts:27-233`
- Modify: `services/rh-service/src/services/messageService.ts:41-50`
- Verify: `services/rh-service/src/openapi/spec.ts:131-168`
- Verify: `services/rh-service/src/schemas/request.schemas.ts:5-39`

**Interfaces:**
- Consumes: `RhRequest.assigned_to_user_id: string | null` produzido pela Task 1.
- Produces: criação com `assigned_to_user_id: null`, atualização segura com responsável ausente e autorização que aceita `{ requester_user_id: string; assigned_to_user_id: string | null }`.

- [ ] **Step 1: Substituir o teste de autoatribuição por criação explicitamente não atribuída**

```ts
it("create persiste responsável nulo quando payload não informa responsável", async () => {
  prismaMock.rhCategory.findFirst.mockResolvedValue({ id: "cat-1" });
  prismaMock.rhRequest.create.mockResolvedValue({
    id: "req-1",
    assigned_to_user_id: null,
  });
  const service = new RequestService();

  const result = await service.create({
    organization_id: "org-1",
    requester_user_id: "user-1",
    title: "Solicitação",
    description: "Descrição",
    category_id: "cat-1",
    urgency: "High",
  });

  expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  expect(prismaMock.rhRequest.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ assigned_to_user_id: null }),
    }),
  );
  expect(result).toMatchObject({ assigned_to_user_id: null });
});
```

- [ ] **Step 2: Adicionar o teste de atualização de solicitação não atribuída**

```ts
it("update altera outros campos quando a solicitação permanece sem responsável", async () => {
  prismaMock.rhRequest.findFirst.mockResolvedValue({
    id: "req-1",
    requester_user_id: "user-1",
    assigned_to_user_id: null,
  });
  prismaMock.rhRequest.update.mockResolvedValue({
    id: "req-1",
    status: "In_Progress",
    assigned_to_user_id: null,
  });
  const service = new RequestService();

  await expect(
    service.update({ id: "req-1", organization_id: "org-1", status: "In_Progress" }),
  ).resolves.toMatchObject({ assigned_to_user_id: null });
  expect(prismaMock.rhRequest.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: { status: "In_Progress" } }),
  );
});
```

- [ ] **Step 3: Adicionar regressões de autorização para chamado sem responsável**

```ts
it("listByRequest permite ao solicitante acessar chamado sem responsável", async () => {
  const messages = [{ id: "msg-1" }];
  prismaMock.rhRequest.findFirst.mockResolvedValue({
    id: "req-1",
    requester_user_id: "user-1",
    assigned_to_user_id: null,
  });
  prismaMock.rhMessage.findMany.mockResolvedValue(messages);
  const service = new MessageService();

  await expect(
    service.listByRequest({ organization_id: "org-1", user_id: "user-1", request_id: "req-1" }),
  ).resolves.toBe(messages);
});

it("listByRequest nega terceiro em chamado sem responsável", async () => {
  prismaMock.rhRequest.findFirst.mockResolvedValue({
    id: "req-1",
    requester_user_id: "user-2",
    assigned_to_user_id: null,
  });
  const service = new MessageService();

  await expect(
    service.listByRequest({ organization_id: "org-1", user_id: "user-1", request_id: "req-1" }),
  ).rejects.toMatchObject({ statusCode: 403 });
});
```

- [ ] **Step 4: Executar os testes e o typecheck para confirmar o estado vermelho**

Run: `pnpm --filter @workspace/rh-service exec vitest run src/test/requestService.test.ts src/test/messageService.test.ts`

Expected: os testes novos de criação e atualização falham contra a autoatribuição/asserção atuais.

Run: `pnpm --filter @workspace/rh-service typecheck`

Expected: FAIL no contrato de `assertUserCanAccessRequest`, porque o Prisma regenerado entrega `assigned_to_user_id: string | null` e o helper ainda exige `string`.

- [ ] **Step 5: Remover a busca automática e persistir ausência explícita**

Remover `RH_OPERATION_PERMISSION` e `findEligibleRhAssignee`. Normalizar apenas valor explícito e validar somente quando presente:

```ts
const assignedToUserId =
  input.assigned_to_user_id !== undefined
    ? assertNonEmptyString(input.assigned_to_user_id, "assigned_to_user_id")
    : null;

await this.requireCategoryInOrg(organizationId, categoryId);
if (assignedToUserId !== null) {
  this.ensureAssigneeIsNotRequester(requesterUserId, assignedToUserId);
}
```

Manter no `data` do `rhRequest.create`:

```ts
assigned_to_user_id: assignedToUserId,
```

- [ ] **Step 6: Permitir atualização sem responsável sem criar operação de desatribuição**

```ts
const assigneeAfterUpdate = data.assigned_to_user_id ?? existing.assigned_to_user_id;
if (assigneeAfterUpdate !== null) {
  this.ensureAssigneeIsNotRequester(existing.requester_user_id, assigneeAfterUpdate);
}
```

Manter `RequestUpdateInput.assigned_to_user_id?: string` e `data.assigned_to_user_id?: string`: omissão preserva o valor atual, e `null` não passa a ser aceito pela API.

- [ ] **Step 7: Ajustar somente o tipo do helper de autorização de mensagens**

```ts
function assertUserCanAccessRequest(
  request: { requester_user_id: string; assigned_to_user_id: string | null },
  userId: string,
  canManageRh = false,
): void {
```

Não alterar a condição de acesso; `null !== userId` mantém terceiros bloqueados.

- [ ] **Step 8: Executar testes focados, rotas e typecheck no estado verde**

Run: `pnpm --filter @workspace/rh-service exec vitest run src/test/requestService.test.ts src/test/messageService.test.ts src/test/request.routes.test.ts`

Expected: PASS; o teste de rota continua provando que o responsável é opcional no corpo e só é encaminhado explicitamente por usuário autorizado.

Run: `pnpm --filter @workspace/rh-service typecheck`

Expected: PASS após regenerar os clientes Prisma locais; nenhum diretório gerado deve ser adicionado ao Git.

- [ ] **Step 9: Confirmar que o contrato HTTP continua opcional sem aceitar desatribuição por null**

Run:

```bash
rg -n 'assigned_to_user_id|required: \["title", "description", "category_id", "urgency"\]|required: \["id"\]' services/rh-service/src/openapi/spec.ts services/rh-service/src/schemas/request.schemas.ts
```

Expected: `assigned_to_user_id` permanece propriedade opcional nos corpos de create/update, não aparece nas listas `required`, e o schema Zod aceita apenas string não vazia quando o campo é fornecido. O OpenAPI usa envelope genérico nas respostas e não contém um schema de resposta RH que declare o campo como não nulo.

- [ ] **Step 10: Revisar e commitar o comportamento do serviço**

Run: `git diff --check && git diff -- services/rh-service/src/services/requestService.ts services/rh-service/src/services/messageService.ts services/rh-service/src/test/requestService.test.ts services/rh-service/src/test/messageService.test.ts`

Expected: ausência de autoatribuição, proteção solicitante/responsável preservada e nenhum relaxamento de autorização.

```bash
git add services/rh-service/src/services/requestService.ts services/rh-service/src/services/messageService.ts services/rh-service/src/test/requestService.test.ts services/rh-service/src/test/messageService.test.ts
git commit -m "fix(rh): preserve unassigned requests"
```

---

### Task 3: Mapeamento V4 do sentinela legado para NULL

**Files:**
- Modify: `docs/migration/v4/scripts/test/rules-rh-pessoal.test.mjs:150-260`
- Modify: `docs/migration/v4/scripts/test/evidence-rh-pessoal.test.mjs:80-125`
- Modify: `docs/migration/v4/scripts/rules/rh-pessoal.mjs:642-752,1014-1055`
- Modify: `docs/migration/v4/scripts/evidence/rh-pessoal.mjs:578-601`

**Interfaces:**
- Consumes: `tb_rh.solicitacoes.atribuido` e os estados de resolução `assigneeResolution`/`assigneeUserId` para valores não nulos.
- Produces: metadado `resolve_optional_collaborator_rh_assignee`, política `zero_empty_or_missing_to_null` e classificação `prepared` para ausência legada.

- [ ] **Step 1: Reescrever o teste da coluna atribuída para o contrato anulável**

```js
test("solicitação converte responsável legado ausente em null e quarentena referências inválidas", () => {
  const mappingRule = rule("tb_rh.solicitacoes");
  const destination = step(mappingRule, "rh-request-insert");
  const assignee = destination.columns.find(({ sourceColumn }) => sourceColumn === "atribuido");
  const base = {
    id: 17,
    titulo: "Solicitação válida",
    descricao: "Descrição válida",
    requerente: 145,
    categoria: 3,
  };
  const required = {
    requesterResolution: "one",
    requesterUserId: "user-requester",
    categoryResolution: "one",
  };

  assert.equal(assignee.destinationColumn, "assigned_to_user_id");
  assert.equal(assignee.transformation, "resolve_optional_collaborator_rh_assignee");
  assert.equal(assignee.nullHandling, "zero_empty_or_missing_to_null");
  assert.doesNotMatch(JSON.stringify(destination), /eligible_rh_assignee/i);

  for (const atribuido of [0, "0", "", null, undefined]) {
    assert.equal(mappingRule.emitRows({ ...base, atribuido }, required)[0].status, "prepared");
  }

  for (const assigneeResolution of ["zero", "many", "not_executed"]) {
    const [emission] = mappingRule.emitRows(
      { ...base, atribuido: 44 },
      { ...required, assigneeResolution, assigneeUserId: "user-assignee" },
    );
    assert.equal(emission.status, "quarantine", assigneeResolution);
    assert.match(emission.reasonCode, /^ASSIGNEE_REFERENCE_/, assigneeResolution);
  }
});
```

Preservar no mesmo bloco os casos já existentes de assignee explícito preparado, ID inválido e `ASSIGNEE_EQUALS_REQUESTER`.

- [ ] **Step 2: Adicionar uma asserção de evidência para criação com sentinela e atribuição posterior**

```js
test("evidência de solicitações RH registra sentinela zero e atribuição posterior", () => {
  const decision = RH_PESSOAL_EVIDENCE.find(
    ({ sourceTable }) => sourceTable === "tb_rh.solicitacoes",
  );

  assert.ok(decision);
  assert.ok(decision.legacyReferences.includes("classes/Solicitacao.php:162"));
  assert.ok(decision.legacyReferences.includes("classes/Solicitacao.php:244"));
  assert.match(decision.reason, /0.*sem responsável|sem responsável.*0/i);
  assert.match(decision.reason, /assumirRH|atribuição posterior/i);
});
```

- [ ] **Step 3: Executar os testes V4 focados para confirmar o estado vermelho**

Run: `node --test docs/migration/v4/scripts/test/rules-rh-pessoal.test.mjs docs/migration/v4/scripts/test/evidence-rh-pessoal.test.mjs`

Expected: FAIL nas transformações/política antigas e na evidência que ainda descreve assignee obrigatório.

- [ ] **Step 4: Tratar ausência antes da resolução explícita, sem candidato elegível**

No `createRhRequestRule`, substituir o ramo de ausência por:

```js
if (isMissingLegacyReference(row?.atribuido)) {
  return prepared();
}
```

Remover `classifyEligibleRhAssigneeCandidates` e `isEligibleRhAssigneeCandidate`, pois nenhuma regra restante pode selecionar usuário automaticamente. Manter `ORGANIZATION_ID`, pois ele continua sendo a constante de tenant do destino.

- [ ] **Step 5: Atualizar metadados da coluna e precedência**

```js
mapped("atribuido", "assigned_to_user_id", "resolve_optional_collaborator_rh_assignee", {
  ...referenceOptions(),
  nullHandling: "zero_empty_or_missing_to_null",
  reason:
    "atribuido referencia tb_rh.colaboradores quando não zero; 0, vazio ou ausência representam solicitação ainda sem responsável e mapeiam para NULL.",
}),
```

```js
precedence: ["legacy_identity", "explicit_assignee_user", "unassigned_null"],
```

- [ ] **Step 6: Corrigir a evidência semântica com linhas reais do legado**

Usar as referências:

```js
legacyReferences: [
  "classes/Solicitacao.php:161",
  "classes/Solicitacao.php:162",
  "classes/Solicitacao.php:243",
  "classes/Solicitacao.php:244",
  "classes/Solicitacao.php:246",
  "rh/pages/solicitacoes/solicitacao.php:4",
],
```

E a razão:

```js
reason:
  "Solicitações possuem contrato atual; atribuido = 0 representa ausência de responsável na criação legada e assumirRH registra a atribuição posterior. Valores não zero resolvem o User pelo vínculo de colaborador.",
```

Atualizar `currentContractEvidence` apenas para linhas reais após as alterações; manter referências somente a `infra/prisma` e `services`.

- [ ] **Step 7: Executar testes focados e validação do catálogo**

Run: `node --test docs/migration/v4/scripts/test/rules-rh-pessoal.test.mjs docs/migration/v4/scripts/test/evidence-rh-pessoal.test.mjs docs/migration/v4/scripts/test/prisma-catalog.test.mjs`

Expected: PASS; `tb_rh.solicitacoes` continua uma origem confirmed, sem destino ou serviço novo.

- [ ] **Step 8: Revisar e commitar regra, evidência e testes**

Run: `git diff --check && git diff -- docs/migration/v4/scripts/rules/rh-pessoal.mjs docs/migration/v4/scripts/evidence/rh-pessoal.mjs docs/migration/v4/scripts/test/rules-rh-pessoal.test.mjs docs/migration/v4/scripts/test/evidence-rh-pessoal.test.mjs`

Expected: nenhum fallback para usuário elegível e quarentena intacta para referências não nulas problemáticas.

```bash
git add docs/migration/v4/scripts/rules/rh-pessoal.mjs docs/migration/v4/scripts/evidence/rh-pessoal.mjs docs/migration/v4/scripts/test/rules-rh-pessoal.test.mjs docs/migration/v4/scripts/test/evidence-rh-pessoal.test.mjs
git commit -m "fix(migration-v4): preserve unassigned RH requests"
```

---

### Task 4: Regressão específica do preflight de nulabilidade

**Files:**
- Modify: `docs/migration/v4/scripts/test/preflight-engine.test.mjs:1-190`

**Interfaces:**
- Consumes: catálogo Prisma e catálogo PostgreSQL simulados pelo teste.
- Produces: prova de que uma coluna usada pelo mapping, anulável nos dois catálogos, não gera `DESTINATION_NULLABILITY_MISMATCH` nem `PRISMA_DATABASE_DRIFT`.

- [ ] **Step 1: Adicionar o cenário de catálogos anuláveis equivalentes**

```js
test("runPreflight aceita coluna usada anulável quando Prisma e banco concordam", async () => {
  const prismaCatalog = createPrismaCatalog();
  const ownerField = prismaCatalog.models[0].fields.find(
    ({ databaseName }) => databaseName === "owner_id",
  );
  ownerField.nullable = true;

  const catalogRows = createCatalogRows();
  const ownerColumn = catalogRows.find(
    ({ table_name, column_name }) => table_name === "projects" && column_name === "owner_id",
  );
  ownerColumn.is_nullable = "YES";

  const report = await runPreflight({
    client: createCatalogClient({ catalogRows }),
    mappingPackage: createMappingPackage(),
    prismaCatalog,
    organizationId: ORGANIZATION_ID,
    requiredSecretNames: [],
  });
  const codes = new Set(report.blockers.map(({ reasonCode }) => reasonCode));

  assert.equal(codes.has("DESTINATION_NULLABILITY_MISMATCH"), false);
  assert.equal(codes.has("PRISMA_DATABASE_DRIFT"), false);
  assert.equal(report.readyForMigration, true);
  assert.equal(report.transactionMode, "READ ONLY");
  assert.equal(report.writesPerformed, false);
});
```

- [ ] **Step 2: Executar a regressão e a suíte do preflight**

Run: `node --test docs/migration/v4/scripts/test/preflight-engine.test.mjs`

Expected: PASS sem alteração no motor; se falhar, diagnosticar o motor antes de qualquer mudança e não suprimir códigos de blocker.

- [ ] **Step 3: Commitar somente a regressão**

```bash
git add docs/migration/v4/scripts/test/preflight-engine.test.mjs
git commit -m "test(migration-v4): cover nullable destination parity"
```

---

### Task 5: Regenerar o pacote V4 e executar preflight real somente leitura

**Files:**
- Regenerate: `docs/migration/v4/mapping/*`
- Regenerate: `docs/migration/v4/pending-mapping/*`
- Regenerate: `docs/migration/v4/preflight/*`
- Regenerate: `docs/migration/v4/quarantine/*`
- Regenerate: `docs/migration/v4/reports/legacy-behavior-analysis.json`
- Regenerate: `docs/migration/v4/reports/legacy-behavior-analysis.md`
- Regenerate: `docs/migration/v4/reports/previous-mapping-comparison.json`
- Regenerate: `docs/migration/v4/reports/semantic-decisions.json`
- Regenerate: `docs/migration/v4/reports/source-inventory.json`
- Regenerate: `docs/migration/v4/reports/supabase-preflight.json`
- Modify: `docs/migration/v4/manifest.json`

**Interfaces:**
- Consumes: backup imutável `/home/bruno/Documents/03.08.2026`, legado `/home/bruno/Documents/workspace2`, schema Prisma corrigido e banco real via conexão somente leitura.
- Produces: pacote V4 autoconsistente, hashes SHA-256 atualizados e relatório real sem os dois blockers de `assigned_to_user_id`.

- [ ] **Step 1: Regenerar a análise semântica do legado**

Run:

```bash
node docs/migration/v4/scripts/analyze-legacy.mjs --legacy-source /home/bruno/Documents/workspace2 --source /home/bruno/Documents/03.08.2026 --prisma infra/prisma/schema.prisma --out-json docs/migration/v4/reports/legacy-behavior-analysis.json --out-md docs/migration/v4/reports/legacy-behavior-analysis.md --expected-tables 312
```

Expected: exit 0, exatamente 312 origens e nenhuma escrita em banco.

- [ ] **Step 2: Regenerar mapping, pending, quarantine e comparação histórica atomicamente**

Run:

```bash
node docs/migration/v4/scripts/build-mapping.mjs --source /home/bruno/Documents/03.08.2026 --legacy-source /home/bruno/Documents/workspace2 --package docs/migration/v4 --prisma infra/prisma/schema.prisma --expected-tables 312 --previous-source /home/bruno/Documents/06.07.2026 --previous-source /home/bruno/Documents/10.07.2026 --previous-docs docs/migration
```

Expected: exit 0; 312 origens classificadas; a coluna `assigned_to_user_id` usa a nova transformação/política; nenhum dump é copiado.

- [ ] **Step 3: Executar o preflight real com os arquivos de ambiente locais sem exibir valores**

Run:

```bash
node --env-file=/home/bruno/Documents/Projects/giro-office/services/certificate-service/.env --env-file=/home/bruno/Documents/Projects/giro-office/services/pessoal-service/.env --env-file=/home/bruno/Documents/Projects/giro-office/infra/.env docs/migration/v4/scripts/preflight.mjs --package docs/migration/v4 --prisma infra/prisma/schema.prisma --organization-id e8048d1c-0830-45d7-84de-68e20abd685b
```

Expected: exit 0 com `readyForMigration=false` enquanto houver outros blockers; o relatório deve registrar `transactionMode="READ ONLY"` e `writesPerformed=false`.

- [ ] **Step 4: Confirmar a remoção causal dos dois blockers**

Run:

```bash
rg -n 'DESTINATION_NULLABILITY_MISMATCH|PRISMA_DATABASE_DRIFT' docs/migration/v4/reports/supabase-preflight.json docs/migration/v4/preflight
```

Expected: nenhuma ocorrência relacionada a `rh.requests.assigned_to_user_id`. Se esses códigos existirem para outro campo, registrar separadamente e não removê-los.

Run:

```bash
node --input-type=module -e 'import { readFile } from "node:fs/promises"; const report=JSON.parse(await readFile("docs/migration/v4/reports/supabase-preflight.json","utf8")); const target=report.blockers.filter((item)=>item.destinationTable==="rh.requests"&&item.field==="assigned_to_user_id"); console.log(JSON.stringify({blockers:report.blockers.length,target,transactionMode:report.transactionMode,writesPerformed:report.writesPerformed}))'
```

Expected: `target=[]`, `blockers=382` se nenhum estado externo tiver mudado desde o diagnóstico, `transactionMode="READ ONLY"` e `writesPerformed=false`. Qualquer contagem diferente exige comparar os reason codes antes de continuar; não ajustar o relatório manualmente.

- [ ] **Step 5: Recalcular métricas e todos os hashes do manifesto**

Run:

```bash
sha256sum docs/migration/v4/.gitattributes docs/migration/v4/README.md docs/migration/v4/mapping/columns.csv docs/migration/v4/mapping/columns.json docs/migration/v4/mapping/destinations.csv docs/migration/v4/mapping/destinations.json docs/migration/v4/mapping/tables.csv docs/migration/v4/mapping/tables.json docs/migration/v4/pending-mapping/tables.csv docs/migration/v4/pending-mapping/tables.json docs/migration/v4/preflight/blocked.csv docs/migration/v4/preflight/summary.json docs/migration/v4/quarantine/reasons.csv docs/migration/v4/quarantine/summary.json docs/migration/v4/reports/legacy-behavior-analysis.json docs/migration/v4/reports/legacy-behavior-analysis.md docs/migration/v4/reports/previous-mapping-comparison.json docs/migration/v4/reports/semantic-decisions.json docs/migration/v4/reports/source-inventory.json docs/migration/v4/reports/supabase-preflight.json
```

Atualizar `manifest.json` com `apply_patch`: copiar cada digest exatamente para a chave relativa correspondente; copiar as contagens dos JSONs regenerados; manter `packageVersion=4`, `mode="dry-run"`, o tenant Castelo, `preflightExecuted=true`, `readyForMigration` igual ao relatório e `writesPerformed=false`. Não alterar o manifesto com redirecionamento shell.

- [ ] **Step 6: Validar integridade, conteúdo e hashes do pacote**

Run: `node --test docs/migration/v4/scripts/test/package-acceptance.test.mjs`

Expected: PASS, incluindo todos os hashes do manifesto.

Run: `node --test docs/migration/v4/scripts/test/*.test.mjs`

Expected: PASS em toda a suíte V4.

Run: `find docs/migration/v4/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check`

Expected: exit 0 para todos os módulos.

- [ ] **Step 7: Auditar que não houve escrita ou vazamento**

Run:

```bash
rg -n --glob '!scripts/test/**' '\b(INSERT|UPDATE|DELETE|TRUNCATE|MERGE|COPY|CREATE TABLE|DROP TABLE|prisma migrate)\b' docs/migration/v4
```

Expected: nenhuma operação executável; ocorrências documentais devem ser revisadas como texto, e o novo `ALTER TABLE` deve existir somente na migration Prisma fora de `docs/migration/v4`.

Run: `git status --short && git diff --check && git diff --stat`

Expected: somente artefatos V4 esperados além dos commits anteriores; nenhum `.env`, dump SQL, cliente Prisma gerado ou valor sensível.

- [ ] **Step 8: Commitar os artefatos regenerados**

```bash
git add docs/migration/v4
git commit -m "docs(migration-v4): refresh RH assignee mapping"
```

---

### Task 6: Verificação final e atualização da PR draft

**Files:**
- Verify: todos os arquivos alterados desde `77e578d7c01893f5eea7c97f6d8c3b5890b2de1f`
- Update remote branch: `feat/migration-v4-full-mapping`
- Verify PR: `#732`, ainda draft, título e descrição em inglês.

**Interfaces:**
- Consumes: os quatro commits funcionais das Tasks 1–5 e a especificação `296e4305`.
- Produces: branch remota validada e PR draft atualizada sem executar migration no Supabase.

- [ ] **Step 1: Executar todas as verificações locais frescas**

Run:

```bash
node --test scripts/rh-request-assignee-nullability.test.mjs
pnpm --filter @workspace/rh-service exec vitest run src/test/requestService.test.ts src/test/messageService.test.ts src/test/request.routes.test.ts
pnpm --filter @workspace/rh-service typecheck
pnpm --dir infra exec prisma validate
node --test docs/migration/v4/scripts/test/*.test.mjs
find docs/migration/v4/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
```

Expected: todos os comandos com exit 0; o typecheck regenera somente artefatos ignorados.

- [ ] **Step 2: Verificar invariantes do preflight e pacote final**

Run:

```bash
node --test docs/migration/v4/scripts/test/package-acceptance.test.mjs
rg -n '"transactionMode": "READ ONLY"|"writesPerformed": false|"readyForMigration": false' docs/migration/v4/reports/supabase-preflight.json docs/migration/v4/manifest.json
```

Expected: package acceptance PASS, leitura comprovada, nenhuma escrita e migração ainda bloqueada pelos itens restantes.

- [ ] **Step 3: Revisar o diff integral e procurar resíduos do comportamento removido**

Run:

```bash
git diff 77e578d7c01893f5eea7c97f6d8c3b5890b2de1f...HEAD --check
git diff --stat 77e578d7c01893f5eea7c97f6d8c3b5890b2de1f...HEAD
rg -n 'findEligibleRhAssignee|RH_OPERATION_PERMISSION|required_lookup_never_null|single_eligible_rh_assignee|eligibleAssigneeCandidates' services/rh-service docs/migration/v4/scripts
```

Expected: diff sem erros; a busca por resíduos não retorna ocorrências no fluxo de solicitações RH.

- [ ] **Step 4: Confirmar que o worktree está limpo e publicar a branch**

Run: `git status --short`

Expected: saída vazia.

Run: `git push origin feat/migration-v4-full-mapping`

Expected: push aceito sem force.

- [ ] **Step 5: Confirmar a PR sem tirá-la de draft**

Run: `gh pr view 732 --json number,title,body,isDraft,headRefName,baseRefName,url`

Expected: `isDraft=true`, head `feat/migration-v4-full-mapping`, base `develop`, título e descrição em inglês.

- [ ] **Step 6: Registrar o resultado para o usuário**

Informar os testes executados, os commits, a redução exata de blockers observada no preflight, `READ ONLY`, `writesPerformed=false`, a permanência da PR em draft e que nenhuma migration foi aplicada ao banco.
