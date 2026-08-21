# Super Admin HTTP-only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reimplementar o Super Admin sobre a linha isolada com identidade de plataforma, sessões revogáveis em cookie HTTP-only, consultas globais auditáveis e UI protegida por SSR.

**Architecture:** O `user-service` é a autoridade de identidades e sessões de plataforma. O gateway valida a sessão persistida, remove identidade forjada e encaminha apenas contexto derivado; `organization-service` e `audit-service` aceitam esse contexto somente com token interno. O frontend usa `withCredentials`, lê apenas `cw.csrf` e obtém identidade exclusivamente do servidor.

**Tech Stack:** TypeScript/ESM, Express, Prisma/PostgreSQL, Next.js Pages Router, React Query, Vitest, Node test runner, Playwright, pnpm 10.26.0.

**Spec:** `docs/superpowers/plans/2026-08-21-super-admin-http-only-recovery.md` e https://github.com/IA-Pessoas/giro-office/issues/869

## Global Constraints

- Base e destino: `feature/super-admin-v2-develop`; nunca abrir PR ou promover mudanças para `develop` nesta issue.
- Não fazer merge/cherry-pick das branches históricas. `origin/feature/super-admin-v2-recovered` é somente referência semântica lida por `git show` e não pode ser executada.
- O navegador recebe apenas `cw.session` com `HttpOnly`, `Secure` em produção e `SameSite=Lax`, além de `cw.csrf` legível somente para CSRF.
- Nenhuma resposta JSON retorna token de autenticação/CSRF; nenhum cliente lê, decodifica ou persiste JWT.
- O cliente usa `withCredentials`; somente SSR encaminha o header `Cookie` recebido.
- Identidade de plataforma usa `auth_kind="platform"` e `platform_role="super_admin"`, derivada de sessão validada pelo servidor.
- O gateway remove `Authorization`, cookies de autenticação, token interno e todos os cabeçalhos de identidade enviados pelo cliente.
- Rotas de plataforma são default-deny; mutações autenticadas por cookie exigem CSRF.
- Sessões de plataforma ficam em tabela própria, são revogáveis, expiram e usam rotação CAS; não reutilizar `auth_sessions`.
- Senhas usam o helper Argon2id existente. Não adicionar dependências npm.
- Modo de suporte, impersonação e bypass organizacional ficam fora de escopo; não criar `SupportSession` nem claims `support_*`.
- Operações globais registram ator de plataforma e não concedem acesso implícito a módulos/dados organizacionais.
- Usar Node 22 no gate equivalente à CI e `corepack pnpm@10.26.0`; instalações usam `--frozen-lockfile` após os scanners.
- Toda mudança de comportamento segue RED → GREEN → REFACTOR; o teste precisa falhar pelo motivo esperado antes do código de produção.
- Preservar hooks, scanners, lockfile e configuração pnpm, salvo mudança exigida e novamente auditada.

---

### Task 1: Identidade e política compartilhadas

**Files:**
- Modify: `shared/src/auth/types.ts`
- Modify: `shared/src/auth/token.ts`
- Modify: `shared/src/auth/policy.ts`
- Modify: `shared/src/http/headers.ts`
- Modify: `shared/src/audit/types.ts`
- Create: `shared/tests/platform-auth.test.ts`

**Interfaces:**
- Produces: `AuthKind`, `PlatformRole`, claims `auth_kind`/`platform_role`, policy `platformOnly`, `AuthContext.actorKind/isPlatformAdmin`, headers `x-auth-kind` e `x-auth-platform-role`.
- Security invariant: contexto platform nunca satisfaz política organizacional, mesmo com claims extras forjados.

- [ ] **Step 1: Write the failing isolation tests**

