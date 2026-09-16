# Dossiê do colaborador no RH Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a issue #1134 com dossiê de colaborador, alergias e contatos de emergência protegidos por organização e permissão, com contrato HTTP, gateway, frontend e evidências de validação.

**Architecture:** O `rh-service` será o dono do seam de perfil e continuará persistindo o agregado no modelo `User` compartilhado pelo Prisma. O service receberá identidade e nível RH do request, aplicará predicados de organização/departamento no banco e devolverá uma projeção completa apenas para o colaborador próprio ou RH nível 3, mantendo uma projeção não sensível para nível 2. O gateway liberará escrita de perfil para o módulo RH nível 1, enquanto o service continuará sendo a autoridade final sobre alvo e campos editáveis; o frontend consumirá somente os endpoints do contrato RH já existente.

**Tech Stack:** TypeScript ESM, Express, Prisma/PostgreSQL, Zod, Vitest, shared auth policy, Next/React, React Query, Biome, pnpm, Playwright e manifesto de smoke.

---

## Mapa de arquivos e responsabilidades

- Modificar `infra/prisma/schema.prisma`: adicionar `User.dominio_hire_date`.
- Criar `infra/prisma/migrations/20260916120000_rh_employee_dossier/migration.sql`: adicionar a coluna nullable sem apagar dados existentes.
- Criar `services/rh-service/src/schemas/employeeDossier.schemas.ts`: Zod para query, payload cadastral, alergia e contato.
- Criar `services/rh-service/src/services/employeeDossierService.ts`: autorização, isolamento, projeções, conversão de datas e CRUD JSON.
- Criar `services/rh-service/src/routes/employeeDossier.routes.ts`: autenticação, parse, envelopes e encaminhamento ao handler global.
- Modificar `services/rh-service/src/app.ts`: montar `/rh/profile`.
- Modificar `services/rh-service/src/openapi/spec.ts`: documentar os oito endpoints do contrato.
- Modificar `services/rh-service/src/test/rhTestUtils.ts`: mockar o novo service sem quebrar os testes de rotas existentes.
- Criar `services/rh-service/src/test/employeeDossierService.test.ts`: testar o seam de domínio com Prisma mockado.
- Criar `services/rh-service/src/test/employeeDossier.routes.test.ts`: testar autenticação, níveis, Zod, envelopes e chamadas de service.
- Modificar `services/gateway/src/security/policies.ts`: aplicar a política RH nível 1 às mutações `/rh/profile` antes da política RH geral de edição.
- Modificar `services/gateway/src/audit/activityCatalog.ts`: classificar detalhe, atualização, alergia e contato sem payload sensível.
- Modificar `services/gateway/src/test/authorize.test.ts`, `services/gateway/src/test/modulePermissionRegression.test.ts` e `services/gateway/src/test/activityCatalog.test.ts`: cobrir a exceção de escrita própria e as classificações.
- Modificar `app/src/modules/rh/services/rhService.contract.ts`: endpoints e builders do contrato.
- Criar `app/src/modules/rh/services/rhProfileService.ts`: chamadas HTTP tipadas e unwrap do envelope.
- Modificar `app/src/modules/rh/types.ts`: tipos de lista, dossiê, alergia e contato.
- Criar `app/src/modules/rh/hooks/useRhProfile.ts`: queries/mutations e invalidação de cache.
- Criar `app/src/modules/rh/components/RhDossierSection.tsx`: lista, detalhe, edição autorizada e CRUD de contatos/alergias usando os componentes existentes.
- Modificar `app/src/modules/rh/index.ts`: exportar seção e hooks necessários.
- Modificar `app/src/shared/components/newLayout/RH.tsx`: adicionar aba `Dossiê` sem alterar as tabs existentes.
- Modificar `app/src/modules/rh/run-rh-tests.mjs`: incluir verificações estáticas do contrato, hook e aba.
- Modificar `scripts/all-services-smoke.manifest.mjs`: registrar os endpoints públicos do perfil para cobertura do smoke.
- Criar ou modificar testes de frontend sob `app/src/modules/rh`: verificar paths e payloads sem acoplar testes ao JSX interno.
- Criar `output/playwright/issue-1134-dossier.png` durante a validação visual; manter o artefato local e não versioná-lo se o ignore do projeto assim exigir.

