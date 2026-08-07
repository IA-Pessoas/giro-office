# Owner Permission Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o `404` no salvamento de permissões alinhando o cliente ao contrato `PUT /user/:id` e protegendo essa rota no gateway.

**Architecture:** O backend já possui `PUT /user/:id` e concentra a validação de mutações de usuário/permissão. O frontend usará esse contrato somente no ramo que sincroniza o módulo do departamento; o endpoint dedicado `PUT /user/permission/:userId` permanece para os demais módulos. O gateway receberá a política administrativa correspondente sem duplicar lógica de autorização de negócio.

**Tech Stack:** TypeScript, React/Next.js, Express, Vitest, testes estáticos do app, pnpm workspace, Biome.

## Global Constraints

- Responder e documentar em português neste workspace.
- Manter imports ESM existentes e formatação Biome do projeto.
- Preservar `PUT /user/permission/:userId` e a autorização owner-only de mutações modulares.
- Não adicionar dependências, endpoints de backend, migrações ou abstrações novas.
- Seguir TDD: cada mudança de produção deve ter teste falhando antes.

---

### Task 1: Alinhar o cliente ao verbo do user-service

**Files:**
- Modify: `app/src/modules/users/services/userService.ts` — método `userService.update`.
- Modify: `app/src/modules/users/run-users-tests.mjs` — teste estático do payload modular.

**Interfaces:**
- Consumes: `UpdateUserData` e `setupAPIClient()` já existentes.
- Produces: `userService.update(id, data)` enviará `PUT /user/:id` com o mesmo payload filtrado.

- [ ] **Step 1: Escrever o teste falhando**

Atualizar o teste existente de “user updates forward modular permissions” para exigir o contrato
real do backend:

```js
runTest("user updates use PUT and forward modular permissions", () => {
  assert.match(
    userServiceSource,
    /const response = await api\.put\(`\/user\/\$\{id\}`, payload\);/,
  );
});
```

- [ ] **Step 2: Executar o teste e confirmar RED**

Run: `pnpm --filter @workspace/app test:users`

Expected: FAIL porque `userService.ts` ainda contém `api.patch(`/user/${id}`, payload)`.

- [ ] **Step 3: Implementar a menor correção**

Em `userService.update`, substituir somente o método HTTP:

```ts
const response = await api.put(`/user/${id}`, payload);
```

Não alterar o payload, os campos filtrados ou o retorno normalizado.

- [ ] **Step 4: Executar o teste e confirmar GREEN**

Run: `pnpm --filter @workspace/app test:users`

Expected: PASS, incluindo a asserção de encaminhamento de `modules`.

- [ ] **Step 5: Commitar**

```bash
git add app/src/modules/users/services/userService.ts app/src/modules/users/run-users-tests.mjs
git commit -m "fix(users): use user update PUT contract"
```

### Task 2: Proteger e testar `PUT /user/:id` no gateway

**Files:**
- Modify: `services/gateway/src/security/policies.ts` — matcher administrativo para `PUT`.
- Modify: `services/gateway/src/test/modulePermissionRegression.test.ts` — contrato da política.
- Modify: `services/gateway/src/app.routes.test.ts` — rejeição antes do upstream e proxy autorizado.

**Interfaces:**
- Consumes: `getRoutePolicy`, `canAccessRoute`, `createApp` e o registry de user-service existentes.
- Produces: `PUT /user/:id` exigirá a política `special: "manageUsers"` no gateway antes do proxy.

- [ ] **Step 1: Escrever os testes falhando**

Adicionar ao teste de regressão de políticas:

```ts
it("protege PUT /user/:id com a política de gestão de usuários", () => {
  expect(requiredRoutePolicy("PUT", "/user/user-1")).toEqual({
    special: "manageUsers",
  });
});
```

Adicionar estes dois testes de rota ao `services/gateway/src/app.routes.test.ts`, reutilizando os
helpers de servidor existentes no arquivo:

```ts
it("bloqueia PUT /user/:id sem permissão de gestão", async () => {
  let upstreamHits = 0;
  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.end(JSON.stringify({ success: true }));
  });
  const userServiceUrl = await startServer(upstream);
  const app = createApp(createEnv({ userServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/user/user-3`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${createToken({
          user_id: "user-1",
          organization_id: "org-1",
          permission: 1,
          type: "user",
        })}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ modules: { rh: 1 } }),
    });

    expect(response.status).toBe(403);
    expect(upstreamHits).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("encaminha PUT /user/:id para owner autorizado", async () => {
  let seenMethod = "";
  let seenUrl = "";
  const upstream = createServer((request, response) => {
    seenMethod = request.method ?? "";
    seenUrl = request.url ?? "";
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: {} }));
  });
  const userServiceUrl = await startServer(upstream);
  const app = createApp(createEnv({ userServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/user/user-3`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${createToken({
          user_id: "owner-1",
          organization_id: "org-1",
          permission: 2,
          type: "owner",
        })}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ modules: { rh: 1 } }),
    });

    expect(response.status).toBe(200);
    expect(seenMethod).toBe("PUT");
    expect(seenUrl).toBe("/user/user-3");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});
```

- [ ] **Step 2: Executar os testes e confirmar RED**

Run: `pnpm --filter @workspace/gateway exec vitest run src/test/modulePermissionRegression.test.ts src/app.routes.test.ts`

Expected: o teste de política falha por não haver matcher `PUT /user/:id`; o caso não autorizado
falha porque a requisição ainda atravessa o gateway.

- [ ] **Step 3: Implementar a política mínima**

Adicionar ao array `routePolicyMatchers`, ao lado dos matchers `PATCH` e `DELETE` de usuário:

```ts
{
  method: "PUT",
  path: /^\/user\/(?!me$|session$|start-config$|permission\/)[^/]+$/,
  policy: userManagementPolicy,
},
```

Não remover o matcher `PATCH`; ele continua sendo uma compatibilidade existente.

- [ ] **Step 4: Executar os testes e confirmar GREEN**

Run: `pnpm --filter @workspace/gateway exec vitest run src/test/modulePermissionRegression.test.ts src/app.routes.test.ts`

Expected: PASS; usuários sem gestão recebem `403` sem atingir o upstream e owner recebe `200` com
`PUT /user/user-3` encaminhado.

- [ ] **Step 5: Commitar**

```bash
git add services/gateway/src/security/policies.ts services/gateway/src/test/modulePermissionRegression.test.ts services/gateway/src/app.routes.test.ts
git commit -m "fix(gateway): protect user update PUT route"
```

### Task 3: Validação integrada e revisão final

**Files:**
- Verify: `app/src/modules/users/services/userService.ts`
- Verify: `services/gateway/src/security/policies.ts`
- Verify: `services/user-service/src/routes/user.routes.ts`
- Verify: testes dos pacotes frontend, gateway e user-service.

**Interfaces:**
- Consumes: commits das Tasks 1 e 2 e o contrato existente do user-service.
- Produces: evidências reproduzíveis de que o fluxo owner não retorna `404` por verbo incorreto e
  que usuários não autorizados continuam bloqueados.

- [ ] **Step 1: Rodar testes focados**

```bash
pnpm --filter @workspace/app test:users
pnpm --filter @workspace/gateway test
pnpm --filter @workspace/user-service test -- src/test/user.routes.test.ts src/test/permission.routes.test.ts
```

Expected: todos os testes PASS.

- [ ] **Step 2: Rodar typecheck/check escopados**

```bash
pnpm --filter @workspace/gateway typecheck
pnpm --filter @workspace/user-service typecheck
pnpm --filter @workspace/gateway check
pnpm --filter @workspace/user-service check
```

Expected: todos os comandos terminam sem erros introduzidos.

- [ ] **Step 3: Conferir o diff e os call sites**

```bash
git diff --check
git diff --stat
rg -n "api\.patch\(`/user/\$\{id\}`|api\.put\(`/user/\$\{id\}`" app/src/modules/users services
```

Expected: o método de atualização usado por `userService.update` é `PUT`; não há conflito de
formatação ou marcadores de merge.

- [ ] **Step 4: Commitar ajustes de validação, se houver**

Se os testes exigirem uma correção diretamente relacionada à issue, os arquivos previstos neste
plano são:

```bash
git add app/src/modules/users/services/userService.ts app/src/modules/users/run-users-tests.mjs services/gateway/src/security/policies.ts services/gateway/src/test/modulePermissionRegression.test.ts services/gateway/src/app.routes.test.ts
git commit -m "test(users): complete issue 699 regression coverage"
```