```ts
test("platform principal cannot inherit organization permissions", () => {
  const context = authenticateFromToken(platformToken({
    organization_id: "forged-org", permission: 3, type: "owner", modules: { rh: 3 },
  }), JWT_SECRET);
  assert.equal(context.actorKind, "platform");
  assert.equal(context.organizationId, "");
  assert.equal(context.isPlatformAdmin, true);
  assert.equal(canAccessRoute(context, { special: "platformOnly" }), true);
  assert.equal(canAccessRoute(context, { special: "ownerOnly" }), false);
  assert.equal(canAccessRoute(context, { modulePermission: { module: "rh", minPermission: 1 } }), false);
});

test("organization principal cannot satisfy platformOnly", () => {
  assert.equal(canAccessRoute(organizationContext(), { special: "platformOnly" }), false);
});
```

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @workspace/shared test -- platform-auth.test.ts`

Expected: FAIL porque os tipos/campos/política ainda não existem.

- [ ] **Step 3: Implement the minimum contract**

```ts
export type AuthKind = "organization" | "platform";
export type PlatformRole = "super_admin";
export type AuthSpecialPolicy = "manageUsers" | "ownerOnly" | "platformOnly";

const isPlatformAdmin = claims.auth_kind === "platform" && claims.platform_role === "super_admin";
const organizationId = isPlatformAdmin ? "" : (claims.organization_id ?? "");
```

`canAccessRoute` trata `platformOnly` explicitamente e retorna `false` para políticas organizacionais quando `actorKind === "platform"`.

- [ ] **Step 4: Verify GREEN**

Run: `corepack pnpm --filter @workspace/shared test`

- [ ] **Step 5: Commit**

```bash
git add -- shared/src/auth/types.ts shared/src/auth/token.ts shared/src/auth/policy.ts shared/src/http/headers.ts shared/src/audit/types.ts shared/tests/platform-auth.test.ts
git commit -m "feat(auth): add isolated platform identity"
```

### Task 2: Persistência revogável e bootstrap explícito

**Files:**
- Modify: `infra/prisma/schema.prisma`
- Create: `infra/prisma/migrations/20260821200000_add_platform_auth_sessions/migration.sql`
- Create: `services/user-service/src/services/platformAdminBootstrapService.ts`
- Create: `services/user-service/src/scripts/bootstrapPlatformAdmin.ts`
- Create: `services/user-service/src/test/platformAdminBootstrapService.test.ts`
- Modify: `services/user-service/package.json`
- Modify: `services/user-service/README.md`

**Interfaces:**
- Consumes: `PlatformRole` e `hashPassword()` Argon2id existentes.
- Produces: `PlatformUser`, `PlatformAuthSession` e comando `bootstrap:platform-admin` que lê `PLATFORM_ADMIN_NAME`, `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`.

- [ ] **Step 1: Write failing bootstrap tests**

```ts
it("creates one active Argon2id super admin", async () => {
  const result = await bootstrapPlatformAdmin(validInput, repository);
  expect(result.created).toBe(true);
  expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
    platform_role: "super_admin", status: "active", session_version: 0,
  }));
});

it("never overwrites an existing platform admin", async () => {
  repository.findByEmail.mockResolvedValue({ id: "existing" });
  await expect(bootstrapPlatformAdmin(validInput, repository)).rejects.toMatchObject({ statusCode: 409 });
});
```

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @workspace/user-service exec vitest run src/test/platformAdminBootstrapService.test.ts`

- [ ] **Step 3: Add the forward-only schema/migration**

```prisma
enum PlatformRole { super_admin }

model PlatformUser {
  id              String                @id @default(uuid())
  name            String
  email           String                @unique
  password        String
  platform_role   PlatformRole          @default(super_admin)
  status          String                @default("active")
  session_version Int                   @default(0)
  created_at      DateTime              @default(now())
  updated_at      DateTime              @updatedAt
  authSessions    PlatformAuthSession[]
  @@map("platform_users")
}

model PlatformAuthSession {
  id               String       @id @default(uuid())
  platform_user_id String
  csrf_hash        String
  expires_at       DateTime
  revoked_at       DateTime?
  created_at       DateTime     @default(now())
  platformUser     PlatformUser @relation(fields: [platform_user_id], references: [id], onDelete: Cascade)
  @@index([platform_user_id, revoked_at, expires_at], map: "idx_platform_auth_sessions_user_state")
  @@index([expires_at], map: "idx_platform_auth_sessions_expiry")
  @@map("platform_auth_sessions")
}
```