### Task 1: Atualizar o agregado persistido

**Files:**
- Modify: `infra/prisma/schema.prisma`
- Create: `infra/prisma/migrations/20260916120000_rh_employee_dossier/migration.sql`
- Test: `services/rh-service/src/test/employeeDossierService.test.ts`

- [ ] **Step 1: Escrever o teste vermelho para o campo de admissão Domínio**

Adicionar ao fixture de usuário do teste um `dominio_hire_date` ISO e afirmar que o snapshot completo conserva a data como ISO string. O teste deve chamar o service público, não acessar helper privado:

```ts
const result = await service.getDossier(actorContext);

expect(result.dominio_hire_date).toBe("2024-02-01T00:00:00.000Z");
```

- [ ] **Step 2: Rodar somente o teste novo e confirmar a falha**

Executar `pnpm --filter @workspace/rh-service test -- employeeDossierService.test.ts`. Resultado esperado: falha de TypeScript ou de fixture porque `dominio_hire_date` ainda não existe no payload Prisma.

- [ ] **Step 3: Alterar o schema e criar migration aditiva**

Adicionar no `model User`, próximo de `hire_date`:

```prisma
dominio_hire_date DateTime?
```

Criar a migration com somente:

```sql
ALTER TABLE "users" ADD COLUMN "dominio_hire_date" TIMESTAMP(3);
```

Não alterar JSON existente, não renomear `phone` e não recriar a tabela.

- [ ] **Step 4: Regenerar o cliente Prisma e rodar o teste**

Executar `pnpm prisma:generate` e depois `pnpm --filter @workspace/rh-service test -- employeeDossierService.test.ts`. Resultado esperado: o caso do campo Domínio passa; os demais casos ainda podem permanecer vermelhos até as tarefas seguintes.

- [ ] **Step 5: Commitar a unidade persistida**

Executar `git add infra/prisma/schema.prisma infra/prisma/migrations/20260916120000_rh_employee_dossier/migration.sql services/rh-service/src/test/employeeDossierService.test.ts` e `git commit -m "feat(rh): adicionar admissao no dominio ao usuario"`.

### Task 2: Implementar schemas e service de dossiê

**Files:**
- Create: `services/rh-service/src/schemas/employeeDossier.schemas.ts`
- Create: `services/rh-service/src/services/employeeDossierService.ts`
- Test: `services/rh-service/src/test/employeeDossierService.test.ts`

- [ ] **Step 1: Escrever os casos vermelhos de autorização, projeção e JSON**

Cobrir pelo menos estes comportamentos através do método público `EmployeeDossierService`:

```ts
await expect(service.getDossier({ actorUserId: actorId, targetUserId: otherId, organizationId, rhPermission: 1 })).rejects.toMatchObject({ statusCode: 403 });
await expect(service.getDossier({ actorUserId: managerId, targetUserId: otherDepartmentId, organizationId, rhPermission: 2 })).rejects.toMatchObject({ statusCode: 404 });
await expect(service.getDossier({ actorUserId: adminId, targetUserId: sameOrganizationId, organizationId, rhPermission: 3 })).resolves.toMatchObject({ cpf: "123", rg: "RG-1", dominio_hire_date: "2024-02-01T00:00:00.000Z" });
await expect(service.updateDossier({ actorUserId: actorId, targetUserId: actorId, organizationId, rhPermission: 1, changes: { cpf: "novo" } })).rejects.toMatchObject({ statusCode: 403 });
await expect(service.replaceAllergies({ actorUserId: actorId, targetUserId: actorId, organizationId, rhPermission: 1, allergies: [{ name: "poeira", fonts: "ambiental", action: "evitar" }] })).resolves.toHaveLength(1);
await expect(service.replaceAllergies({ actorUserId: actorId, targetUserId: actorId, organizationId, rhPermission: 1, allergies: [{ name: "", fonts: "ambiental", action: "evitar" }] })).rejects.toMatchObject({ statusCode: 400 });
```

Também testar lista sem `cpf`, `rg`, `address`, `hire_date`, `dominio_hire_date`, `termination_date`, `allergies` e `emergency_contacts`, contato de outra organização como 404, contato sem `id` recebido gerado pelo service e ausência de valores removidos em qualquer chamada de log.

