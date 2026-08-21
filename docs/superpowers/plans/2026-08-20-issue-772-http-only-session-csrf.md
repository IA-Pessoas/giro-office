# Issue #772 HttpOnly Session and CSRF Implementation Plan

> Review correction (2026-08-20): the final implementation uses a per-session `auth_sessions` row
> and compare-and-swap CSRF rotation. References below to incrementing global `session_version` on
> refresh/logout describe the initial RED/GREEN plan and are superseded; global version changes are
> retained only for account/permission invalidation.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser-readable JWT with server-issued HttpOnly session cookies, enforce session-bound CSRF for authenticated mutations, and preserve SSR, revocation, rollout compatibility, documentation, smoke coverage, and browser evidence.

**Architecture:** The user-service continues signing one-day JWTs and binds each token to a random CSRF value by placing only its SHA-256 hash in the signed claims. The gateway authenticates `cw.session`, validates `cw.csrf` plus `x-csrf-token` on unsafe cookie requests, forwards only trusted identity headers, and offers a disabled-by-default Bearer compatibility flag. The web client sends credentials, reads only the CSRF cookie, and derives all user access from server responses.

**Tech Stack:** TypeScript, Node.js `crypto`, Express, JSON Web Tokens, Axios, Next.js Pages Router, Vitest, Node test runner, Supertest, Playwright, pnpm 10.26.0.

**Spec:** `docs/superpowers/specs/2026-08-20-issue-772-http-only-session-csrf-design.md`

## Global Constraints