Migration cria somente enum, tabelas, índices e foreign key acima; sem `CONCURRENTLY` e sem editar migrations antigas.

- [ ] **Step 4: Implement bootstrap and verify**

O comando valida as três variáveis, chama `hashPassword`, cria uma conta e imprime somente `id`, `email`, `created`.

Run: `corepack pnpm --filter @workspace/infra exec prisma validate --schema prisma/schema.prisma`

Run: `corepack pnpm --filter @workspace/user-service exec vitest run src/test/platformAdminBootstrapService.test.ts`

- [ ] **Step 5: Commit**

```bash
git add -- infra/prisma/schema.prisma infra/prisma/migrations/20260821200000_add_platform_auth_sessions services/user-service/src/services/platformAdminBootstrapService.ts services/user-service/src/scripts/bootstrapPlatformAdmin.ts services/user-service/src/test/platformAdminBootstrapService.test.ts services/user-service/package.json services/user-service/README.md
git commit -m "feat(platform): add revocable admin persistence"
```

### Task 3: Sessão HTTP-only no user-service

**Files:**
- Create: `services/user-service/src/services/platformAuthService.ts`
- Create: `services/user-service/src/routes/platformAuth.routes.ts`
- Create: `services/user-service/src/schemas/platformAuth.schemas.ts`
- Create: `services/user-service/src/security/platformAuth.ts`
- Create: `services/user-service/src/test/platformAuthService.test.ts`
- Create: `services/user-service/src/test/platformAuth.routes.test.ts`
- Modify: `services/user-service/src/app.ts`
- Modify: `services/user-service/src/openapi/spec.ts`
- Modify: `services/user-service/src/types.d.ts`
- Modify: `scripts/all-services-smoke.manifest.mjs`

**Interfaces:**
- Produces: `POST /platform/session`, `POST /platform/session/refresh`, `DELETE /platform/session`, `GET /platform/me`, internal `POST /platform/session/validate`.
- JSON identity: `{ id, name, email, auth_kind: "platform", platform_role: "super_admin" }`; token e CSRF nunca entram no JSON.

- [ ] **Step 1: Write failing service tests**

```ts
it("issues a persisted platform session", async () => {
  const issued = await service.login(validLogin);
  expect(issued.identity).toMatchObject({ auth_kind: "platform", platform_role: "super_admin" });
  expect(issued.token).toEqual(expect.any(String));
  expect(repository.createSession).toHaveBeenCalledOnce();
});

it("rejects revoked/version-mismatched sessions", async () => {
  repository.findActiveSession.mockResolvedValue(null);
  await expect(service.validateSession(validClaims)).rejects.toMatchObject({ statusCode: 401 });
});

it("rotates CSRF with compare-and-swap", async () => {
  repository.rotateSession.mockResolvedValue(0);
  await expect(service.refreshSession(validClaims)).rejects.toMatchObject({ statusCode: 409 });
});
```

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @workspace/user-service exec vitest run src/test/platformAuthService.test.ts`

- [ ] **Step 3: Implement session service using existing primitives**

Reusar `verifyPassword`, `createCsrfToken`, `hashCsrfToken`, `SESSION_MAX_AGE_SECONDS` e o CAS de `AuthService`. O JWT interno contém apenas:

```ts
{ user_id, auth_kind: "platform", platform_role: "super_admin",
  session_version, session_id, csrf_hash, name, login: email }