- [ ] **Step 2: Rodar os casos novos e confirmar o vermelho**

Executar `pnpm --filter @workspace/rh-service test -- employeeDossierService.test.ts`. Resultado esperado: falha porque os schemas, o service e seus métodos públicos ainda não existem.

- [ ] **Step 3: Definir os schemas Zod fechados**

Implementar `employeeDossier.schemas.ts` com objetos `.strict()` e estes contratos:

```ts
const allergySchema = z.object({ name: nonEmptyText, fonts: nonEmptyText, action: nonEmptyText }).strict();
const contactSchema = z.object({ id: uuid.optional(), name: nonEmptyText, phone: nonEmptyText, reference: nonEmptyText.optional() }).strict();
const dossierUpdateSchema = z.object({ target_user_id: uuid.optional(), full_name: nonEmptyText.optional(), gender: z.string().trim().min(1).nullable().optional(), birth_date: isoDate.nullable().optional(), cpf: z.string().trim().min(1).nullable().optional(), rg: z.string().trim().min(1).nullable().optional(), address: z.string().trim().min(1).nullable().optional(), job_title: z.string().trim().min(1).nullable().optional(), email: z.string().email().nullable().optional(), phone: z.string().trim().min(1).nullable().optional(), hire_date: isoDate.nullable().optional(), dominio_hire_date: isoDate.nullable().optional(), termination_date: isoDate.nullable().optional(), photo_url: z.string().url().nullable().optional(), status: z.string().trim().min(1).optional(), department_id: uuid.nullable().optional() }).strict();
```

Exportar schemas de query para `user_id` e `target_user_id`, schema de contato para `id`, schema de substituição de alergias e schema de atualização parcial de contato; não aceitar `organization_id` em nenhum schema.

- [ ] **Step 4: Implementar o lookup isolado e as projeções**

No `employeeDossierService.ts`, usar `prismaClient.user.findFirst` com o predicado:

```ts
const organizationScope = {
  OR: [
    { organization_id: organizationId },
    { organization_id: null, department: { organization_id: organizationId } },
  ],
};
```

Carregar o ator com `id: actorUserId` e o mesmo scope; para nível 2 acrescentar `department_id: actor.department_id` ao alvo. O método `getDossier` deve devolver todos os campos só para nível 3 ou alvo próprio; caso contrário devolver apenas `id`, `full_name`/`name`, `job_title`, departamento, `photo_url` e `status`. O método `listDossiers` deve sempre devolver a projeção não sensível e ordenar por nome.

- [ ] **Step 5: Implementar autorização de mutação e persistência mínima**

Usar `RH_SELF_SERVICE_PERMISSION = 1` e `RH_MANAGEMENT_PERMISSION = 3`. Para nível 1 permitir somente `address`, `email`, `phone` e dados de alergia pelos métodos próprios; para nível 3 permitir os campos cadastrais definidos no schema, sempre com alvo dentro do scope. Nível 2 não pode mutar. Fazer `prismaClient.user.update` com somente as chaves permitidas, converter strings ISO para `Date`, e devolver o snapshot sanitizado. Nunca incluir o payload em `logError` ou em erro lançado.

- [ ] **Step 6: Implementar alergias e contatos no JSON do User**

Normalizar `allergies` para array validado de `{ name, fonts, action }`; normalizar `emergency_contacts` para `{ id, name, phone, reference? }`, gerando `randomUUID()` somente no backend quando criar. Para update/delete de contato, localizar o `id` dentro do array do alvo já isolado; se não localizar, lançar `ServiceError(404, "Contato de emergência não encontrado.")`. Persistir o array inteiro em uma única atualização e devolver o array já sanitizado.

- [ ] **Step 7: Rodar service tests e revisar cobertura do seam**

Executar `pnpm --filter @workspace/rh-service test -- employeeDossierService.test.ts`. Resultado esperado: PASS para isolamento de organização/departamento, matriz de níveis, projeção, campos permitidos, validação de alergia, CRUD de contato e ausência de payload sensível em logs.

- [ ] **Step 8: Commitar schemas e domínio**