- Keep one issue and one branch in `C:\Users\Davi.Araujo.173CASTELO.000\Desktop\Repositorios\GIROOFFICE-issue-772` on `codex/issue-772-http-only-sessions-csrf`.
- Add no npm dependency; use existing packages or Node/Web APIs only.
- Never print, log, persist in screenshots, or commit passwords, cookies, CSRF values, authorization headers, raw JWTs, production identifiers, env values, or production rows.
- Production auth cookie: `cw.session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=86400`.
- Production CSRF cookie: `cw.csrf`, readable, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=86400`.
- CSRF header: `x-csrf-token`; enforce on authenticated cookie `POST`, `PUT`, `PATCH`, and `DELETE`.
- Bind CSRF to the JWT with a signed `csrf_hash` claim and compare bounded values in constant time.
- Reject literal `Origin: null` and unapproved `Origin`/`Referer`; absence of both is not the sole rejection reason when the bound CSRF proof is valid.
- `GATEWAY_BEARER_AUTH_COMPATIBILITY` defaults to `false`; when enabled, its documented maximum window is 14 days.
- Keep success/error envelopes stable and use `ServiceError` plus the existing Express error serializer.
- Preserve `session_version` validation and disabled-user/organization revocation.
- Preserve ESM `.js` extensions, explicit public service return types, Biome style, and existing package test runners.
- Do not weaken security, validation, error handling, accessibility, or observability for Ponytail Ultra simplicity.

---

### Task 1: Secure session primitives in `@workspace/shared`

**Files:**
- Create: `shared/src/http/session-security.ts`
- Create: `shared/tests/http/session-security.test.ts`
- Modify: `shared/src/http/index.ts`
- Modify: `shared/src/index.ts`
- Modify: `shared/src/auth/types.ts`
- Modify: `shared/src/auth/token.ts`
- Test: `shared/tests/http/security-config.test.ts`

**Interfaces:**
- Consumes: Node `randomBytes`, `createHash`, and `timingSafeEqual`; existing `AuthContext`, `AuthIdentity`, and JWT verification.
- Produces: `AUTH_SESSION_COOKIE_NAME`, `CSRF_COOKIE_NAME`, `CSRF_HEADER_NAME`, `SESSION_MAX_AGE_SECONDS`, `createCsrfToken()`, `hashCsrfToken()`, `verifyCsrfToken()`, `readCookie()`, `stripBrowserAuth()`, `createSessionCookieHeaders()`, `createExpiredSessionCookieHeaders()`, and `authenticateFromToken()`.

- [ ] **Step 1: Verify the isolated worktree and bootstrap dependencies without changing the lockfile**

Run:

```powershell
git status --short --branch
node --version
corepack pnpm --version
& "$env:USERPROFILE\.codex\skills\worktree-development\scripts\check-worktree-readiness.ps1" -Worktree "$PWD"
corepack pnpm install --frozen-lockfile
corepack pnpm security:pnpm
```

Expected: branch is `codex/issue-772-http-only-sessions-csrf`, pnpm is `10.26.0`, install honors `minimumReleaseAge`, `trustPolicy`, `blockExoticSubdeps`, `strictDepBuilds`, and `allowBuilds: {}`, and the security policy reports `ok: true`.

- [ ] **Step 2: Run the unchanged focused baseline**

Run:

```powershell
corepack pnpm --filter @workspace/shared test
corepack pnpm --filter @workspace/user-service test -- src/test/authService.test.ts src/test/auth.routes.test.ts
corepack pnpm --filter @workspace/gateway test -- src/test/authenticate.test.ts src/config/env.test.ts
corepack pnpm --filter @workspace/app test:auth
```

Expected: every command passes before production edits. If one fails, record the exact first failure as a baseline blocker before continuing.

- [ ] **Step 3: Write failing shared session-security tests**

Add tests with these observable assertions:

```typescript
test("session cookies carry the production security attributes", () => {
  const headers = createSessionCookieHeaders("signed.jwt", "csrf-value", { secure: true });

  assert.match(headers[0], /^cw\.session=signed\.jwt;/);
  assert.match(headers[0], /HttpOnly/);
  assert.match(headers[0], /Secure/);
  assert.match(headers[0], /SameSite=Lax/);
  assert.match(headers[0], /Path=\//);
  assert.match(headers[0], /Max-Age=86400/);
  assert.doesNotMatch(headers[1], /HttpOnly/);
  assert.match(headers[1], /^cw\.csrf=csrf-value;/);
});

test("CSRF proof is bound to one signed session hash", () => {
  const token = "A".repeat(43);
  assert.equal(verifyCsrfToken(token, hashCsrfToken(token)), true);
  assert.equal(verifyCsrfToken("B".repeat(43), hashCsrfToken(token)), false);
  assert.equal(verifyCsrfToken("oversized".repeat(100), hashCsrfToken(token)), false);
});

test("browser auth removal preserves unrelated cookies", () => {
  assert.equal(
    stripBrowserAuth("theme=dark; cw.session=secret; cw.csrf=proof; locale=pt-BR"),
    "theme=dark; locale=pt-BR",
  );
});

test("authenticateFromToken exposes the signed CSRF hash", () => {
  const token = jwt.sign(
    { user_id: "user-1", organization_id: "org-1", csrf_hash: "a".repeat(64) },
    "secret",
  );
  assert.equal(authenticateFromToken(token, "secret").claims.csrf_hash, "a".repeat(64));
});
```

- [ ] **Step 4: Run the shared tests and verify RED**

Run: `corepack pnpm --filter @workspace/shared test`

Expected: FAIL because the session-security exports and `AuthIdentity.csrf_hash` do not exist.

- [ ] **Step 5: Implement the minimal shared API**

Implement these signatures and invariants:

```typescript
export const AUTH_SESSION_COOKIE_NAME = "cw.session";
export const CSRF_COOKIE_NAME = "cw.csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";
export const SESSION_MAX_AGE_SECONDS = 86_400;

export interface SessionCookieOptions {
  secure: boolean;
}

export function createCsrfToken(): string;
export function hashCsrfToken(token: string): string;
export function verifyCsrfToken(token: string, expectedHash: string): boolean;
export function readCookie(cookieHeader: string | undefined, name: string): string | undefined;
export function stripBrowserAuth(cookieHeader: string | undefined): string | undefined;
export function createSessionCookieHeaders(
  sessionToken: string,
  csrfToken: string,
  options: SessionCookieOptions,
): [string, string];
export function createExpiredSessionCookieHeaders(
  options: SessionCookieOptions,
): [string, string];
```

Use 32 random bytes encoded as base64url. Accept only a 43-character base64url CSRF value and a 64-character lowercase hexadecimal expected hash before converting both hashes to buffers for `timingSafeEqual`. Reject cookie headers larger than 8192 bytes and cookie values larger than 4096 bytes. Serialize no `Domain` attribute.

Add `csrf_hash?: string` to `AuthIdentity`, normalize only `/^[a-f0-9]{64}$/`, and implement:

```typescript
export function authenticateFromToken(token: string, jwtSecret: string): AuthContext {
  const claims = verifyJwtToken(token, jwtSecret);
  return {
    token,
    userId: claims.user_id,
    organizationId: claims.organization_id ?? "",
    claims,
  };
}
```

Keep `authenticateFromAuthHeader()` as a compatibility wrapper around `extractBearerToken()` and `authenticateFromToken()`.

- [ ] **Step 6: Permit the CSRF header in credentialed CORS and verify GREEN**

Change `createServiceCorsOptions().allowedHeaders` to:

```typescript
["Content-Type", "Authorization", "x-request-id", CSRF_HEADER_NAME]
```

Add an assertion in `shared/tests/http/security-config.test.ts`, then run:

```powershell
corepack pnpm --filter @workspace/shared test
corepack pnpm --filter @workspace/shared typecheck
```

Expected: PASS with no warnings or unexpected output.

- [ ] **Step 7: Commit the shared primitives**

```powershell
git add -- shared/src/http/session-security.ts shared/tests/http/session-security.test.ts shared/tests/http/security-config.test.ts shared/src/http/index.ts shared/src/index.ts shared/src/auth/types.ts shared/src/auth/token.ts shared/src/http/security-config.ts
git commit -m "feat(auth): add session-bound CSRF primitives"
```

---

### Task 2: User-service login, refresh, logout, and cookie issuance

**Files:**
- Modify: `services/user-service/src/config/env.ts`
- Modify: `services/user-service/src/services/authService.ts`
- Modify: `services/user-service/src/routes/auth.routes.ts`
- Modify: `services/user-service/src/app.ts`
- Modify: `services/user-service/src/test/userTestUtils.ts`
- Modify: `services/user-service/src/test/authService.test.ts`
- Modify: `services/user-service/src/test/auth.routes.test.ts`
- Modify: `services/user-service/src/openapi/spec.ts`
- Modify: `services/user-service/README.md`

**Interfaces:**
- Consumes: Task 1 cookie/CSRF helpers, `AuthIdentity.csrf_hash`, `SESSION_MAX_AGE_SECONDS`, `session_version`, and trusted forwarded auth context.
- Produces: token-free login/refresh JSON, `POST /user/session/refresh`, `DELETE /user/session`, `AuthService.refreshSession()`, and `AuthService.revokeSession()`.

- [ ] **Step 1: Write failing AuthService tests for CSRF binding, rotation, and logout revocation**

Add tests that stub `randomBytes` or compare behavior without asserting secret values:

```typescript
it("login signs a one-day session bound to the returned CSRF token", async () => {
  const result = await service.login({ login: "admin", password: "secret" });
  expect(jwtMock.sign).toHaveBeenCalledWith(
    expect.objectContaining({ csrf_hash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    "jwt-secret",
    expect.objectContaining({ expiresIn: 86_400, subject: "user-1" }),
  );
  expect(result.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(result.token).toBe("jwt-token");
});

it("refresh rotates the CSRF binding without changing session_version", async () => {
  const first = await service.refreshSession({
    user_id: "user-1",
    organization_id: "org-1",
    session_version: 1,
  });
  const second = await service.refreshSession({
    user_id: "user-1",
    organization_id: "org-1",
    session_version: 1,
  });
  expect(first.csrfToken).not.toBe(second.csrfToken);
  expect(jwtMock.sign).toHaveBeenCalledTimes(2);
});

it("logout increments only the matching active session version", async () => {
  prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
  await service.revokeSession("user-1", 3);
  expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
    where: { id: "user-1", session_version: 3 },
    data: { session_version: { increment: 1 } },
  });
});
```

- [ ] **Step 2: Run AuthService tests and verify RED**

Run: `corepack pnpm --filter @workspace/user-service test -- src/test/authService.test.ts`

Expected: FAIL because login has no CSRF token and refresh/revoke methods do not exist.

- [ ] **Step 3: Implement one private session issuer and the two lifecycle methods**

Keep one result shape:

```typescript
export interface SessionUser {
  id: string;
  name: string;
  login: string;
  permission: number;
  type?: AuthUserType;
  modules: ModulePermissions;
  department_id: string;
  organization_id: string;
}

export interface IssuedSession extends SessionUser {
  token: string;
  csrfToken: string;
}
```

Use a private `issueSession(user, organizationId, modules, type): IssuedSession` that creates one CSRF value, hashes it once, and signs the existing claims plus `csrf_hash`. `refreshSession(identity)` must reload active user, organization, department, and organization-scoped permissions; it rejects a changed `session_version`, disabled user, disabled organization, or wrong organization with `401`. `revokeSession(userId, sessionVersion)` performs the guarded increment and returns `401` when `count !== 1`.

- [ ] **Step 4: Write failing route tests for secure cookies and token-free JSON**

Add these route cases with `createTestApp({ authCookieSecure: true })`:

```typescript
it("POST /user/session sets secure cookies without exposing the JWT", async () => {
  authServiceMock.login.mockResolvedValue({
    id: "user-1",
    name: "Admin",
    login: "admin",
    permission: 2,
    modules: {},
    department_id: "dep-1",
    organization_id: "org-1",
    token: "signed.jwt",
    csrfToken: "A".repeat(43),
  });
  const response = await request(createTestApp({ authCookieSecure: true }))
    .post("/user/session")
    .send({ login: "admin", password: "secret" });

  expect(response.body.data.token).toBeUndefined();
  expect(response.headers["set-cookie"][0]).toContain("cw.session=signed.jwt");
  expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
  expect(response.headers["set-cookie"][0]).toContain("Secure");
});

it("POST /user/session/refresh rotates both cookies", async () => {
  authServiceMock.refreshSession.mockResolvedValue(issuedSessionFixture);
  const response = await request(createTestApp({ authCookieSecure: true }))
    .post("/user/session/refresh")
    .set(gatewayAuthHeaders({ userId: "user-1", sessionVersion: 1 }));
  expect(response.status).toBe(200);
  expect(response.headers["set-cookie"]).toHaveLength(2);
  expect(response.body.data.token).toBeUndefined();
});

it("DELETE /user/session revokes the version and expires both cookies", async () => {
  const response = await request(createTestApp({ authCookieSecure: true }))
    .delete("/user/session")
    .set(gatewayAuthHeaders({ userId: "user-1", sessionVersion: 1 }));
  expect(authServiceMock.revokeSession).toHaveBeenCalledWith("user-1", 1);
  expect(response.headers["set-cookie"]).toEqual(
    expect.arrayContaining([expect.stringContaining("cw.session=; Max-Age=0")]),
  );
});
```

Extend `UserRouteMocks` with `refreshSession` and `revokeSession`, and extend
`gatewayAuthHeaders` with an optional integer `sessionVersion` that serializes to
the trusted `x-auth-session-version` test header. This keeps the route tests on
the same gateway-to-service contract used in production.

- [ ] **Step 5: Run route tests and verify RED**

Run: `corepack pnpm --filter @workspace/user-service test -- src/test/auth.routes.test.ts`

Expected: FAIL because the router exposes neither cookie issuance nor refresh/logout.

- [ ] **Step 6: Convert auth routes to an env-aware router factory**

Export:

```typescript
export function createAuthRoutes(
  env: Pick<UserServiceEnv, "authCookieSecure">,
): ReturnType<typeof Router>;
```

In login and refresh, destructure secrets before serialization:

```typescript
const { token, csrfToken, ...sessionUser } = issuedSession;
response.append(
  "Set-Cookie",
  createSessionCookieHeaders(token, csrfToken, { secure: env.authCookieSecure }),
);
response.json(createSuccessResponse({ ...sessionUser, service: "user-service" }));
```

Protect refresh and logout with `isAuthenticated`, require `user_id`, `organization_id`, and integer `session_version`, and clear both cookies after successful revocation. Mount `createAuthRoutes(env)` under `/user` in `app.ts`.

Parse `AUTH_COOKIE_SECURE` in `UserServiceEnv`; default to `nodeEnv === "production"`, while an explicit `true` or `false` overrides the default for HTTPS production and isolated HTTP slots.

- [ ] **Step 7: Align OpenAPI and user-service README**

Document `cookieAuth` (`apiKey`, `in: cookie`, `name: cw.session`), the token-free login response, refresh rotation, logout expiry, `x-csrf-token`, `AUTH_COOKIE_SECURE`, direct internal Bearer validation, and one-day expiry. Do not include example token or cookie values.

- [ ] **Step 8: Verify user-service GREEN**

Run:

```powershell
corepack pnpm --filter @workspace/user-service test -- src/test/authService.test.ts src/test/auth.routes.test.ts
corepack pnpm --filter @workspace/user-service typecheck
corepack pnpm --filter @workspace/user-service build
```

Expected: PASS; Prisma generation runs before typecheck/build and JSON contains no token.

- [ ] **Step 9: Commit user-service lifecycle**

```powershell
git add -- services/user-service/src/config/env.ts services/user-service/src/services/authService.ts services/user-service/src/routes/auth.routes.ts services/user-service/src/app.ts services/user-service/src/test/userTestUtils.ts services/user-service/src/test/authService.test.ts services/user-service/src/test/auth.routes.test.ts services/user-service/src/openapi/spec.ts services/user-service/README.md
git commit -m "feat(auth): issue and revoke HttpOnly sessions"
```

---

### Task 3: Gateway cookie authentication, CSRF enforcement, and proxy containment

**Files:**
- Create: `services/gateway/src/middlewares/csrfProtection.ts`
- Create: `services/gateway/src/test/csrfProtection.test.ts`
- Modify: `services/gateway/src/middlewares/authenticate.ts`
- Modify: `services/gateway/src/test/authenticate.test.ts`
- Modify: `services/gateway/src/types.d.ts`
- Modify: `services/gateway/src/config/env.ts`
- Modify: `services/gateway/src/config/env.test.ts`
- Modify: `services/gateway/src/app.ts`
- Modify: `services/gateway/src/app.routes.test.ts`
- Modify: `services/gateway/src/proxy/httpProxy.ts`
- Modify: `services/gateway/src/openapi/gatewaySpec.ts`
- Modify: `services/gateway/src/test/routePolicyCoverage.test.ts`
- Modify: `services/gateway/src/test/activityCatalogCoverage.test.ts`

**Interfaces:**
- Consumes: Task 1 parsing, hashing, cookie expiration, `authenticateFromToken()`, Task 2 signed `csrf_hash`, and existing session validation.
- Produces: `request.authTransport`, cookie-first authentication, `buildCsrfProtectionMiddleware()`, Bearer compatibility telemetry, origin validation, and downstream credential stripping.

- [ ] **Step 1: Write failing authentication transport tests**

Exercise `buildAuthenticateMiddleware()` through a small Express app:

```typescript
it("authenticates a valid session cookie before Authorization", async () => {
  const response = await request(app)
    .get("/protected")
    .set("Cookie", "cw.session=cookie-jwt")
    .set("Authorization", "Bearer header-jwt");
  expect(response.status).toBe(200);
  expect(validateSession).toHaveBeenCalledWith("cookie-jwt");
});

it("rejects Bearer when compatibility is disabled", async () => {
  const response = await request(app)
    .get("/protected")
    .set("Authorization", `Bearer ${validBearer}`);
  expect(response.status).toBe(401);
});

it("expires stale cookies when session validation rejects", async () => {
  const response = await request(app).get("/protected").set("Cookie", staleCookie);
  expect(response.status).toBe(401);
  expect(response.headers["set-cookie"]).toEqual(
    expect.arrayContaining([expect.stringContaining("cw.session=; Max-Age=0")]),
  );
});
```

- [ ] **Step 2: Run authentication tests and verify RED**

Run: `corepack pnpm --filter @workspace/gateway test -- src/test/authenticate.test.ts`

Expected: FAIL because authentication only reads `Authorization` and has no transport state.

- [ ] **Step 3: Implement cookie-first authentication and bounded Bearer fallback**

Use one options object:

```typescript
export interface AuthenticateMiddlewareOptions {
  jwtSecret: string;
  sessionValidator?: SessionValidator;
  bearerAuthCompatibility: boolean;
  authCookieSecure: boolean;
  logger: Logger;
}

export function buildAuthenticateMiddleware(
  options: AuthenticateMiddlewareOptions,
): RequestHandler;
```

Set `request.authTransport` to `"cookie"` or `"bearer"`. Cookie is authoritative when both transports are supplied. The fallback logs `auth.bearer_compat.accepted` without token or claims. Cookie authentication success logs `auth.cookie.accepted`. Any cookie verification/session-validation failure appends the two expired cookie headers and logs `auth.session.validation.failed` with a reason category only.

Add `bearerAuthCompatibility: boolean` and `authCookieSecure: boolean` to `GatewayEnv`. Parse `GATEWAY_BEARER_AUTH_COMPATIBILITY` with default `false`; parse `AUTH_COOKIE_SECURE` with the same rule as user-service. Set test fixtures that intentionally exercise historical Bearer paths to `bearerAuthCompatibility: true`.

- [ ] **Step 4: Write failing CSRF tests for all unsafe methods and threat cases**

Create a table-driven test for `POST`, `PUT`, `PATCH`, and `DELETE`. Cover missing header, mismatched cookie/header, wrong-session hash, replay after rotation, oversized token, allowed origin, `Origin: null`, hostile origin, hostile referer, safe GET, and Bearer compatibility.

The success fixture must use:

```typescript
const csrfToken = "A".repeat(43);
request.authTransport = "cookie";
request.auth = {
  token: "signed.jwt",
  userId: "user-1",
  organizationId: "org-1",
  claims: { user_id: "user-1", organization_id: "org-1", csrf_hash: hashCsrfToken(csrfToken) },
};
request.headers.cookie = `cw.csrf=${csrfToken}`;
request.headers[CSRF_HEADER_NAME] = csrfToken;
request.headers.origin = "https://useoffice.com.br";
```

Expected failure assertions: status `403`, code `FORBIDDEN`, generic error, and no submitted value in body or logs.

- [ ] **Step 5: Run CSRF tests and verify RED**

Run: `corepack pnpm --filter @workspace/gateway test -- src/test/csrfProtection.test.ts`

Expected: FAIL because the middleware does not exist.

- [ ] **Step 6: Implement and mount the CSRF middleware**

Export:

```typescript
export interface CsrfProtectionOptions {
  allowedOrigins: string[];
  logger: Logger;
}

export function buildCsrfProtectionMiddleware(
  options: CsrfProtectionOptions,
): RequestHandler;
```

Return early for public routes, safe methods, and Bearer compatibility. For cookie auth, require `request.auth.claims.csrf_hash`, `cw.csrf`, and `x-csrf-token`; validate binding with `verifyCsrfToken()`. When `Origin` exists, compare the exact origin. Otherwise parse `Referer` and compare its `.origin`; reject invalid URLs. Log `auth.csrf.rejected` with one of `missing`, `mismatch`, `wrong_session`, `invalid_origin`, or `oversized`, never submitted values.

Mount in `mountAuthenticationBoundary()` immediately after authentication and before rate limiting/authorization:

```typescript
app.use(buildAuthenticateMiddleware(authOptions));
app.use(buildCsrfProtectionMiddleware({ allowedOrigins: env.allowedOrigins, logger }));
```

- [ ] **Step 7: Write and pass proxy containment tests**

Extend the upstream capture test to send:

```typescript
Cookie: "theme=dark; cw.session=secret; cw.csrf=proof",
Authorization: "Bearer browser-secret",
```

Assert upstream receives `Cookie: theme=dark`, no `Authorization`, and the trusted `x-auth-*` headers. Implement this in `buildForwardHeaders()` with `stripBrowserAuth()` and explicit client authorization removal.

- [ ] **Step 8: Add gateway CORS and integration cases**

In `app.routes.test.ts`, add one valid cookie-authenticated mutation with the bound CSRF header, one missing-CSRF mutation returning `403`, and preflights for `https://useoffice.com.br`, `null`, and `https://evil.example`. Assert `access-control-allow-credentials: true` only for the approved origin and that `x-csrf-token` appears in allowed headers.

Update gateway OpenAPI security to advertise `cookieAuth` as the final browser contract and retain `bearerAuth` only with a compatibility description. Add refresh/logout paths from the user-service spec. Update all explicit `GatewayEnv` test fixtures with the two new fields.

- [ ] **Step 9: Verify gateway GREEN**

Run:

```powershell
corepack pnpm --filter @workspace/gateway test
corepack pnpm --filter @workspace/gateway typecheck
corepack pnpm --filter @workspace/gateway build
```

Expected: PASS; existing Bearer-heavy gateway tests pass only through explicit test compatibility, while new default-env tests prove compatibility is off.

- [ ] **Step 10: Commit the gateway boundary**

```powershell
git add -- services/gateway/src/middlewares/csrfProtection.ts services/gateway/src/test/csrfProtection.test.ts services/gateway/src/middlewares/authenticate.ts services/gateway/src/test/authenticate.test.ts services/gateway/src/types.d.ts services/gateway/src/config/env.ts services/gateway/src/config/env.test.ts services/gateway/src/app.ts services/gateway/src/app.routes.test.ts services/gateway/src/proxy/httpProxy.ts services/gateway/src/openapi/gatewaySpec.ts services/gateway/src/test/routePolicyCoverage.test.ts services/gateway/src/test/activityCatalogCoverage.test.ts
git commit -m "feat(gateway): enforce cookie sessions and CSRF"
```

---

### Task 4: Credentialed API client, SSR, and browser auth state without JWT access

**Files:**
- Create: `packages/api/src/run-client-tests.mjs`
- Modify: `packages/api/src/client.ts`
- Modify: `packages/api/package.json`
- Modify: `app/src/shared/services/api.ts`
- Modify: `app/src/context/AuthContext.tsx`
- Modify: `app/src/context/SocketContext.tsx`
- Modify: `app/src/context/ChatContext.tsx`
- Modify: `app/src/modules/auth/utils/canSSRAuth.ts`
- Modify: `app/src/modules/auth/utils/canSSRGuest.ts`
- Modify: `app/src/modules/auth/utils/canSSRAdmin.ts`
- Modify: `app/src/modules/auth/utils/permissions.ts`
- Modify: `app/src/modules/auth/run-auth-tests.mjs`
- Delete: `app/src/modules/auth/utils/authCookie.ts`
- Delete: `app/src/modules/auth/utils/authHeaders.ts`
- Delete: `app/src/modules/auth/utils/sessionToken.ts`
- Modify: `app/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Task 2 token-free user responses and lifecycle routes; Task 3 cookie/CSRF gateway contract.
- Produces: credentialed Axios, browser CSRF injection, SSR cookie forwarding, server-driven auth state, and zero browser JWT decoding/storage/header paths.

- [ ] **Step 1: Write failing `@workspace/api` transport tests against a local HTTP server**

The test server records headers. Assert:

```javascript
const api = createApiClient({
  baseURL,
  cookieHeader: "cw.session=server-only",
  getCsrfToken: () => "A".repeat(43),
});

await api.get("/safe");
assert.equal(requests[0].headers.cookie, "cw.session=server-only");
assert.equal(requests[0].headers["x-csrf-token"], undefined);

await api.post("/unsafe", { ok: true });
assert.equal(requests[1].headers["x-csrf-token"], "A".repeat(43));
assert.equal(api.defaults.withCredentials, true);
```

Add `"test": "node --experimental-strip-types src/run-client-tests.mjs"` to `packages/api/package.json`.

- [ ] **Step 2: Run API tests and verify RED**

Run: `corepack pnpm --filter @workspace/api test`

Expected: FAIL because `cookieHeader`/`getCsrfToken` are unsupported and credentials are not enabled.

- [ ] **Step 3: Replace access-token injection with cookie/CSRF options**

Use this public contract:

```typescript
export interface CreateApiClientOptions {
  baseURL: string;
  cookieHeader?: string;
  getCsrfToken?: () => string | undefined;
  onUnauthorized?: () => void;
  getUnauthorizedErrorForSsr?: () => Error;
  onServerError?: () => void;
}
```

Create Axios with `withCredentials: true`. Set `Cookie` only from `cookieHeader` on the server. For `post`, `put`, `patch`, and `delete`, call `getCsrfToken()` and set `x-csrf-token` only when it returns a non-empty bounded string. Delete `getAccessToken` and all Authorization injection.

- [ ] **Step 4: Add failing frontend source/behavior assertions**

In `run-auth-tests.mjs`, read `AuthContext.tsx`, `api.ts`, `SocketContext.tsx`, `ChatContext.tsx`, `canSSRAuth.ts`, `canSSRAdmin.ts`, and `canSSRGuest.ts`. Assert:

```javascript
for (const source of browserAuthSources) {
  assert.doesNotMatch(source, /cw\.token/);
  assert.doesNotMatch(source, /Bearer\s|headers\.common\.Authorization/);
  assert.doesNotMatch(source, /jwtDecode|getModulePermissionsFromToken/);
}
assert.match(apiSource, /withCredentials|getCsrfToken/);
assert.match(authContextSource, /api\.delete\("\/user\/session"\)/);
assert.match(authContextSource, /api\.post\("\/user\/session\/refresh"\)/);
```

Keep existing permission/access behavior tests driven by user objects. Remove only token-decoding assertions.

- [ ] **Step 5: Run frontend auth tests and verify RED**

Run: `corepack pnpm --filter @workspace/app test:auth`

Expected: FAIL on the current `cw.token`, Bearer, and JWT-decode paths.

- [ ] **Step 6: Implement browser and SSR transport**

In `setupAPIClient(ctx, onUnauthorized)` choose:

```typescript
const baseURL = ctx
  ? process.env.API_INTERNAL_URL || "http://127.0.0.1:3010"
  : process.env.NEXT_PUBLIC_API_URL || "/api";
const cookieHeader = ctx?.req?.headers?.cookie;
const getCsrfToken = () => readBrowserCookie("cw.csrf");
```

`readBrowserCookie()` uses `document.cookie` only in the browser, returns only `cw.csrf`, and bounds the decoded value to 256 characters.

In `AuthContext`:

- validate login/refresh as user data without `token`;
- set user directly from the login response;
- initialize from `GET /user/me`;
- implement `refreshSession()` with `POST /user/session/refresh`;
- implement logout with `DELETE /user/session` before clearing user/query state;
- make unauthorized `signOut()` clear only in-memory state/cache and redirect;
- remove cookie creation/destruction, JWT decoding, and Authorization defaults.

`canSSRAuth` may check only the presence of `cw.session` on the server before invoking the wrapped page; it never reads JWT content. `canSSRGuest` always renders the guest page so a stale HttpOnly cookie cannot cause a loop. `canSSRAdmin` calls `/user/me` with `setupAPIClient(ctx)` and evaluates the returned user object with `canAccessAdministration()`.

- [ ] **Step 7: Remove residual chat/socket browser token handling without expanding legacy infrastructure**

Configure Socket.IO as:

```typescript
io(socketClientConfig.url, { withCredentials: true });
```

Replace raw ChatContext Bearer headers with `credentials: "include"`; for its raw unsafe fetch calls, read `cw.csrf` and set only `x-csrf-token`. Existing `chatService` calls inherit the shared Axios client. Because the stable deployment excludes the legacy chat API and sockets are disabled by default, do not introduce a new legacy session store or gateway route in this issue; disabled/unrouted legacy calls fail closed.

Remove `getPermissionFromToken()`, the three obsolete auth utility files, and the now-unused `jwt-decode` dependency.

- [ ] **Step 8: Regenerate only the lockfile for dependency removal**

Run:

```powershell
corepack pnpm install --lockfile-only --offline
corepack pnpm security:pnpm
git diff -- app/package.json pnpm-lock.yaml
```

Expected: only `jwt-decode` removal and deterministic lockfile pruning; no package addition, exotic source, lifecycle approval, or version change.

- [ ] **Step 9: Verify frontend/API GREEN**

Run:

```powershell
corepack pnpm --filter @workspace/api test
corepack pnpm --filter @workspace/api typecheck
corepack pnpm --filter @workspace/app test:auth
corepack pnpm --filter @workspace/app test:socket
corepack pnpm --filter @workspace/app typecheck
```

Expected: PASS and the source scan finds no browser access JWT path.

- [ ] **Step 10: Commit client migration**

```powershell
git add -- packages/api/src/run-client-tests.mjs packages/api/src/client.ts packages/api/package.json app/src/shared/services/api.ts app/src/context/AuthContext.tsx app/src/context/SocketContext.tsx app/src/context/ChatContext.tsx app/src/modules/auth/utils/canSSRAuth.ts app/src/modules/auth/utils/canSSRGuest.ts app/src/modules/auth/utils/canSSRAdmin.ts app/src/modules/auth/utils/permissions.ts app/src/modules/auth/run-auth-tests.mjs app/src/modules/auth/utils/authCookie.ts app/src/modules/auth/utils/authHeaders.ts app/src/modules/auth/utils/sessionToken.ts app/package.json pnpm-lock.yaml
git commit -m "feat(web): migrate auth client to HttpOnly sessions"
```

---

### Task 5: Smoke contract, environment, deployment, and rollback documentation

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.vps.yml`
- Modify: `docker-compose.vps.slot-develop.yml`
- Modify: `docker-compose.vps.slot-test-develop.yml`
- Modify: `docker-compose.vps.slot-test-staging.yml`
- Modify: `docs/vps-deploy.md`
- Create: `docs/security/http-only-session-rollout.md`
- Modify: `scripts/all-services-smoke.mjs`
- Modify: `scripts/all-services-smoke.manifest.mjs`
- Modify: `scripts/check-smoke-spec-coverage.mjs` only if the new OpenAPI operations require an explicit coverage rule.

**Interfaces:**
- Consumes: Tasks 2-4 final HTTP contract and cookie names.
- Produces: production env contract, bounded compatibility runbook, cookie-aware smoke state, refresh/logout coverage, and rollback instructions.

- [ ] **Step 1: Add failing smoke coverage entries for refresh and logout**

Add manifest operations:

```javascript
op({
  service: "user-service",
  method: "POST",
  path: "/user/session/refresh",
  action: "userSessionRefresh",
  target: "gateway",
  auth: "session",
}),
op({
  service: "user-service",
  method: "DELETE",
  path: "/user/session",
  action: "userSessionLogout",
  target: "gateway",
  auth: "session",
}),
```

Add an explicit negative missing-CSRF operation expecting `403`. Run `corepack pnpm smoke:coverage`.

Expected: FAIL until the smoke runner recognizes the operations and the OpenAPI paths align.

- [ ] **Step 2: Implement a bounded cookie jar in the smoke runner**

Store only the two named cookies and never print values:

```javascript
function captureSessionCookies(headers) {
  const values = headers.getSetCookie?.() ?? [];
  for (const value of values) {
    const [pair] = value.split(";", 1);
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    if (name === "cw.session" || name === "cw.csrf") {
      state.sessionCookies[name] = pair.slice(separator + 1);
    }
  }
}

function getSessionHeaders(method) {
  const headers = {
    Cookie: `cw.session=${state.sessionCookies["cw.session"]}; cw.csrf=${state.sessionCookies["cw.csrf"]}`,
  };
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) {
    headers["x-csrf-token"] = state.sessionCookies["cw.csrf"];
  }
  return headers;
}
```

Make login success depend on both cookies plus token-free user JSON, not `data.token`. Use `auth: "session"` for `userMe`, refresh, one representative mutation, and logout. Keep explicit Bearer compatibility smoke cases separate and enabled only when the gateway compatibility env is intentionally true.

- [ ] **Step 3: Document exact env and production values**

Replace the client cookie flag with server configuration:

```dotenv
NEXT_PUBLIC_API_URL=/api
API_INTERNAL_URL=http://gateway:3010
AUTH_COOKIE_SECURE=true
GATEWAY_ALLOWED_ORIGINS=https://useoffice.com.br
GATEWAY_BEARER_AUTH_COMPATIBILITY=false
```

Pass `AUTH_COOKIE_SECURE` to gateway and user-service containers. Do not expose it as a `NEXT_PUBLIC_*` build argument.

The rollout runbook must state:

- cookie attributes and one-day expiry;
- login, `/user/me`, refresh, representative mutation, and logout probes;
- structured event names and safe reason categories;
- a maximum 14-day Bearer window with a concrete removal date set during deployment;
- no CSRF disablement during rollback;
- no restoration of `cw.token`;
- how to verify production CORS for `https://useoffice.com.br`, `null`, and a hostile origin.

- [ ] **Step 4: Verify smoke/docs GREEN**

Run:

```powershell
corepack pnpm smoke:coverage
corepack pnpm security:compose
corepack pnpm security:pnpm
rg -n "cw\.token|NEXT_PUBLIC_AUTH_COOKIE_SECURE" .env.example docker-compose.vps*.yml docs scripts/all-services-smoke.mjs scripts/all-services-smoke.manifest.mjs
```

Expected: coverage/security commands pass and the final `rg` has no active legacy contract reference.

- [ ] **Step 5: Commit contract and runbook**

```powershell
git add -- .env.example docker-compose.vps.yml docker-compose.vps.slot-develop.yml docker-compose.vps.slot-test-develop.yml docker-compose.vps.slot-test-staging.yml docs/vps-deploy.md docs/security/http-only-session-rollout.md scripts/all-services-smoke.mjs scripts/all-services-smoke.manifest.mjs scripts/check-smoke-spec-coverage.mjs
git commit -m "docs(auth): define cookie session rollout and smoke"
```

---

### Task 6: Browser proof, regression fixtures, release gate, review, and PR evidence

**Files:**
- Create: `app/src/modules/auth/run-auth-session-browser-smoke.mjs`
- Modify: `app/package.json`
- Modify: `app/src/modules/auth/run-auth-sidebar-browser-smoke.mjs`
- Modify: `app/src/shared/run-field-help-browser-smoke.mjs`
- Modify: `app/src/shared/run-me-password-update-browser-smoke.mjs`
- Modify: `app/src/modules/certificates/run-certificate-info-modal-browser-smoke.mjs`
- Modify: `app/src/modules/organizations/run-organization-modal-smoke.mjs`
- Create: `docs/superpowers/evidence/2026-08-20-issue-772-login.png`
- Create: `docs/superpowers/evidence/2026-08-20-issue-772-authenticated-session.png`

**Interfaces:**
- Consumes: the complete server/client contract and all prior tests.
- Produces: browser evidence, updated HttpOnly fixtures, full validation record, reviewed commits, pushed branch, and a draft PR to `develop`.

- [ ] **Step 1: Update existing browser fixtures to model HttpOnly auth**

Replace each `cw.token` fixture with:

```javascript
{
  httpOnly: true,
  name: "cw.session",
  sameSite: "Lax",
  url: baseUrl,
  value: "opaque-test-session",
}
```

For fixtures that perform unsafe API requests, add a readable `cw.csrf` cookie and assert the captured request has the matching `x-csrf-token`. API route mocks continue returning user/module data; they no longer depend on decoding a fake JWT.

- [ ] **Step 2: Write a browser smoke that initially fails on the old contract**

Add the exact package script before running it:

```json
"test:auth-session": "node src/modules/auth/run-auth-session-browser-smoke.mjs"
```

The new script starts the existing Next dev server pattern, intercepts login and `/user/me`, and verifies:

```javascript
await page.goto("/login");
await page.screenshot({ path: loginEvidencePath, fullPage: true });
await page.getByLabel("Login").fill("browser.smoke");
await page.getByLabel("Senha").fill("not-a-real-password");
await page.getByRole("button", { name: "Entrar no Office" }).click();
await page.waitForURL(/\/dashboard$/);

assert.doesNotMatch(await page.evaluate(() => document.cookie), /cw\.session=/);
assert.equal(await page.evaluate(() => localStorage.getItem("cw.token")), null);
assert.equal(await page.evaluate(() => sessionStorage.getItem("cw.token")), null);
await page.screenshot({ path: authenticatedEvidencePath, fullPage: true });
```

The login mock sets `cw.session` with `HttpOnly` and `cw.csrf` without it; its JSON contains user data and no token. Capture no cookie values in console output or screenshot text.

- [ ] **Step 3: Run the new browser smoke and verify RED, then update implementation/mocks minimally**

Run: `corepack pnpm --filter @workspace/app test:auth-session`

Expected initial failure: old login expects a JSON token or `document.cookie` exposes `cw.token`. Make only the fixture/script integration changes required for the already-implemented contract, then rerun until PASS.

- [ ] **Step 4: Run scoped and release validation**

Run in this order and record exact results:

```powershell
corepack pnpm --filter @workspace/shared test
corepack pnpm --filter @workspace/user-service test
corepack pnpm --filter @workspace/gateway test
corepack pnpm --filter @workspace/api test
corepack pnpm --filter @workspace/app test:auth
corepack pnpm --filter @workspace/app test:socket
corepack pnpm --filter @workspace/app test:auth-session
corepack pnpm --filter @workspace/shared typecheck
corepack pnpm --filter @workspace/user-service typecheck
corepack pnpm --filter @workspace/gateway typecheck
corepack pnpm --filter @workspace/api typecheck
corepack pnpm --filter @workspace/app typecheck
corepack pnpm --filter @workspace/shared build
corepack pnpm --filter @workspace/user-service build
corepack pnpm --filter @workspace/gateway build
corepack pnpm --filter @workspace/api build
corepack pnpm --filter @workspace/app build
corepack pnpm check
corepack pnpm smoke:coverage
corepack pnpm security:compose
corepack pnpm security:pnpm
corepack pnpm audit:ci
```

Classify any failure as introduced code, base branch, dependency advisory, or environment. Do not silently bypass a failing check.

- [ ] **Step 5: Run the final secret/token and diff audit**

```powershell
rg -n "cw\.token|localStorage.*token|sessionStorage.*token|parseCookies\(|setCookie\(|headers\.common\.Authorization|getAccessToken|jwtDecode" app/src packages/api/src
rg -n "console\.(log|error).*token|logger\..*token|password.*console|csrf.*console" app/src packages shared/src services scripts
git diff --check origin/develop...HEAD
git diff --stat origin/develop...HEAD
git status --short
```

Expected: no browser access-token path, no secret-bearing logs, no whitespace errors, and only issue #772 files plus its spec/plan/evidence.

- [ ] **Step 6: Update local Graphify context or execute the documented fallback**

If graphs exist after dependency bootstrap, run:

```powershell
corepack pnpm graphify:update:ui
corepack pnpm graphify:update:services
```

Do not stage `graphify-out/`. If graphs remain unavailable, record the fallback evidence: `git diff --stat`, complete diff review, call-site `rg`, and scoped validation from Steps 4-5.

- [ ] **Step 7: Commit browser evidence**

```powershell
git add -- app/src/modules/auth/run-auth-session-browser-smoke.mjs app/package.json app/src/modules/auth/run-auth-sidebar-browser-smoke.mjs app/src/shared/run-field-help-browser-smoke.mjs app/src/shared/run-me-password-update-browser-smoke.mjs app/src/modules/certificates/run-certificate-info-modal-browser-smoke.mjs app/src/modules/organizations/run-organization-modal-smoke.mjs
git add -f -- docs/superpowers/evidence/2026-08-20-issue-772-login.png docs/superpowers/evidence/2026-08-20-issue-772-authenticated-session.png docs/superpowers/plans/2026-08-20-issue-772-http-only-session-csrf.md
git commit -m "test(auth): prove HttpOnly browser session flow"
```

- [ ] **Step 8: Request independent code review and fix all Critical/Important findings**

Use `superpowers:requesting-code-review` with:

```text
DESCRIPTION: Issue #772 migration from browser JWT to HttpOnly cookie sessions with session-bound CSRF.
PLAN_OR_REQUIREMENTS: docs/superpowers/plans/2026-08-20-issue-772-http-only-session-csrf.md and issue #772 acceptance criteria.
BASE_SHA: git merge-base origin/develop HEAD
HEAD_SHA: git rev-parse HEAD
```

The reviewer must check authentication bypass, CSRF binding/replay, cookie attributes, stale-session loops, proxy leakage, CORS, log leakage, SSR, smoke accuracy, and test validity. Fix Critical and Important findings with a failing regression test first, rerun the focused command, and request a scoped re-review.

- [ ] **Step 9: Perform the performance pass**

Record this expected result unless evidence contradicts it:

```markdown
## Performance Review

### Before / After Complexity
- Current: one JWT verification plus one session-version validation request per protected gateway call.
- Proposed: the same O(1) verification/validation plus bounded cookie parsing and one SHA-256/timing-safe comparison on unsafe cookie calls.

### Dominant Bottleneck
- The existing user-service session validation network/database lookup, not CSRF hashing.

### Proposed Change
- Parse bounded headers once per request; add no cache, queue, new database query, or unbounded concurrency.

### Tradeoff / Proof
- Constant bounded CPU/memory overhead; focused gateway tests and production build prove integration correctness.
```

Do not add caching or concurrency machinery without measured evidence.

- [ ] **Step 10: Synchronize with `develop` and repeat the focused gate**

```powershell
git fetch origin develop
git merge --no-edit origin/develop
git diff --check
rg -n "^(<<<<<<<|=======|>>>>>>>)" --glob '!pnpm-lock.yaml' .
corepack pnpm --filter @workspace/user-service test -- src/test/authService.test.ts src/test/auth.routes.test.ts
corepack pnpm --filter @workspace/gateway test -- src/test/authenticate.test.ts src/test/csrfProtection.test.ts
corepack pnpm --filter @workspace/app test:auth
corepack pnpm smoke:coverage
```

Expected: no conflicts/markers and all focused tests pass on the actual PR base.

- [ ] **Step 11: Push the branch and open one draft PR to `develop`**

Inspect status, diff, identity, auth, labels, milestone, and existing PR first. Push the exact branch; use `--no-verify` only if a hook fails for a recorded base/advisory reason, as authorized by the user.

Create an English draft PR with reviewer `eedsilva`, existing labels `security`, `backend`, `frontend`, and `hardening`, milestone `Security Hardening - Q3 2026`, and `Closes #772`. Include:

```markdown
## Summary
- Moves browser authentication to server-issued HttpOnly cookies.
- Enforces session-bound CSRF and explicit credentialed CORS.
- Preserves bounded Bearer rollout compatibility and session-version revocation.

## Validation
- Exact commands and pass/fail totals from Step 4.
- Dependency/security audit result and any classified advisory.
- Browser assertion that `document.cookie` cannot read `cw.session`.

## Related Issues
- Closes #772

## Milestone
- Security Hardening - Q3 2026

## Screenshots
- Login before authentication: committed evidence image.
- Authenticated navigation using HttpOnly session: committed evidence image.

## Signature
Signed-off-by: Davifs-dev <davifs133@hotmail.com>
```

Verify the PR head/base, `mergeable`, reviewer, labels, milestone, screenshot links, and checks. Do not merge.