```

- [ ] **Step 4: Write route tests before routes**

```ts
it("sets HTTP-only cookies and omits credentials from JSON", async () => {
  const response = await request(app).post("/platform/session").send(validLogin);
  expect(response.status).toBe(200);
  expect(response.headers["set-cookie"][0]).toContain("cw.session=");
  expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
  expect(response.body.data).not.toHaveProperty("token");
  expect(response.body.data).not.toHaveProperty("csrfToken");
});
```

Cobrir 401 genérico, 403 para identidade organizacional, refresh 409, logout/revogação e validação interna com token de serviço.

- [ ] **Step 5: Implement routes/OpenAPI/smoke and verify GREEN**

Run: `corepack pnpm --filter @workspace/user-service exec vitest run src/test/platformAuthService.test.ts src/test/platformAuth.routes.test.ts`

Run: `corepack pnpm smoke:coverage`

- [ ] **Step 6: Commit**

```bash
git add -- services/user-service/src/services/platformAuthService.ts services/user-service/src/routes/platformAuth.routes.ts services/user-service/src/schemas/platformAuth.schemas.ts services/user-service/src/security/platformAuth.ts services/user-service/src/test/platformAuthService.test.ts services/user-service/src/test/platformAuth.routes.test.ts services/user-service/src/app.ts services/user-service/src/openapi/spec.ts services/user-service/src/types.d.ts scripts/all-services-smoke.manifest.mjs
git commit -m "feat(platform): add http-only admin sessions"
```

### Task 4: Consultas globais de usuários com escopo explícito

**Files:**
- Create: `services/user-service/src/routes/platformUsers.routes.ts`
- Create: `services/user-service/src/schemas/platformUsers.schemas.ts`
- Create: `services/user-service/src/services/platformUsersService.ts`
- Create: `services/user-service/src/test/platformUsersService.test.ts`
- Create: `services/user-service/src/test/platformUsers.routes.test.ts`
- Modify: `services/user-service/src/app.ts`
- Modify: `services/user-service/src/openapi/spec.ts`
- Modify: `scripts/all-services-smoke.manifest.mjs`

**Interfaces:**
- Produces: `GET /platform/organizations/:organizationId/users?skip=0&take=20&search=` → `{ users, total, hasMore }`.

- [ ] **Step 1: Write failing scope tests**

```ts
it("filters every query by organization", async () => {
  await service.list({ organizationId: "org-1", skip: 0, take: 20, search: "ana" }, actor);
  expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ organization_id: "org-1" }), skip: 0, take: 20,
  }));
});
```

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @workspace/user-service exec vitest run src/test/platformUsersService.test.ts`

- [ ] **Step 3: Implement one paginated read service/route**

Selecionar apenas campos da listagem, limitar `take` a 100 e executar `findMany`/`count` em `Promise.all`. Cobrir 401, 403, 200, tenant e query inválida.

- [ ] **Step 4: Verify GREEN and commit**

Run: `corepack pnpm --filter @workspace/user-service exec vitest run src/test/platformUsersService.test.ts src/test/platformUsers.routes.test.ts`

Run: `corepack pnpm smoke:coverage`

```bash
git add -- services/user-service/src/routes/platformUsers.routes.ts services/user-service/src/schemas/platformUsers.schemas.ts services/user-service/src/services/platformUsersService.ts services/user-service/src/test/platformUsersService.test.ts services/user-service/src/test/platformUsers.routes.test.ts services/user-service/src/app.ts services/user-service/src/openapi/spec.ts scripts/all-services-smoke.manifest.mjs
git commit -m "feat(platform): add scoped global user queries"
```

### Task 5: Consultas globais de organizações com escopo explícito

**Files:**
- Create: `services/organization-service/src/routes/platformOrganization.routes.ts`
- Create: `services/organization-service/src/security/platformAuth.ts`
- Create: `services/organization-service/src/test/platformOrganization.routes.test.ts`
- Modify: `services/organization-service/src/schemas/organization.schemas.ts`
- Modify: `services/organization-service/src/services/organizationService.ts`
- Modify: `services/organization-service/src/app.ts`
- Modify: `services/organization-service/src/server.ts`
- Modify: `services/organization-service/src/openapi/spec.ts`
- Modify: `services/organization-service/README.md`
- Modify: `scripts/all-services-smoke.manifest.mjs`

**Interfaces:**
- Produces: `GET /platform/organizations?page=1&pageSize=20&status=&search=` → `{ organizations, total, page, pageSize }`.

- [ ] **Step 1: Write failing auth/search tests**