Executar `git add services/rh-service/src/schemas/employeeDossier.schemas.ts services/rh-service/src/services/employeeDossierService.ts services/rh-service/src/test/employeeDossierService.test.ts` e `git commit -m "feat(rh): proteger dossie e contatos por organizacao"`.

### Task 3: Expor rotas RH e OpenAPI

**Files:**
- Create: `services/rh-service/src/routes/employeeDossier.routes.ts`
- Modify: `services/rh-service/src/app.ts`
- Modify: `services/rh-service/src/openapi/spec.ts`
- Modify: `services/rh-service/src/test/rhTestUtils.ts`
- Create: `services/rh-service/src/test/employeeDossier.routes.test.ts`

- [ ] **Step 1: Escrever testes vermelhos de contrato HTTP**

Montar o router com o padrão dos testes RH e testar estes requests: `GET /rh/profile/colaborator`, `GET /rh/profile/colaborator/list`, `PUT /rh/profile/colaborator`, `GET/POST/PUT/DELETE /rh/profile/contact`, `GET/PUT /rh/profile/allergy`. A asserção principal deve ser envelope e chamada tipada:

```ts
expect(response.status).toBe(200);
expect(response.body).toEqual({ success: true, data: expected });
expect(employeeDossierService.getDossier).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: testUserId }));
```

Cobrir 401 sem contexto, 400 para JSON inválido/chave desconhecida, 403 para edição de terceiro por nível 1, 404 para alvo fora da organização e `organization_id` ignorado/rejeitado.

- [ ] **Step 2: Rodar o teste de rotas e confirmar o vermelho**

Executar `pnpm --filter @workspace/rh-service test -- employeeDossier.routes.test.ts`. Resultado esperado: falha porque o router ainda não está montado e o mock do service não existe.

- [ ] **Step 3: Montar os handlers com autenticação e parse**

Criar o router com `isAuthenticated`, `requireAuthenticatedRequestContext`, `parseWithZod`, `createSuccessResponse` e `next(err)`. Usar estes handlers canônicos:

```ts
router.get("/colaborator", isAuthenticated, async (req, res, next) => {
  try {
    const context = requireAuthenticatedRequestContext(req, { statusCode: 400 });
    const query = parseWithZod(dossierTargetQuerySchema, req.query);
    const data = await employeeDossierService.getDossier({ actorUserId: context.user_id, organizationId: context.organization_id, targetUserId: query.user_id ?? context.user_id, rhPermission: getRhPermissionLevel(req) });
    res.status(200).json(createSuccessResponse(data));
  } catch (err) { next(err); }
});
```

Aplicar a mesma forma aos demais endpoints e delegar autorização ao service; o router não aceitará `organization_id` como escopo. `PUT /colaborator` usará body com `target_user_id`; contato usa `id` no body para PUT/DELETE e target próprio por padrão.

- [ ] **Step 4: Montar `/rh/profile` no app e atualizar mocks**

Importar o router em `services/rh-service/src/app.ts` e adicionar `app.use("/rh/profile", employeeDossierRouter)`. Atualizar `rhTestUtils.ts` para mockar `employeeDossierService` com métodos `getDossier`, `listDossiers`, `updateDossier`, `listContacts`, `createContact`, `updateContact`, `deleteContact`, `listAllergies` e `replaceAllergies`, preservando o usuário, organização e nível padrão dos testes existentes.

- [ ] **Step 5: Documentar o contrato no OpenAPI**

Adicionar no `paths` de `services/rh-service/src/openapi/spec.ts` os oito paths públicos, com schemas de request/response equivalentes aos Zod, envelope `{ success: true, data }`, respostas 400/401/403/404 e descrição explícita de que CPF/RG e datas de vínculo só aparecem no dossiê autorizado. Incluir `dominio_hire_date` na resposta completa e não na resposta de lista.

- [ ] **Step 6: Rodar os testes RH direcionados**

Executar `pnpm --filter @workspace/rh-service test -- employeeDossier.routes.test.ts employeeDossierService.test.ts` e `pnpm --filter @workspace/rh-service typecheck`. Resultado esperado: PASS e typecheck sem erros.

- [ ] **Step 7: Commitar API e contrato OpenAPI**