```ts
it("allows only trusted platform super admins", async () => {
  await request(app).get("/platform/organizations").expect(401);
  await request(app).get("/platform/organizations").set(organizationHeaders()).expect(403);
  await request(app).get("/platform/organizations").set(platformHeaders()).expect(200);
});
it("searches before pagination", async () => {
  await service.list({ page: 2, pageSize: 20, search: "castelo" });
  expect(prisma.organization.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ OR: expect.any(Array) }), skip: 20, take: 20,
  }));
});
```

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @workspace/organization-service exec vitest run src/test/platformOrganization.routes.test.ts src/test/organizationService.test.ts`

- [ ] **Step 3: Implement the read-only route**

Reusar `OrganizationService.list`; `search` cobre `name`, `slug`, `cnpj`. Não adicionar mutações, pois o escopo pede consultas. A trilha auditável será produzida pelo middleware central do gateway na Task 6.

- [ ] **Step 4: Verify GREEN and commit**

Run: `corepack pnpm --filter @workspace/organization-service test`

Run: `corepack pnpm smoke:coverage`

```bash
git add -- services/organization-service/src/routes/platformOrganization.routes.ts services/organization-service/src/security/platformAuth.ts services/organization-service/src/test/platformOrganization.routes.test.ts services/organization-service/src/schemas/organization.schemas.ts services/organization-service/src/services/organizationService.ts services/organization-service/src/app.ts services/organization-service/src/server.ts services/organization-service/src/openapi/spec.ts services/organization-service/README.md scripts/all-services-smoke.manifest.mjs
git commit -m "feat(platform): add audited organization queries"
```

### Task 6: Gateway default-deny, antiforja, rate limit e CSRF

**Files:**
- Modify: `services/gateway/src/middlewares/authenticate.ts`
- Modify: `services/gateway/src/middlewares/audit.ts`
- Modify: `services/gateway/src/proxy/httpProxy.ts`
- Modify: `services/gateway/src/security/publicRoutes.ts`
- Modify: `services/gateway/src/security/policies.ts`
- Modify: `services/gateway/src/config/serviceRegistry.ts`
- Modify: `services/gateway/src/app.ts`
- Modify: `services/gateway/src/openapi/gatewaySpec.ts`
- Modify: `services/gateway/src/test/authenticate.test.ts`
- Modify: `services/gateway/src/test/activityCatalog.test.ts`
- Modify: `services/gateway/src/proxy/httpProxy.test.ts`
- Modify: `services/gateway/src/test/routePolicyCoverage.test.ts`
- Modify: `services/gateway/src/app.routes.test.ts`
- Modify: `services/gateway/README.md`

**Interfaces:**
- Produces: gateway `/platform/session`, `/platform/session/refresh`, `/platform/me`, `/platform/organizations`, `/platform/organizations/:organizationId/users` e `/platform/audit/requests`.

- [ ] **Step 1: Write failing security tests**

```ts
it("replaces forged platform headers with derived identity", () => {
  const headers = buildForwardHeaders(platformRequest({
    "x-auth-kind": "organization", "x-auth-platform-role": "super_admin", "x-auth-user-id": "attacker",
  }), { internalServiceToken: "internal" });
  expect(headers.get("x-auth-kind")).toBe("platform");
  expect(headers.get("x-auth-user-id")).toBe("real-platform-user");
});
```

Cobrir Set-Cookie apenas nas quatro rotas de sessão permitidas, Bearer de browser recusado, plataforma bloqueada em rotas organizacionais, organização bloqueada em `/platform/**`, rate limit e CSRF em refresh/logout. O audit middleware registra principal platform como `userId: null` e `metadata: { auth_kind: "platform", platform_user_id }`, evitando violar a foreign key de `audit_requests.user_id` para usuários organizacionais.

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @workspace/gateway exec vitest run src/test/authenticate.test.ts src/test/activityCatalog.test.ts src/proxy/httpProxy.test.ts src/test/routePolicyCoverage.test.ts src/app.routes.test.ts`

- [ ] **Step 3: Implement minimum routing/security changes**

`SessionValidator` recebe `AuthContext` e escolhe `/platform/session/validate` somente para `actorKind === "platform"`. Headers novos entram na strip-list e saem apenas dos claims. Todas as rotas têm política explícita `platformOnly`; `/platform/audit/**` é encaminhada ao audit-service, embora a autorização global só fique verde após a Task 7.

- [ ] **Step 4: Verify GREEN and commit**

Run: `corepack pnpm --filter @workspace/gateway test`

Run: `corepack pnpm smoke:coverage`

```bash
git add -- services/gateway/src/middlewares/authenticate.ts services/gateway/src/middlewares/audit.ts services/gateway/src/proxy/httpProxy.ts services/gateway/src/security/publicRoutes.ts services/gateway/src/security/policies.ts services/gateway/src/config/serviceRegistry.ts services/gateway/src/app.ts services/gateway/src/openapi/gatewaySpec.ts services/gateway/src/test/authenticate.test.ts services/gateway/src/test/activityCatalog.test.ts services/gateway/src/proxy/httpProxy.test.ts services/gateway/src/test/routePolicyCoverage.test.ts services/gateway/src/app.routes.test.ts services/gateway/README.md
git commit -m "feat(gateway): enforce platform default deny"
```

### Task 7: Auditoria global exclusiva da plataforma

**Files:**
- Modify: `services/audit-service/src/middlewares/getAuthFromHeaders.ts`
- Modify: `services/audit-service/src/routes/audit.routes.ts`
- Modify: `services/audit-service/src/services/auditRequestService.ts`
- Modify: `services/audit-service/src/integrations/prisma/auditRequestRepository.ts`
- Modify: `services/audit-service/src/openapi/spec.ts`
- Create: `services/audit-service/src/test/platformAudit.routes.test.ts`
- Modify: `services/audit-service/README.md`
- Modify: `scripts/all-services-smoke.manifest.mjs`

**Interfaces:**
- Produces: `GET /platform/audit/requests`; platform pode omitir `organizationId`; admin organizacional permanece no tenant.

- [ ] **Step 1: Write failing scope tests**

```ts
it("allows global search only for platform super admin", async () => {
  await request(app).get("/audit/requests").set(platformHeaders()).expect(200);
  expect(repository.search).toHaveBeenCalledWith(expect.anything(), undefined);
});
it("keeps organization admins tenant-scoped", async () => {
  await request(app).get("/audit/requests").set(organizationHeaders("org-1")).expect(200);
  expect(repository.search).toHaveBeenCalledWith(expect.anything(), "org-1");
});
```

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @workspace/audit-service exec vitest run src/test/platformAudit.routes.test.ts`

- [ ] **Step 3: Implement optional tenant only for verified platform context**

Sempre exigir `userId`; exigir `organizationId` salvo para o par exato platform/super_admin. O repository aplica filtro quando definido e mantém paginação/ordenação.

- [ ] **Step 4: Verify GREEN and commit**

Run: `corepack pnpm --filter @workspace/audit-service test`

Run: `corepack pnpm smoke:coverage`

```bash
git add -- services/audit-service/src/middlewares/getAuthFromHeaders.ts services/audit-service/src/routes/audit.routes.ts services/audit-service/src/services/auditRequestService.ts services/audit-service/src/integrations/prisma/auditRequestRepository.ts services/audit-service/src/openapi/spec.ts services/audit-service/src/test/platformAudit.routes.test.ts services/audit-service/README.md scripts/all-services-smoke.manifest.mjs
git commit -m "feat(audit): allow isolated platform search"
```

### Task 8: Cliente e guard SSR sem token legível

**Files:**
- Modify: `app/src/context/AuthContext.tsx`
- Create: `app/src/modules/auth/utils/canSSRPlatformAdmin.ts`
- Modify: `app/src/modules/auth/index.ts`
- Create: `app/src/modules/auth/run-platform-session-tests.mjs`
- Modify: `app/src/modules/auth/run-session-transport-tests.mjs`
- Modify: `app/package.json`
- Create: `app/src/pages/super-admin/login.tsx`

**Interfaces:**
- Produces: identidade frontend com `auth_kind/platform_role`; `canSSRPlatformAdmin(fn)` carrega `/platform/me` via `setupAPIClient(ctx)`.

- [ ] **Step 1: Write failing transport tests**

```js
assert.match(platformGuardSource, /setupAPIClient\(ctx\)/);
assert.match(platformGuardSource, /\.get\("\/platform\/me"\)/);
assert.doesNotMatch(platformSources, /cw\.token|jwtDecode|Authorization|Bearer|localStorage|sessionStorage/);
assert.doesNotMatch(platformLoginSource, /setCookie|destroyCookie/);
```

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @workspace/app run test:platform-session`

- [ ] **Step 3: Implement server-driven platform auth**

`signInPlatform`, refresh e logout usam apenas API. O guard não lê o valor de `cw.session`; consulta `/platform/me` e redireciona para `/super-admin/login` em 401/403.

- [ ] **Step 4: Verify GREEN and commit**

Run: `corepack pnpm --filter @workspace/app run test:platform-session`

Run: `corepack pnpm --filter @workspace/app run test:session-security`

Run: `corepack pnpm --filter @workspace/app run test:auth`

```bash
git add -- app/src/context/AuthContext.tsx app/src/modules/auth/utils/canSSRPlatformAdmin.ts app/src/modules/auth/index.ts app/src/modules/auth/run-platform-session-tests.mjs app/src/modules/auth/run-session-transport-tests.mjs app/package.json app/src/pages/super-admin/login.tsx
git commit -m "feat(web): add server-driven platform session"
```

### Task 9: Interface e navegação Super Admin

**Files:**
- Create: `app/src/modules/superAdmin/types.ts`
- Create: `app/src/modules/superAdmin/services/platformService.ts`
- Create: `app/src/modules/superAdmin/hooks/usePlatformOrganizations.ts`
- Create: `app/src/modules/superAdmin/hooks/usePlatformUsers.ts`
- Create: `app/src/modules/superAdmin/components/OrganizationDirectory.tsx`
- Create: `app/src/modules/superAdmin/components/PlatformUsersPanel.tsx`
- Create: `app/src/modules/superAdmin/components/SuperAdminPage.tsx`
- Create: `app/src/modules/superAdmin/index.ts`
- Create: `app/src/modules/superAdmin/run-super-admin-tests.mjs`
- Create: `app/src/pages/super-admin/index.tsx`
- Modify: `app/src/shared/components/newLayout/AppShell.tsx`
- Modify: `app/package.json`

**Interfaces:**
- Produces: `/super-admin` com organizações paginadas/pesquisáveis, usuários do tenant escolhido e auditoria; nenhum CTA falso/desabilitado.

- [ ] **Step 1: Write failing UI contract tests**

```js
assert.match(platformServiceSource, /api\.get\("\/platform\/organizations"/);
assert.match(platformServiceSource, /api\.get\(`\/platform\/organizations\/\$\{organizationId\}\/users`/);
assert.doesNotMatch(allSuperAdminSources, /cw\.token|jwtDecode|Authorization|Bearer|support_mode|support-sessions/);
assert.match(appShellSource, /user\?\.auth_kind === "platform"/);
assert.match(appShellSource, /enabled: !isPlatformSuperAdmin/);
```

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @workspace/app run test:super-admin`

- [ ] **Step 3: Implement the minimum real-data UI**

Usar React Query e padrões atuais. A referência visual pode ser lida via `git show`, removendo suporte/token e o botão “Novo usuário” desabilitado. Implementar loading/error/empty/success e paginação real.

- [ ] **Step 4: Verify GREEN/build and commit**

Run: `corepack pnpm --filter @workspace/app run test:super-admin`

Run: `corepack pnpm --filter @workspace/app typecheck`

Run: `corepack pnpm --filter @workspace/app build`

```bash
git add -- app/src/modules/superAdmin app/src/pages/super-admin app/src/shared/components/newLayout/AppShell.tsx app/package.json
git commit -m "feat(web): add http-only super admin console"
```

### Task 10: CI isolada, regressões e screenshots

**Files:**
- Create: `.github/workflows/super-admin-v2-ci.yml`
- Modify: `scripts/supply-chain-security.test.mjs`
- Create: `scripts/super-admin-session-regression.test.mjs`
- Create: `docs/evidence/issue-869/super-admin-login.png`
- Create: `docs/evidence/issue-869/super-admin-console.png`

**Interfaces:**
- Produces: CI somente para PRs em `feature/super-admin-v2-develop`, regressão contra transporte legado e screenshots sem dados reais/segredos.

- [ ] **Step 1: Write failing repository tests**

```js
test("Super Admin browser sources contain no legacy auth transport", async () => {
  const source = await readPlatformBrowserSources();
  assert.doesNotMatch(source, /cw\.token|jwt-decode|jwtDecode|Authorization\s*=|Bearer\s|support_mode|support_session/);
});
test("isolated CI never targets develop", async () => {
  const workflow = await readFile(".github/workflows/super-admin-v2-ci.yml", "utf8");
  assert.match(workflow, /feature\/super-admin-v2-develop/);
  assert.doesNotMatch(workflow, /branches:\s*\[?develop/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/super-admin-session-regression.test.mjs`

- [ ] **Step 3: Add CI with Node 22/pnpm 10.26.0**

Executar frozen install, audit, supply-chain scanner/tests, shared/quatro serviços, smoke coverage, Prisma validate, app typecheck/build e regressão Super Admin. `pull_request.branches` contém somente `feature/super-admin-v2-develop`.

- [ ] **Step 4: Run local release gates**

Run: `node --test scripts/super-admin-session-regression.test.mjs scripts/supply-chain-security.test.mjs scripts/supply-chain-integrity.test.mjs`

Run: `node scripts/supply-chain-integrity.mjs`

Run: `node scripts/pnpm-security-policy.mjs --root .`

Run: `corepack pnpm audit --audit-level moderate`

Run: `corepack pnpm check`

Run: `corepack pnpm typecheck`

Run: `corepack pnpm test`

Run: `corepack pnpm smoke:coverage`

Run: `corepack pnpm --filter @workspace/infra exec prisma validate --schema prisma/schema.prisma`

- [ ] **Step 5: Browser proof/screenshots**

Subir os quatro serviços, gateway e app sem imprimir envs. Verificar `/platform/me`, `/platform/organizations`, `/platform/audit/requests`, console/network sem 401/403/500/502 inesperado e cookies `cw.session` HttpOnly/`cw.csrf`. Capturar login e console com dados locais fictícios.

- [ ] **Step 6: Graphify/manual review and commit**

Tentar `corepack pnpm graphify:update:ui` e `corepack pnpm graphify:update:services`; sem grafo/chave, usar `git diff --check`, conflito markers, call sites e diff completo contra `origin/feature/super-admin-v2-develop`.

```bash
git add -- .github/workflows/super-admin-v2-ci.yml scripts/supply-chain-security.test.mjs scripts/super-admin-session-regression.test.mjs docs/evidence/issue-869
git commit -m "test(platform): enforce isolated security gates"
```

## Final Review and Publication

- [ ] Revisão por tarefa e revisão final com `superpowers:requesting-code-review`.
- [ ] Revisão de segurança contra `feature/super-admin-v2-develop`; corrigir Critical/Important.
- [ ] Passe `performance-algorithm-design`: paginação limitada, queries concorrentes, ausência de N+1/caches ilimitados/event-loop blocking.
- [ ] Worktree limpa, `git diff --check`, ausência de conflitos e gates com evidência fresca.
- [ ] Push `codex/issue-869-super-admin-http-only`; `--no-verify` somente para hook alheio/base e com justificativa registrada.
- [ ] PR em inglês para `feature/super-admin-v2-develop`, reviewer `eedsilva`, labels existentes, `Closes #869`, validações e screenshots.
- [ ] Verificar `mergeable=MERGEABLE` e checks; não fazer merge.