Executar `git add services/rh-service/src/routes/employeeDossier.routes.ts services/rh-service/src/app.ts services/rh-service/src/openapi/spec.ts services/rh-service/src/test/rhTestUtils.ts services/rh-service/src/test/employeeDossier.routes.test.ts` e `git commit -m "feat(rh): publicar endpoints do dossie"`.

### Task 4: Ajustar autorização e auditoria no gateway

**Files:**
- Modify: `services/gateway/src/security/policies.ts`
- Modify: `services/gateway/src/audit/activityCatalog.ts`
- Test: `services/gateway/src/test/authorize.test.ts`
- Test: `services/gateway/src/test/modulePermissionRegression.test.ts`
- Test: `services/gateway/src/test/activityCatalog.test.ts`

- [ ] **Step 1: Escrever os testes vermelhos da política de perfil**

Adicionar aos testes de política as expectativas: GET de qualquer perfil exige RH nível 1; POST/PUT/DELETE sob `/rh/profile` também atravessam o gateway com RH nível 1 para que o service possa aplicar a regra de próprio usuário; mutações RH fora de `/rh/profile` continuam exigindo nível 2; nível 0, usuário sem módulo e usuário de plataforma continuam negados.

```ts
expect(getRoutePolicy("PUT", "/rh/profile/colaborator")).toEqual({ modulePermission: { module: "rh", minPermission: 1 } });
expect(getRoutePolicy("PUT", "/rh/requests")).toEqual({ modulePermission: { module: "rh", minPermission: 2 } });
```

- [ ] **Step 2: Confirmar o vermelho**

Executar `pnpm --filter @workspace/gateway test -- authorize.test.ts modulePermissionRegression.test.ts`. Resultado esperado: o primeiro caso falha porque a política genérica RH nível 2 ainda vence.

- [ ] **Step 3: Inserir matcher específico antes do matcher RH genérico**

Em `policies.ts`, adicionar antes de `GET /^\/rh/` e `ANY /^\/rh/`:

```ts
{ method: "ANY", path: /^\/rh\/profile(?:\/|$)/, policy: rhModulePolicy },
```

Manter o matcher GET RH e o matcher ANY RH existentes para todo o restante. Não adicionar bypass em `authorize.ts`; a identidade e o alvo são verificados no `rh-service`.

- [ ] **Step 4: Classificar ações sem dados protegidos**

Adicionar regras explícitas em `EXPLICIT_RULES` para `GET /rh/profile/colaborator`, `GET /rh/profile/colaborator/list`, `PUT /rh/profile/colaborator`, `GET/PUT /rh/profile/allergy` e `GET/POST/PUT/DELETE /rh/profile/contact`. A descrição deve usar apenas item genérico (`dossiê do colaborador`, `alergias`, `contato de emergência`) e identificador de rota quando houver; não serializar query/body nem valores removidos.

- [ ] **Step 5: Testar autorização e auditoria**

Executar `pnpm --filter @workspace/gateway test -- authorize.test.ts modulePermissionRegression.test.ts activityCatalog.test.ts activityCatalogCoverage.test.ts`. Resultado esperado: PASS e nenhuma regressão em rotas RH existentes.

- [ ] **Step 6: Commitar gateway**

Executar `git add services/gateway/src/security/policies.ts services/gateway/src/audit/activityCatalog.ts services/gateway/src/test/authorize.test.ts services/gateway/src/test/modulePermissionRegression.test.ts services/gateway/src/test/activityCatalog.test.ts` e `git commit -m "feat(gateway): autorizar e auditar perfil rh"`.

### Task 5: Implementar contrato, service client e hooks do frontend

**Files:**
- Modify: `app/src/modules/rh/services/rhService.contract.ts`
- Create: `app/src/modules/rh/services/rhProfileService.ts`
- Modify: `app/src/modules/rh/types.ts`
- Create: `app/src/modules/rh/hooks/useRhProfile.ts`
- Modify: `app/src/modules/rh/index.ts`
- Test: `app/src/modules/rh/run-rh-tests.mjs`

- [ ] **Step 1: Escrever testes vermelhos de paths, payloads e cache**

Adicionar checks para os endpoints e para o service client:

```ts
expect(RH_ENDPOINTS.dossier).toBe("/rh/profile/colaborator");
expect(RH_ENDPOINTS.dossierList).toBe("/rh/profile/colaborator/list");
expect(RH_ENDPOINTS.contact).toBe("/rh/profile/contact");
expect(RH_ENDPOINTS.allergy).toBe("/rh/profile/allergy");
```

Os hooks devem expor query keys distintas para lista, dossiê, contatos e alergias e invalidar apenas as chaves afetadas após cada mutation.

- [ ] **Step 2: Confirmar o vermelho**

Executar `pnpm --filter @workspace/app rh:test` ou, se o package não expuser esse script, `node app/src/modules/rh/run-rh-tests.mjs`. Resultado esperado: falha até os endpoints e source do novo módulo existirem.

- [ ] **Step 3: Adicionar tipos e endpoints**

Em `types.ts`, definir os contratos públicos:

```ts
export interface RhDossierListItem { id: string; full_name: string; job_title: string | null; department: string | null; photo_url: string | null; status: string; }
export interface RhDossier { id: string; full_name: string | null; gender: string | null; birth_date: string | null; cpf: string | null; rg: string | null; address: string | null; job_title: string | null; department: string | null; email: string | null; phone: string | null; hire_date: string | null; dominio_hire_date: string | null; termination_date: string | null; photo_url: string | null; status: string; allergies: RhAllergy[]; emergency_contacts: RhEmergencyContact[]; }
export interface RhAllergy { name: string; fonts: string; action: string; }
export interface RhEmergencyContact { id: string; name: string; phone: string; reference?: string; }
```

Adicionar builders para `user_id`/`target_user_id` e os métodos `getDossier`, `listDossiers`, `updateDossier`, `listContacts`, `createContact`, `updateContact`, `deleteContact`, `listAllergies`, `replaceAllergies` em `rhProfileService.ts`, sempre usando `setupAPIClient()` e `unwrapRhEnvelope`.

- [ ] **Step 4: Implementar hooks com React Query**

Criar `useRhProfile.ts` com `useFetch` para as queries e `useMutation` para mutações, mantendo a assinatura usada pelos hooks RH atuais. O enable da query de dossiê próprio deve depender de `canAccessRhPortal`; a lista deve depender de `canManageRh || permissionLevel === 2`; nenhuma query deve executar para usuário sem acesso.

- [ ] **Step 5: Exportar o módulo e rodar checks do RH**

Exportar service, hooks e tipos necessários em `app/src/modules/rh/index.ts`. Executar `node app/src/modules/rh/run-rh-tests.mjs` e `pnpm --filter @workspace/app typecheck`. Resultado esperado: PASS.

- [ ] **Step 6: Commitar camada de dados do frontend**

Executar `git add app/src/modules/rh/services/rhService.contract.ts app/src/modules/rh/services/rhProfileService.ts app/src/modules/rh/types.ts app/src/modules/rh/hooks/useRhProfile.ts app/src/modules/rh/index.ts app/src/modules/rh/run-rh-tests.mjs` e `git commit -m "feat(app): adicionar contrato do dossie rh"`.

### Task 6: Adicionar a experiência visual da aba Dossiê

**Files:**
- Create: `app/src/modules/rh/components/RhDossierSection.tsx`
- Modify: `app/src/shared/components/newLayout/RH.tsx`
- Modify: `app/src/modules/rh/run-rh-tests.mjs`

- [ ] **Step 1: Escrever checks vermelhos da navegação e estados**

Verificar no source que `RH.tsx` declara a união `"dossier"`, renderiza `RhDossierSection` e usa o rótulo `Dossiê`; verificar que a seção contém loading, erro, vazio e estados de formulário. O check não deve depender de classe CSS ou estrutura interna instável.

- [ ] **Step 2: Confirmar o vermelho**

Executar `node app/src/modules/rh/run-rh-tests.mjs`. Resultado esperado: falha enquanto a tab e a seção não existirem.

- [ ] **Step 3: Implementar a seção com projeção conforme permissão**

Usar os componentes existentes de botão, input, `Dialog` e classes Tailwind já presentes no módulo. Para RH nível 3, renderizar lista de colaboradores e detalhe selecionado; para nível 2, renderizar a lista não sensível sem controles de mutação; para nível 1, abrir diretamente o dossiê próprio com campos `address`, `email`, `phone`, alergias e contatos editáveis. Nunca montar inputs para CPF/RG ou vínculo quando o retorno não contiver permissão.

- [ ] **Step 4: Implementar mutations de contatos e alergias**

Adicionar formulário de contato com `name` e `phone` obrigatórios e `reference` opcional; chamar create/update/delete e invalidar `contact` e `dossier`. Adicionar edição de alergias exigindo `name`, `fonts` e `action` não vazios; chamar replace e invalidar `allergy` e `dossier`. Exibir confirmação antes de exclusão e mensagens de erro sem incluir payload.

- [ ] **Step 5: Integrar a tab sem regressão de tabs existentes**

Em `RH.tsx`, importar `UserRound` e `RhDossierSection`, incluir `"dossier"` no tipo e adicionar `RhTabButton` com label `Dossiê`. Renderizar `<RhDossierSection />` somente quando `activeTab === "dossier"`; preservar contagem de solicitações, dashboard, ponto, avaliações e modal de feriados.

- [ ] **Step 6: Rodar lint/typecheck do app e check estático RH**

Executar `node app/src/modules/rh/run-rh-tests.mjs`, `pnpm --filter @workspace/app typecheck` e `pnpm exec biome check app/src/modules/rh app/src/shared/components/newLayout/RH.tsx`. Resultado esperado: PASS.

- [ ] **Step 7: Commitar UI**

Executar `git add app/src/modules/rh/components/RhDossierSection.tsx app/src/shared/components/newLayout/RH.tsx app/src/modules/rh/run-rh-tests.mjs` e `git commit -m "feat(app): adicionar aba de dossie no rh"`.

### Task 7: Registrar smoke, atualizar grafo e executar validação integrada

**Files:**
- Modify: `scripts/all-services-smoke.manifest.mjs`
- Generated local only: `services/graphify-out/*`, se o grafo puder ser atualizado sem chave
- Create local only: `output/playwright/issue-1134-dossier.png`

- [ ] **Step 1: Registrar todos os endpoints no manifesto**

Adicionar entradas para GET/PUT dossier, GET list, GET/POST/PUT/DELETE contact e GET/PUT allergy, associadas ao serviço `rh-service`, com autenticação, método, path e expectativa de envelope. Não adicionar `organization_id` como query de teste; os fixtures devem usar a organização da sessão.

- [ ] **Step 2: Rodar a cobertura do smoke**

Executar `pnpm smoke:coverage`. Resultado esperado: PASS e nenhum endpoint público do `rh-service` faltando no manifesto.

- [ ] **Step 3: Atualizar o grafo do backend quando disponível**

Executar `pnpm graphify:update:services` e `pnpm graphify:postprocess:services`. Se o grafo continuar inexistente ou a extração falhar por ausência de chave, registrar a mensagem de fallback no relatório da tarefa e validar manualmente com `git diff --stat`, `git diff` e `rg` de call sites.

- [ ] **Step 4: Rodar testes escopados de services e gateway**

Executar `pnpm --filter @workspace/rh-service test`, `pnpm --filter @workspace/gateway test`, `pnpm --filter @workspace/rh-service typecheck`, `pnpm --filter @workspace/gateway typecheck` e `pnpm --filter @workspace/app typecheck`. Resultado esperado: PASS; qualquer falha deve ser corrigida antes de prosseguir.

- [ ] **Step 5: Executar lint, build e checks de segurança relevantes**

Executar `pnpm exec biome check services/rh-service services/gateway app/src/modules/rh app/src/shared/components/newLayout/RH.tsx scripts/all-services-smoke.manifest.mjs`, `pnpm --filter @workspace/rh-service build`, `pnpm --filter @workspace/gateway build`, `pnpm --filter @workspace/app build` e os testes de auditoria/política do gateway. Verificar que logs e audit metadata não contêm valores de CPF, RG, endereço, alergia ou contato.

- [ ] **Step 6: Validar o fluxo no navegador com Playwright**

Subir o ambiente de desenvolvimento conforme os scripts do repo, abrir a tela RH, selecionar `Dossiê`, verificar loading/empty/error e, com fixture autenticado, confirmar que colaborador nível 1 vê e edita apenas os campos permitidos, gestor vê somente projeção e admin vê detalhe completo. Salvar screenshot em `output/playwright/issue-1134-dossier.png` e incluir no material da PR.

- [ ] **Step 7: Fazer revisão de diff antes da PR**

Executar `git status --short`, `git diff --stat develop...HEAD`, `git diff develop...HEAD`, `rg -n "organization_id|cpf|rg|address|allerg|emergency|dominio_hire" services/rh-service/src services/gateway/src app/src/modules/rh` e confirmar que todos os accesses sensíveis estão atrás de lookup de organização/permissão e que não há alteração nos arquivos pré-existentes do checkout original.

- [ ] **Step 8: Commitar manifesto e fechar implementação local**

Executar `git add scripts/all-services-smoke.manifest.mjs` e `git commit -m "test(rh): cobrir smoke do dossie do colaborador"`.

### Task 8: Simplificação, revisão, PR e integração da issue #1134

**Files:**
- Review only: todos os arquivos alterados em `codex/issue-1134`
- PR: branch `codex/issue-1134` para `feature/milestone-22-issues-1134-1135-1136-1137-1138`

- [ ] **Step 1: Executar simplificação com foco em YAGNI**

Revisar cada arquivo novo para remover abstrações que não tenham call site, duplicação de serialização e helpers que não reduzam complexidade. Preservar validação Zod, predicados de organização, autorização por nível e tratamento de erros; não simplificar removendo controles de segurança.

- [ ] **Step 2: Executar revisão Standards/Spec e revisão de segurança**

Usar `code-review` sobre `develop...HEAD` e `review-security` focando em IDOR, vazamento de campos sensíveis, bypass no gateway, logging de payload e isolamento de contatos/alergias. Corrigir todos os achados acionáveis e repetir somente os testes relacionados ao código corrigido.

- [ ] **Step 3: Revalidar com evidência fresca**

Executar novamente os comandos de Task 7 após a última alteração: testes de service/gateway/app, typechecks, builds, `pnpm smoke:coverage`, Biome e o fluxo Playwright. Não afirmar PASS com base em execução anterior; registrar comandos e resultados.

- [ ] **Step 4: Criar PR da issue #1134**

Usar a skill `pull-request-creating` e `gh pr create` de `codex/issue-1134` para `feature/milestone-22-issues-1134-1135-1136-1137-1138`, com título descritivo, resumo em inglês, testes executados, screenshot, referência `Closes #1134` e reviewer configurado conforme a convenção do repositório. Não usar `--no-verify`.

- [ ] **Step 5: Aguardar CI/review e corrigir feedback**

Consultar checks e comentários da PR; corrigir somente problemas relacionados à issue, repetir validações frescas e atualizar a PR. Se houver falha de hook, documentar a causa e executar a validação manual equivalente antes de qualquer exceção.

- [ ] **Step 6: Integrar a issue na branch de milestone**

Depois de CI/review aprovados, fazer merge da PR de `codex/issue-1134` na branch `feature/milestone-22-issues-1134-1135-1136-1137-1138`, verificar que o commit de `develop` e a implementação permanecem íntegros e só então fechar #1134. Não fechar #1135, #1136, #1137 ou #1138 nesta tarefa.

## Revisão do plano

- Cobertura da especificação: modelo/migration cobre admissão Domínio; service cobre isolamento, matriz de níveis, projeções, campos editáveis, alergias e contatos; router/OpenAPI cobre oito paths; gateway cobre escrita própria e auditoria; frontend cobre lista/detalhe/edição e estados; manifesto e Playwright cobrem evidência.
- Placeholder scan: não há `TBD`, `TODO`, “implementar depois” ou tarefas sem arquivo, comando e critério de resultado.
- Consistência de tipos: `RhDossier`, `RhDossierListItem`, `RhAllergy` e `RhEmergencyContact` são usados pelo service client/hooks/UI; o campo persistido e transportado chama-se `dominio_hire_date`; contato usa `id`, `name`, `phone`, `reference`; alergia usa `name`, `fonts`, `action` em todos os layers.
- Limite de escopo: não altera ponto, folha, solicitações, férias, mensagens, avaliações ou as issues posteriores do Milestone #22.
