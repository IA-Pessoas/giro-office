# TI Password Credential Deactivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add administrator-only, tenant-safe soft deactivation for TI password credentials, with
atomic domain audit fields, inactive-operation guards, status filtering, safe frontend cache
eviction, gateway activity classification, and aligned OpenAPI/smoke coverage.

**Architecture:** Extend `PasswordTecnologia` with an additive lifecycle shape protected by a
database check constraint and an organization/status/local index. The TI service remains the
security boundary: Zod validates HTTP input, `TiPasswordService` performs safe tenant-scoped
lookups and conditional mutations, and the gateway records complementary request activity without
the reason. The React Query frontend exposes only administrator controls, removes revealed detail
cache on deactivation, and treats inactive credentials as inspectable metadata rather than usable
secrets.

**Tech Stack:** PostgreSQL and Prisma 7.4.1; TypeScript 5.3.3/ESM; Express 4; Zod 3.24; Vitest 4;
React 18; Next.js 16; TanStack React Query 5; Radix `Dialog`; pnpm 9.15; Biome 2.4.5.

## Global Constraints

- Implement soft deactivation only; do not add hard delete, purge, activate, or reactivate paths.
- Restrict password list, reveal, create, update, status filtering, and deactivation to
  `TiPermissionLevel.Admin`; use `access.isAdmin` in the frontend.
- Persist `active`, `deactivated_at`, `deactivated_by_user_id`, and `deactivation_reason` in one
  tenant-scoped conditional mutation.
- Keep `deactivated_by_user_id` as a scalar string with no relation or foreign key.
- Accept `status=active|inactive|all`; omission means `active`.
- Require a strict `{ reason: string }` body, trim it, and enforce 1–500 characters after trimming.
- Return `409 Conflict` before decrypting or mutating an inactive credential.
- Scope every credential lookup and mutation by `organization_id`; cross-tenant IDs return the same
  `404` as missing IDs.
- Never include `password` in list, create, update, or deactivate responses, lifecycle audit fields,
  gateway metadata, logs, toasts, or errors.
- The domain lifecycle columns are the authoritative audit; gateway audit remains complementary and
  best-effort.
- The UI must state that deactivation in Giro Office does not revoke, rotate, or change the
  external-system credential.
- Preserve active credential create, reveal, update, search, ordering, and pagination behavior.
- Do not edit generated Prisma clients by hand.
- Use double quotes, two-space indentation, trailing commas, semicolons, and local ESM imports with
  `.js` extensions in services.
- Do not repair the recorded baseline failures as part of issue #507.

---

## Approved Specification

Implement against
`docs/superpowers/specs/2026-07-27-issue-507-ti-password-deactivation-design.md`.
When this plan and the specification differ, stop and update this plan from the approved
specification before changing functional code.

## File and Responsibility Map

| File | Responsibility |
| --- | --- |
| `infra/prisma/schema.prisma` | Prisma lifecycle fields and the organization/status/local index. |
| `infra/prisma/migrations/20260727103000_add_ti_password_deactivation/migration.sql` | Additive columns, database lifecycle invariant, and physical index. |
| `services/ti-service/src/test/tiPasswordMigration.test.ts` | Static migration/schema contract, including default, constraint, index, and absence of an actor FK. |
| `services/ti-service/src/schemas/tiPassword.schemas.ts` | Named status union and strict deactivation request validation. |
| `services/ti-service/src/test/tiPassword.schemas.test.ts` | Focused Zod tests that do not depend on the blocked route-test bootstrap. |
| `services/ti-service/src/services/tiPasswordService.ts` | Shared list predicate, safe lookup, inactive guards, conditional update, and atomic deactivation. |
| `services/ti-service/src/test/tiPasswordService.test.ts` | Unit coverage for tenant boundaries, filters, no-decrypt guards, races, and safe output. |
| `services/ti-service/src/routes/tiPassword.routes.ts` | Admin middleware, HTTP parsing, and the new action route. |
| `services/ti-service/src/test/tiPassword.routes.test.ts` | HTTP authorization, validation, envelopes, and argument forwarding. |
| `services/ti-service/src/test/tiServiceTestUtils.ts` | Existing app factory used by route/OpenAPI tests; verify only because password route fixtures are local to `tiPassword.routes.test.ts`. |
| `services/ti-service/src/openapi/spec.ts` | Public list filter, deactivation schema/path, and `409` responses. |
| `services/ti-service/src/test/app.test.ts` | OpenAPI operation inventory and detailed contract assertions. |
| `services/gateway/src/audit/activityCatalog.ts` | Explicit semantic activity for deactivation before generic password CRUD classification. |
| `services/gateway/src/test/activityCatalog.test.ts` | Exact visible action copy and query/identifier secrecy. |
| `services/gateway/src/test/activityCatalogCoverage.test.ts` | Existing public-operation classification coverage; no production change expected. |
| `services/gateway/src/app.routes.test.ts` | End-to-end gateway audit fields, TI target, and absence of body reason in metadata. |
| `app/src/modules/ti/types/passwords.ts` | Lifecycle metadata, exact status union/filter, and deactivation payload. |
| `app/src/modules/ti/services/tiService.contract.ts` | Centralized `/ti/passwords/{id}/deactivate` template. |
| `app/src/modules/ti/services/tiPasswordsService.ts` | Typed deactivation request and status-aware list request. |
| `app/src/modules/ti/hooks/useTiPasswords.ts` | Typed filters, deactivation mutation, exact detail eviction, and list invalidation. |
| `app/src/modules/ti/components/TiPasswordsTab.tsx` | Admin-only fetch/render, status filter/badges, dialog/reason/warning, inactive action suppression, and local reveal cleanup. |
| `app/src/modules/ti/run-ti-tests.mjs` | Source-contract tests for types, endpoint, hook cache behavior, UI state, warning, and inactive guards. |
| `scripts/generated/ti-service.smoke.mjs` | OpenAPI-derived operation metadata, including admin-only password operations and deactivation. |
| `scripts/all-services-smoke.mjs` | Fixture-backed good deactivation and repeated-deactivation `409` handlers. |
| `services/ti-service/README.md` | Public password list/deactivation examples and soft-only warning. |

No change is required in `services/gateway/src/config/serviceRegistry.ts`: `/ti` already resolves to
`ti-service`. No change is required in the generic gateway audit middleware: it already captures
actor, organization, outcome, timestamps, and `routeTarget` without request bodies. No change is
required in `scripts/apply-tecnologia-v1-current-tenant.mjs`: its password insert omits lifecycle
columns and therefore uses the database's `active = true` default.

## Interface Map

The tasks below must use these exact names so each commit composes with the next one:

```ts
// services/ti-service/src/schemas/tiPassword.schemas.ts
export const tiPasswordStatusFilterSchema = z.enum(["active", "inactive", "all"]);
export type TiPasswordStatusFilter = z.infer<typeof tiPasswordStatusFilterSchema>;
export const deactivateTiPasswordBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export type DeactivateTiPasswordBody = z.infer<typeof deactivateTiPasswordBodySchema>;

// services/ti-service/src/services/tiPasswordService.ts
async list(context: TiAuthContext, query: ListTiPasswordsQuery): Promise<TiPasswordListResult>;
async getById(context: TiAuthContext, id: string): Promise<unknown>;
async update(
  context: TiAuthContext,
  id: string,
  body: UpdateTiPasswordBody,
): Promise<unknown>;
async deactivate(
  context: TiAuthContext,
  id: string,
  body: DeactivateTiPasswordBody,
): Promise<unknown>;

// app/src/modules/ti/types/passwords.ts
export type TiPasswordStatusFilter = "active" | "inactive" | "all";
export type TiPasswordListFilters = TiListFilters & {
  status?: TiPasswordStatusFilter;
};
export interface TiPasswordDeactivatePayload {
  reason: string;
}

// app/src/modules/ti/services/tiPasswordsService.ts
async deactivatePassword(
  id: TiId,
  payload: TiPasswordDeactivatePayload,
): Promise<TiPasswordListItem>;

// app/src/modules/ti/hooks/useTiPasswords.ts
export type TiPasswordDeactivateVariables = {
  id: TiId;
  payload: TiPasswordDeactivatePayload;
};
export function useDeactivateTiPasswordMutation(): UseMutationResult<
  TiPasswordListItem,
  Error,
  TiPasswordDeactivateVariables
>;
```

## Baseline Blockers and Result Interpretation

The following failures were present before functional implementation and must be reported
separately from issue #507 regressions:

- `pnpm --filter @workspace/app test:ti` exits non-zero at the contradictory test
  `ti password reveal copy uses copy icon without toggling visibility`, which expects direct
  `navigator.clipboard.writeText(secret)` while an earlier test requires `copySensitiveText`.
- `pnpm --filter @workspace/app typecheck` cannot resolve `@workspace/api` from five shared app
  files in this worktree.
- `pnpm --filter @workspace/ti-service test` has 12 route suites blocked before discovery because
  `@workspace/shared/logger` cannot be resolved.
- `pnpm --filter @workspace/ti-service typecheck` invokes Prisma generation and needs a syntactically
  valid `DATABASE_URL`.
- `pnpm smoke:coverage` is green at baseline with `335/335` operations.

For app TDD, inspect the named new `[PASS]`/`[FAIL]` lines even though the known clipboard case keeps
the aggregate command red. For TI service route TDD, record the feature-level expected failure or
pass after the shared logger blocker is cleared; do not change the logger/package setup in this
issue. Pure schema, migration, and service test files can run directly and provide independent
RED/PASS evidence.

### Task 1: Add the Prisma Lifecycle, Constraint, and Index

**Files:**

- Modify: `infra/prisma/schema.prisma:1889`
- Create: `infra/prisma/migrations/20260727103000_add_ti_password_deactivation/migration.sql`
- Create: `services/ti-service/src/test/tiPasswordMigration.test.ts`

**Responsibilities:**

- Add the four lifecycle fields without changing ciphertext or existing relations.
- Enforce exactly the active-null-audit or inactive-complete-audit shape.
- Preserve legacy inserts through `active DEFAULT true`.
- Create the approved index with exact name and column order.
- Prove there is no foreign key from the scalar actor field.

**Interfaces:**

- Consumes: the existing mapped table `"tecnologia.passwords_users"` and model
  `PasswordTecnologia`.
- Produces: generated Prisma fields `active: boolean`, `deactivated_at: Date | null`,
  `deactivated_by_user_id: string | null`, and `deactivation_reason: string | null`.

- [ ] **Step 1: Write the failing migration contract test**

Create `services/ti-service/src/test/tiPasswordMigration.test.ts`:

```ts
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const schema = readFileSync(
  new URL("../../../../infra/prisma/schema.prisma", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../../../infra/prisma/migrations/20260727103000_add_ti_password_deactivation/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("TI password deactivation migration", () => {
  it("models lifecycle fields and the approved index", () => {
    const model = schema.slice(
      schema.indexOf("model PasswordTecnologia"),
      schema.indexOf("model ExtensionsTecnologia"),
    );

    expect(model).toMatch(/active\s+Boolean\s+@default\(true\)/);
    expect(model).toMatch(/deactivated_at\s+DateTime\?/);
    expect(model).toMatch(/deactivated_by_user_id\s+String\?/);
    expect(model).toMatch(/deactivation_reason\s+String\?/);
    expect(model).toContain(
      '@@index([organization_id, active, local], map: "idx_tecnologia_passwords_org_active_local")',
    );
    expect(model).not.toMatch(/deactivated_by_user\s+User/);
  });

  it("adds an additive default, complete invariant, and physical index", () => {
    expect(migration).toContain('"active" BOOLEAN NOT NULL DEFAULT true');
    expect(migration).toContain('"deactivated_at" TIMESTAMP(3)');
    expect(migration).toContain('"deactivated_by_user_id" TEXT');
    expect(migration).toContain('"deactivation_reason" TEXT');
    expect(migration).toContain('CONSTRAINT "ck_tecnologia_passwords_deactivation"');
    expect(migration).toContain('"deactivation_reason" = btrim("deactivation_reason")');
    expect(migration).toContain(
      'length("deactivation_reason") BETWEEN 1 AND 500',
    );
    expect(migration).toContain(
      'CREATE INDEX "idx_tecnologia_passwords_org_active_local"',
    );
    expect(migration).toContain(
      'ON "tecnologia.passwords_users"("organization_id", "active", "local")',
    );
    expect(migration).not.toMatch(/FOREIGN KEY \("deactivated_by_user_id"\)/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiPasswordMigration.test.ts
```

Expected: FAIL because the migration file does not exist and the Prisma model has no lifecycle
fields.

- [ ] **Step 3: Add the Prisma fields and index**

Insert these fields and index in `PasswordTecnologia`:

```prisma
  active                 Boolean      @default(true)
  deactivated_at         DateTime?
  deactivated_by_user_id String?
  deactivation_reason    String?

  @@index([organization_id, active, local], map: "idx_tecnologia_passwords_org_active_local")
```

Do not add a `User` relation for `deactivated_by_user_id`.

- [ ] **Step 4: Add the exact additive SQL migration**

Create
`infra/prisma/migrations/20260727103000_add_ti_password_deactivation/migration.sql`:

```sql
ALTER TABLE "tecnologia.passwords_users"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deactivated_at" TIMESTAMP(3),
  ADD COLUMN "deactivated_by_user_id" TEXT,
  ADD COLUMN "deactivation_reason" TEXT;

ALTER TABLE "tecnologia.passwords_users"
  ADD CONSTRAINT "ck_tecnologia_passwords_deactivation"
  CHECK (
    (
      "active" = true
      AND "deactivated_at" IS NULL
      AND "deactivated_by_user_id" IS NULL
      AND "deactivation_reason" IS NULL
    )
    OR
    (
      "active" = false
      AND "deactivated_at" IS NOT NULL
      AND "deactivated_by_user_id" IS NOT NULL
      AND "deactivation_reason" IS NOT NULL
      AND "deactivation_reason" = btrim("deactivation_reason")
      AND length("deactivation_reason") BETWEEN 1 AND 500
    )
  );

CREATE INDEX "idx_tecnologia_passwords_org_active_local"
  ON "tecnologia.passwords_users"("organization_id", "active", "local");
```

- [ ] **Step 5: Regenerate Prisma and run focused validation**

Run:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/giro_office pnpm --filter @workspace/ti-service prisma:generate
pnpm --filter @workspace/ti-service exec vitest run src/test/tiPasswordMigration.test.ts
```

Expected: Prisma generation succeeds without connecting to the database; the focused test PASSes.
Generated clients remain ignored and are not staged.

- [ ] **Step 6: Commit the lifecycle**

```bash
git add infra/prisma/schema.prisma infra/prisma/migrations/20260727103000_add_ti_password_deactivation/migration.sql services/ti-service/src/test/tiPasswordMigration.test.ts
git commit -m "feat: add TI password deactivation lifecycle"
```

### Task 2: Define Status and Deactivation Input Schemas

**Files:**

- Modify: `services/ti-service/src/schemas/tiPassword.schemas.ts:1-39`
- Create: `services/ti-service/src/test/tiPassword.schemas.test.ts`

**Responsibilities:**

- Export one named Zod enum and inferred union for list status.
- Keep status optional at the HTTP schema boundary; the service applies the active default.
- Trim and validate a strict reason body.
- Keep lifecycle fields absent from create/update input schemas.

**Interfaces:**

- Consumes: `zNonEmptyText` and existing pagination/query schemas.
- Produces: `TiPasswordStatusFilter`, `DeactivateTiPasswordBody`,
  `tiPasswordStatusFilterSchema`, and `deactivateTiPasswordBodySchema`.

- [ ] **Step 1: Write focused failing schema tests**

Create `services/ti-service/src/test/tiPassword.schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  deactivateTiPasswordBodySchema,
  listTiPasswordsQuerySchema,
  updateTiPasswordBodySchema,
} from "../schemas/tiPassword.schemas.js";

describe("TI password schemas", () => {
  it.each(["active", "inactive", "all"] as const)("accepts status=%s", (status) => {
    expect(listTiPasswordsQuerySchema.parse({ status })).toMatchObject({ status });
  });

  it("rejects an unknown status", () => {
    expect(listTiPasswordsQuerySchema.safeParse({ status: "deleted" }).success).toBe(false);
  });

  it("trims a valid deactivation reason", () => {
    expect(deactivateTiPasswordBodySchema.parse({ reason: "  Vendor retired  " })).toEqual({
      reason: "Vendor retired",
    });
  });

  it.each([
    {},
    { reason: "" },
    { reason: "   " },
    { reason: 42 },
    { reason: "x".repeat(501) },
    { reason: "Vendor retired", active: false },
  ])("rejects invalid deactivation body %#", (body) => {
    expect(deactivateTiPasswordBodySchema.safeParse(body).success).toBe(false);
  });

  it.each(["active", "deactivated_at", "deactivated_by_user_id", "deactivation_reason"])(
    "keeps server-owned field %s out of generic update",
    (field) => {
      expect(updateTiPasswordBodySchema.safeParse({ [field]: false }).success).toBe(false);
    },
  );
});
```

- [ ] **Step 2: Run the schema tests to verify they fail**

Run:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiPassword.schemas.test.ts
```

Expected: FAIL at import because the new schema exports do not exist.

- [ ] **Step 3: Implement the schemas and inferred types**

Add the status schema to the list query and the strict body schema:

```ts
export const tiPasswordStatusFilterSchema = z.enum(["active", "inactive", "all"]);

export const listTiPasswordsQuerySchema = paginationQuerySchema
  .merge(
    z.object({
      user_id: z.string().uuid({ message: "Usuario invalido." }).optional(),
      local: z.string().trim().optional(),
      search: z.string().trim().optional(),
      status: tiPasswordStatusFilterSchema.optional(),
    }),
  )
  .strict();

export const deactivateTiPasswordBodySchema = z
  .object({
    reason: z
      .string({ required_error: "Motivo da inativacao e obrigatorio." })
      .trim()
      .min(1, "Motivo da inativacao e obrigatorio.")
      .max(500, "Motivo da inativacao deve ter no maximo 500 caracteres."),
  })
  .strict();

export type TiPasswordStatusFilter = z.infer<typeof tiPasswordStatusFilterSchema>;
export type DeactivateTiPasswordBody = z.infer<typeof deactivateTiPasswordBodySchema>;
```

Leave `createTiPasswordBodySchema` and `updateTiPasswordBodySchema` restricted to `local`,
`user_id`, `password`, and `notes`.

- [ ] **Step 4: Run the focused schema suite**

Run:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiPassword.schemas.test.ts
```

Expected: PASS for accepted status values, strict trimmed reason validation, and server-owned field
rejection.

- [ ] **Step 5: Commit the HTTP input contract**

```bash
git add services/ti-service/src/schemas/tiPassword.schemas.ts services/ti-service/src/test/tiPassword.schemas.test.ts
git commit -m "feat: validate TI password deactivation inputs"
```

### Task 3: Enforce Service Filtering, Safe Lookup, Guards, and Atomic Deactivation

**Files:**

- Modify: `services/ti-service/src/services/tiPasswordService.ts:1-205`
- Modify: `services/ti-service/src/test/tiPasswordService.test.ts:1-219`

**Responsibilities:**

- Make `buildPasswordWhere` the shared predicate for count and rows.
- Default omitted status to active and implement inactive/all.
- Replace the update pre-check through decrypting `getById` with one private safe lookup.
- Reject inactive reveal before decrypt and inactive update before linked-user validation/encrypt.
- Make update and deactivate final writes tenant-scoped and conditional on `active: true`.
- Store actor, one server timestamp, and reason atomically; never overwrite a winner's audit.

**Interfaces:**

- Consumes: `DeactivateTiPasswordBody`, `TiPasswordStatusFilter`, `TiAuthContext`, Prisma
  `updateMany`, and the four generated lifecycle fields from Task 1.
- Produces: `TiPasswordService.deactivate(context, id, body): Promise<unknown>` and list results
  carrying safe lifecycle metadata.

- [ ] **Step 1: Extend the service fixture and write failing list filter tests**

Import `afterEach` from Vitest and restore method spies between cases:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
```

Add lifecycle fields to `passwordRecord()`:

```ts
active: true,
deactivated_at: null,
deactivated_by_user_id: null,
deactivation_reason: null,
```

Update the existing `list omite password dos resultados` assertions so both Prisma calls expect
the new default predicate:

```ts
expect(prisma.passwordTecnologia.count).toHaveBeenCalledWith({
  where: { organization_id: organizationId, active: true },
});
expect(prisma.passwordTecnologia.findMany).toHaveBeenCalledWith(
  expect.objectContaining({
    where: { organization_id: organizationId, active: true },
  }),
);
```

Add this table-driven test:

```ts
it.each([
  [undefined, { active: true }],
  ["active", { active: true }],
  ["inactive", { active: false }],
  ["all", {}],
] as const)("list maps status %s into one shared predicate", async (status, statusWhere) => {
  const prisma = {
    passwordTecnologia: {
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => [passwordRecord()]),
    },
  };
  const service = new TiPasswordService(prisma as never, encryption);

  await service.list(context, {
    ...(status ? { status } : {}),
    search: "vpn",
    page: 1,
    page_size: 20,
  });

  const expectedWhere = expect.objectContaining({
    organization_id: organizationId,
    ...statusWhere,
    OR: expect.any(Array),
  });
  expect(prisma.passwordTecnologia.count).toHaveBeenCalledWith({ where: expectedWhere });
  expect(prisma.passwordTecnologia.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expectedWhere, skip: 0, take: 20 }),
  );
});
```

- [ ] **Step 2: Write failing inactive reveal and update tests**

Add:

```ts
it("rejects inactive reveal before decrypt", async () => {
  const prisma = {
    passwordTecnologia: {
      findFirst: vi.fn(async () => ({ ...passwordRecord(), active: false })),
    },
  };
  const decrypt = vi.spyOn(encryption, "decrypt");
  const service = new TiPasswordService(prisma as never, encryption);

  await expect(service.getById(context, passwordId)).rejects.toMatchObject({ statusCode: 409 });
  expect(decrypt).not.toHaveBeenCalled();
});

it("rejects inactive update before user validation, encryption, or mutation", async () => {
  const prisma = {
    user: { findFirst: vi.fn() },
    passwordTecnologia: {
      findFirst: vi.fn(async () => ({ ...passwordRecord(), active: false })),
      updateMany: vi.fn(),
    },
  };
  const encrypt = vi.spyOn(encryption, "encrypt");
  const service = new TiPasswordService(prisma as never, encryption);

  await expect(
    service.update(context, passwordId, { user_id: userId, password: "replacement" }),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(prisma.user.findFirst).not.toHaveBeenCalled();
  expect(encrypt).not.toHaveBeenCalled();
  expect(prisma.passwordTecnologia.updateMany).not.toHaveBeenCalled();
});

it("uses tenant and active state in the final update predicate", async () => {
  const prisma = {
    passwordTecnologia: {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(passwordRecord())
        .mockResolvedValueOnce({ ...passwordRecord(), notes: "Updated" }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  const service = new TiPasswordService(prisma as never, encryption);

  await service.update(context, passwordId, { notes: "Updated" });

  expect(prisma.passwordTecnologia.updateMany).toHaveBeenCalledWith({
    where: { id: passwordId, organization_id: organizationId, active: true },
    data: { notes: "Updated" },
  });
});

it("returns conflict when deactivation wins the update race", async () => {
  const prisma = {
    passwordTecnologia: {
      findFirst: vi.fn(async () => passwordRecord()),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  const service = new TiPasswordService(prisma as never, encryption);

  await expect(service.update(context, passwordId, { notes: "Too late" })).rejects.toMatchObject({
    statusCode: 409,
  });
});
```

Replace the obsolete service test `getById omite password para permissao menor que admin`.
Authorization is now expressed by `TiPermissionLevel.Admin` on every HTTP route, while the service
method has one reveal contract. Use this tenant-safe not-found test instead:

```ts
it("getById returns not found when the tenant-scoped safe lookup misses", async () => {
  const prisma = {
    passwordTecnologia: {
      findFirst: vi.fn(async () => null),
    },
  };
  const service = new TiPasswordService(prisma as never, encryption);

  await expect(service.getById(context, passwordId)).rejects.toMatchObject({
    statusCode: 404,
  });
  expect(prisma.passwordTecnologia.findFirst).toHaveBeenCalledWith({
    where: { id: passwordId, organization_id: organizationId },
    include: expect.any(Object),
  });
});
```

Adapt the existing `update valida usuario informado na mesma organizacao` mock to the new
conditional interface:

```ts
passwordTecnologia: {
  findFirst: vi
    .fn()
    .mockResolvedValueOnce(passwordRecord())
    .mockResolvedValueOnce({ ...passwordRecord(), notes: "Atualizado" }),
  updateMany: vi.fn(async () => ({ count: 1 })),
},
```

Keep its same-organization user assertion and add:

```ts
expect(prisma.passwordTecnologia.updateMany).toHaveBeenCalledWith({
  where: { id: passwordId, organization_id: organizationId, active: true },
  data: { user_id: userId, notes: "Atualizado" },
});
```

- [ ] **Step 3: Write failing deactivation and race tests**

Add:

```ts
it("atomically deactivates with tenant, actor, one timestamp, and safe output", async () => {
  const deactivatedAt = new Date("2026-07-27T12:00:00.000Z");
  vi.useFakeTimers();
  vi.setSystemTime(deactivatedAt);
  const inactive = {
    ...passwordRecord(),
    active: false,
    deactivated_at: deactivatedAt,
    deactivated_by_user_id: userId,
    deactivation_reason: "Vendor retired",
  };
  const prisma = {
    passwordTecnologia: {
      findFirst: vi.fn().mockResolvedValueOnce(passwordRecord()).mockResolvedValueOnce(inactive),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  const decrypt = vi.spyOn(encryption, "decrypt");
  const service = new TiPasswordService(prisma as never, encryption);

  const result = (await service.deactivate(context, passwordId, {
    reason: "Vendor retired",
  })) as Record<string, unknown>;

  expect(prisma.passwordTecnologia.updateMany).toHaveBeenCalledWith({
    where: { id: passwordId, organization_id: organizationId, active: true },
    data: {
      active: false,
      deactivated_at: deactivatedAt,
      deactivated_by_user_id: userId,
      deactivation_reason: "Vendor retired",
    },
  });
  expect(result).toMatchObject({
    id: passwordId,
    active: false,
    deactivated_by_user_id: userId,
    deactivation_reason: "Vendor retired",
  });
  expect(result).not.toHaveProperty("password");
  expect(decrypt).not.toHaveBeenCalled();
});

it("rejects repeated deactivation without touching the original audit", async () => {
  const prisma = {
    passwordTecnologia: {
      findFirst: vi.fn(async () => ({
        ...passwordRecord(),
        active: false,
        deactivated_at: new Date("2026-07-27T12:00:00.000Z"),
        deactivated_by_user_id: "first-admin",
        deactivation_reason: "First reason",
      })),
      updateMany: vi.fn(),
    },
  };
  const service = new TiPasswordService(prisma as never, encryption);

  await expect(
    service.deactivate(context, passwordId, { reason: "Second reason" }),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(prisma.passwordTecnologia.updateMany).not.toHaveBeenCalled();
});

it("rejects a losing concurrent deactivation without a second write", async () => {
  const prisma = {
    passwordTecnologia: {
      findFirst: vi.fn(async () => passwordRecord()),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  const service = new TiPasswordService(prisma as never, encryption);

  await expect(
    service.deactivate(context, passwordId, { reason: "Losing reason" }),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(prisma.passwordTecnologia.updateMany).toHaveBeenCalledTimes(1);
});

it("returns the same not-found result for cross-tenant or missing IDs", async () => {
  const prisma = {
    passwordTecnologia: {
      findFirst: vi.fn(async () => null),
    },
  };
  const service = new TiPasswordService(prisma as never, encryption);

  await expect(
    service.deactivate(context, passwordId, { reason: "Not accessible" }),
  ).rejects.toMatchObject({ statusCode: 404 });
  expect(prisma.passwordTecnologia.findFirst).toHaveBeenCalledWith({
    where: { id: passwordId, organization_id: organizationId },
    include: expect.any(Object),
  });
});

it("wraps an unexpected deactivation database failure without exposing a secret", async () => {
  const prisma = {
    passwordTecnologia: {
      findFirst: vi.fn(async () => passwordRecord()),
      updateMany: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    },
  };
  const decrypt = vi.spyOn(encryption, "decrypt");
  const service = new TiPasswordService(prisma as never, encryption);

  await expect(
    service.deactivate(context, passwordId, { reason: "Vendor retired" }),
  ).rejects.toMatchObject({
    statusCode: 500,
    message: "Erro ao inativar senha de TI.",
  });
  expect(decrypt).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run the service tests to verify the feature failures**

Run:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiPasswordService.test.ts
```

Expected: FAIL because status is not applied, inactive records are decrypted/updated, `updateMany`
is not used, and `deactivate` does not exist.

- [ ] **Step 5: Implement the shared status predicate**

Import the new types and add:

```ts
function getActivePredicate(
  status: TiPasswordStatusFilter | undefined,
): Prisma.PasswordTecnologiaWhereInput {
  if (status === "all") {
    return {};
  }

  return { active: status !== "inactive" };
}
```

Merge it once in `buildPasswordWhere`:

```ts
return {
  organization_id: context.organizationId,
  ...getActivePredicate(query.status),
  ...(query.user_id ? { user_id: query.user_id } : {}),
  ...(search
    ? {
        OR: [
          { local: { contains: search, mode: "insensitive" } },
          { notes: { contains: search, mode: "insensitive" } },
          {
            user: {
              is: {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { full_name: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      }
    : {}),
};
```

- [ ] **Step 6: Add the safe lookup and inactive assertion**

Add private methods:

```ts
private async findPasswordOrThrow(
  context: TiAuthContext,
  id: string,
): Promise<PasswordRecord> {
  const password = await this.prisma.passwordTecnologia.findFirst({
    where: { id, organization_id: context.organizationId },
    include: SAFE_USER_INCLUDE,
  });

  if (!password) {
    throw new ServiceError(404, "Senha de TI nao encontrada.");
  }

  return withoutNestedUserPassword(password as PasswordRecord);
}

private assertActive(password: PasswordRecord): void {
  if (password.active === false) {
    throw new ServiceError(409, "Senha de TI inativa.");
  }
}
```

Replace reveal with:

```ts
async getById(context: TiAuthContext, id: string): Promise<unknown> {
  const password = await this.findPasswordOrThrow(context, id);
  this.assertActive(password);

  return this.withDecryptedPassword(password);
}
```

Authorization remains in the admin route middleware; do not preserve the old lower-permission branch
that returned safe metadata.

- [ ] **Step 7: Replace update with a safe conditional mutation**

Use:

```ts
async update(context: TiAuthContext, id: string, body: UpdateTiPasswordBody): Promise<unknown> {
  try {
    const current = await this.findPasswordOrThrow(context, id);
    this.assertActive(current);

    if (body.user_id) {
      await this.ensureUser(context.organizationId, body.user_id);
    }

    const data = {
      ...body,
      ...(body.password ? { password: this.encryption.encrypt(body.password) } : {}),
    };
    const updateResult = await this.prisma.passwordTecnologia.updateMany({
      where: { id, organization_id: context.organizationId, active: true },
      data,
    });

    if (updateResult.count === 0) {
      throw new ServiceError(409, "Senha de TI inativa.");
    }

    return withoutPassword(await this.findPasswordOrThrow(context, id));
  } catch (err: unknown) {
    logError("Erro ao atualizar senha de TI", { err });
    if (err instanceof ServiceError) throw err;
    throw new ServiceError(500, "Erro ao atualizar senha de TI.", err);
  }
}
```

- [ ] **Step 8: Implement atomic deactivation**

Add:

```ts
async deactivate(
  context: TiAuthContext,
  id: string,
  body: DeactivateTiPasswordBody,
): Promise<unknown> {
  try {
    const current = await this.findPasswordOrThrow(context, id);
    this.assertActive(current);
    const deactivatedAt = new Date();

    const updateResult = await this.prisma.passwordTecnologia.updateMany({
      where: { id, organization_id: context.organizationId, active: true },
      data: {
        active: false,
        deactivated_at: deactivatedAt,
        deactivated_by_user_id: context.userId,
        deactivation_reason: body.reason,
      },
    });

    if (updateResult.count === 0) {
      throw new ServiceError(409, "Senha de TI ja esta inativa.");
    }

    return withoutPassword(await this.findPasswordOrThrow(context, id));
  } catch (err: unknown) {
    logError("Erro ao inativar senha de TI", { err });
    if (err instanceof ServiceError) throw err;
    throw new ServiceError(500, "Erro ao inativar senha de TI.", err);
  }
}
```

Do not call gateway audit, decrypt, or a second lifecycle mutation from this method.

- [ ] **Step 9: Run the focused service suite**

Run:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiPasswordService.test.ts
```

Expected: PASS. Verify the tests observe the same `where` object shape for count/findMany, no
decrypt on inactive reveal/deactivate, no encryption on an already inactive update, and zero-count
race conflicts.

- [ ] **Step 10: Commit the service rules**

```bash
git add services/ti-service/src/services/tiPasswordService.ts services/ti-service/src/test/tiPasswordService.test.ts
git commit -m "feat: enforce TI password deactivation rules"
```

### Task 4: Expose Admin-Only Routes and OpenAPI

**Files:**

- Modify: `services/ti-service/src/routes/tiPassword.routes.ts:1-116`
- Modify: `services/ti-service/src/test/tiPassword.routes.test.ts:1-155`
- Verify only: `services/ti-service/src/test/tiServiceTestUtils.ts`
- Modify: `services/ti-service/src/openapi/spec.ts:90-105,362-389,1246-1291`
- Modify: `services/ti-service/src/test/app.test.ts:36-68,180-245`

**Responsibilities:**

- Make every password route explicitly admin-only.
- Parse UUID/body/query before service invocation.
- Return a standard `200` success envelope from the deactivation route.
- Document status default and all deactivation/error contracts.
- Keep delete/reactivate absent from router and OpenAPI.

**Interfaces:**

- Consumes: `deactivateTiPasswordBodySchema` and
  `TiPasswordService.deactivate(context, id, body)` from Tasks 2–3.
- Produces: `POST /ti/passwords/:id/deactivate` and OpenAPI
  `POST /ti/passwords/{id}/deactivate` with operation ID `deactivateTiPassword`.

- [ ] **Step 1: Extend the route mock and write failing HTTP tests**

Add `updateMany` and lifecycle fields to `createPasswordPrismaMock()`:

```ts
updateMany: vi.fn(async () => ({ count: 1 })),
```

Make `findFirst` return a record with:

```ts
active: true,
deactivated_at: null,
deactivated_by_user_id: null,
deactivation_reason: null,
```

Add route tests:

```ts
it("POST /ti/passwords/:id/deactivate requires authentication", async () => {
  const response = await request(createTestApp(createPasswordPrismaMock()))
    .post(`/ti/passwords/${passwordId}/deactivate`)
    .send({ reason: "Vendor retired" });

  expect(response.status).toBe(401);
  expect(response.body).toMatchObject({ success: false, code: "UNAUTHORIZED" });
});

it("POST /ti/passwords/:id/deactivate requires admin permission", async () => {
  const response = await request(createTestApp(createPasswordPrismaMock()))
    .post(`/ti/passwords/${passwordId}/deactivate`)
    .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
    .send({ reason: "Vendor retired" });

  expect(response.status).toBe(403);
  expect(response.body).toMatchObject({ success: false, code: "FORBIDDEN" });
});

it("POST /ti/passwords/:id/deactivate trims reason and returns safe lifecycle data", async () => {
  const prisma = createPasswordPrismaMock();
  prisma.passwordTecnologia.findFirst = vi
    .fn()
    .mockResolvedValueOnce(passwordRecord())
    .mockResolvedValueOnce({
      ...passwordRecord(),
      active: false,
      deactivated_at: new Date("2026-07-27T12:00:00.000Z"),
      deactivated_by_user_id: userId,
      deactivation_reason: "Vendor retired",
    });

  const response = await request(createTestApp(prisma))
    .post(`/ti/passwords/${passwordId}/deactivate`)
    .set(gatewayHeaders(TI_ADMIN_PERMISSION))
    .send({ reason: "  Vendor retired  " });

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    success: true,
    data: {
      id: passwordId,
      active: false,
      deactivated_by_user_id: userId,
      deactivation_reason: "Vendor retired",
    },
  });
  expect(response.body.data).not.toHaveProperty("password");
  expect(prisma.passwordTecnologia.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ deactivation_reason: "Vendor retired" }),
    }),
  );
});

it.each([
  ["not-a-uuid", { reason: "Vendor retired" }],
  [passwordId, {}],
  [passwordId, { reason: "   " }],
  [passwordId, { reason: 42 }],
  [passwordId, { reason: "x".repeat(501) }],
  [passwordId, { reason: "Vendor retired", active: false }],
])("rejects invalid deactivation request %#", async (id, body) => {
  const response = await request(createTestApp(createPasswordPrismaMock()))
    .post(`/ti/passwords/${id}/deactivate`)
    .set(gatewayHeaders(TI_ADMIN_PERMISSION))
    .send(body);

  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({ success: false, code: "BAD_REQUEST" });
});

it.each(["active", "inactive", "all"])("GET list accepts status=%s", async (status) => {
  const response = await request(createTestApp(createPasswordPrismaMock()))
    .get("/ti/passwords/list")
    .query({ status })
    .set(gatewayHeaders(TI_ADMIN_PERMISSION));

  expect(response.status).toBe(200);
});

it("GET list rejects an unknown status", async () => {
  const response = await request(createTestApp(createPasswordPrismaMock()))
    .get("/ti/passwords/list")
    .query({ status: "deleted" })
    .set(gatewayHeaders(TI_ADMIN_PERMISSION));

  expect(response.status).toBe(400);
});
```

Add a local inactive fixture:

```ts
function inactivePasswordRecord() {
  return {
    ...passwordRecord(),
    active: false,
    deactivated_at: new Date("2026-07-27T12:00:00.000Z"),
    deactivated_by_user_id: userId,
    deactivation_reason: "Vendor retired",
  };
}
```

Add the three inactive HTTP guards:

```ts
it("GET /ti/passwords/:id serializes inactive conflict", async () => {
  const prisma = createPasswordPrismaMock();
  prisma.passwordTecnologia.findFirst = vi.fn(async () => inactivePasswordRecord());

  const response = await request(createTestApp(prisma))
    .get(`/ti/passwords/${passwordId}`)
    .set(gatewayHeaders(TI_ADMIN_PERMISSION));

  expect(response.status).toBe(409);
  expect(response.body).toMatchObject({ success: false, code: "CONFLICT" });
});

it("PATCH /ti/passwords/:id serializes inactive conflict", async () => {
  const prisma = createPasswordPrismaMock();
  prisma.passwordTecnologia.findFirst = vi.fn(async () => inactivePasswordRecord());

  const response = await request(createTestApp(prisma))
    .patch(`/ti/passwords/${passwordId}`)
    .set(gatewayHeaders(TI_ADMIN_PERMISSION))
    .send({ notes: "Too late" });

  expect(response.status).toBe(409);
  expect(response.body).toMatchObject({ success: false, code: "CONFLICT" });
  expect(prisma.passwordTecnologia.updateMany).not.toHaveBeenCalled();
});

it("POST /ti/passwords/:id/deactivate serializes repeated conflict", async () => {
  const prisma = createPasswordPrismaMock();
  prisma.passwordTecnologia.findFirst = vi.fn(async () => inactivePasswordRecord());

  const response = await request(createTestApp(prisma))
    .post(`/ti/passwords/${passwordId}/deactivate`)
    .set(gatewayHeaders(TI_ADMIN_PERMISSION))
    .send({ reason: "Second reason" });

  expect(response.status).toBe(409);
  expect(response.body).toMatchObject({ success: false, code: "CONFLICT" });
  expect(prisma.passwordTecnologia.updateMany).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the route file to establish the current blocker and feature RED**

Run:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiPassword.routes.test.ts
```

Expected in the recorded worktree: BLOCKED before test discovery by
`@workspace/shared/logger`. Once that baseline dependency resolves, expected feature result is FAIL
because the action route/status schema/admin middleware changes do not exist. Do not alter the
shared logger to make this task green.

- [ ] **Step 3: Add the route and make every password operation explicitly admin-only**

Import `deactivateTiPasswordBodySchema`. Change list and reveal middleware from
`TiPermissionLevel.Technician` to `TiPermissionLevel.Admin`. Add:

```ts
router.post(
  "/:id/deactivate",
  requireTiPermission(TiPermissionLevel.Admin),
  async (request, response, next) => {
    try {
      const context = getContext(request);
      const params = parseWithZod(tiPasswordIdParamsSchema, request.params);
      const body = parseWithZod(deactivateTiPasswordBodySchema, request.body);
      const result = await service.deactivate(context, params.id, body);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao inativar senha de TI", { err });
      next(err);
    }
  },
);
```

Do not add a `DELETE` route, an activate route, or a generic lifecycle update.

- [ ] **Step 4: Write failing OpenAPI inventory assertions**

Add to `tiPublicOpenApiOperations`:

```ts
"/ti/passwords/{id}/deactivate": ["post"],
```

Inside the OpenAPI test, add:

```ts
const passwordStatusParameter =
  response.body.paths["/ti/passwords/list"].get.parameters.find(
    (parameter: { name?: string }) => parameter.name === "status",
  );
expect(passwordStatusParameter).toMatchObject({
  in: "query",
  required: false,
  schema: {
    type: "string",
    enum: ["active", "inactive", "all"],
    default: "active",
  },
});

expect(response.body.components.schemas.TiPasswordDeactivateInput).toEqual({
  type: "object",
  required: ["reason"],
  properties: {
    reason: { type: "string", minLength: 1, maxLength: 500 },
  },
  additionalProperties: false,
});

expect(
  response.body.paths["/ti/passwords/{id}/deactivate"].post.responses,
).toEqual(
  expect.objectContaining({
    "200": expect.any(Object),
    "400": expect.any(Object),
    "401": expect.any(Object),
    "403": expect.any(Object),
    "404": expect.any(Object),
    "409": expect.any(Object),
  }),
);
expect(response.body.paths["/ti/passwords/{id}"].get.responses).toHaveProperty("409");
expect(response.body.paths["/ti/passwords/{id}"].patch.responses).toHaveProperty("409");
expect(response.body.paths["/ti/passwords/{id}"]).not.toHaveProperty("delete");
```

- [ ] **Step 5: Run the OpenAPI test to verify it fails**

Run:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/app.test.ts
```

Expected in the recorded worktree: BLOCKED by `@workspace/shared/logger`; after that baseline is
available, FAIL because the new path/schema/filter/default/`409` responses are absent.

- [ ] **Step 6: Implement the OpenAPI contract**

Add the schema:

```ts
TiPasswordDeactivateInput: {
  type: "object",
  required: ["reason"],
  properties: {
    reason: { type: "string", minLength: 1, maxLength: 500 },
  },
  additionalProperties: false,
},
```

Add the status parameter to list:

```ts
{
  ...enumQueryParameter(
    "status",
    "Filtro de status da credencial",
    ["active", "inactive", "all"],
  ),
  schema: {
    type: "string",
    enum: ["active", "inactive", "all"],
    default: "active",
  },
},
```

Add `409` to reveal and update errors, then add:

```ts
"/ti/passwords/{id}/deactivate": {
  post: publicTiOperation({
    operationId: "deactivateTiPassword",
    tags: ["TI Passwords"],
    summary: "Inativa uma senha de TI",
    parameters: [pathIdParameter("Senha de TI")],
    requestBody: jsonRequestBody("#/components/schemas/TiPasswordDeactivateInput"),
    successDescription: "Senha de TI inativada",
    errors: [400, 401, 403, 404, 409],
  }),
},
```

- [ ] **Step 7: Re-run the focused HTTP/OpenAPI checks**

Run:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiPassword.routes.test.ts src/test/app.test.ts
```

Expected after the recorded logger blocker is resolved: PASS, including explicit admin middleware,
strict reason validation, `409` envelopes, path inventory, and no delete operation. While the
blocker remains, record it without changing issue #507 code.

- [ ] **Step 8: Commit the route and contract**

```bash
git add services/ti-service/src/routes/tiPassword.routes.ts services/ti-service/src/test/tiPassword.routes.test.ts services/ti-service/src/openapi/spec.ts services/ti-service/src/test/app.test.ts
git commit -m "feat: expose TI password deactivation endpoint"
```

### Task 5: Classify Complementary Gateway Audit Activity

**Files:**

- Modify: `services/gateway/src/audit/activityCatalog.ts:52-414`
- Modify: `services/gateway/src/test/activityCatalog.test.ts:5-112`
- Modify: `services/gateway/src/app.routes.test.ts:1988-2035`
- Verify only: `services/gateway/src/test/activityCatalogCoverage.test.ts`

**Responsibilities:**

- Override generic TI password POST classification with an explicit deactivation action.
- Preserve route target, actor, organization, outcome, and timestamps through existing middleware.
- Prove the reason/body never enters generic gateway metadata.
- Preserve best-effort audit behavior when ingestion is unavailable.

**Interfaces:**

- Consumes: normalized public path classification before `RESOURCE_RULES`.
- Produces: `{ action: "inativou", item: "uma credencial de TI" }` for
  `POST /ti/passwords/:id/deactivate`.

- [ ] **Step 1: Write the failing catalog test**

Add the case to the existing `it.each` table:

```ts
[
  "POST",
  "/ti/passwords/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/deactivate",
  "inativou",
  "uma credencial de TI",
],
```

Add a secrecy assertion:

```ts
it("classifies TI password deactivation without exposing identifiers or reason", () => {
  const serialized = JSON.stringify(
    describeActivity(
      "POST",
      "/ti/passwords/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/deactivate?reason=secret",
    ),
  );

  expect(serialized).toContain("inativou");
  expect(serialized).not.toContain("9a68a809");
  expect(serialized).not.toContain("reason");
  expect(serialized).not.toContain("secret");
});
```

- [ ] **Step 2: Run the catalog test to verify the generic classification fails**

Run:

```bash
pnpm --filter @workspace/gateway exec vitest run src/test/activityCatalog.test.ts
```

Expected: FAIL because the generic password resource rule does not recognize the nested action as
CRUD and cannot return the approved action.

- [ ] **Step 3: Add the explicit rule before resource matching**

Add to `EXPLICIT_RULES`:

```ts
{
  methods: ["POST"],
  pattern: /^\/ti\/passwords\/[^/]+\/deactivate$/,
  description: { action: "inativou", item: "uma credencial de TI" },
},
```

Do not add reason/body extraction to `middlewares/audit.ts`.

- [ ] **Step 4: Add an issue-specific gateway audit integration test**

Add a test using the existing `createToken`, `startAuditIngestServer`, `startServer`, and
`waitForRecords` helpers:

```ts
it("records TI password deactivation as complementary metadata-only audit", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  const auditService = await startAuditIngestServer();
  const upstream = createServer(async (request, response) => {
    await readJsonBody(request);
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { active: false } }));
  });
  const tiServiceUrl = await startServer(upstream);
  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: auditService.url,
      tiServiceUrl,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(
      `${gatewayUrl}/ti/passwords/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/deactivate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "Contains private administrative context" }),
      },
    );

    expect(response.status).toBe(200);
    await waitForRecords(auditService.records, 1);

    expect(auditService.records[0]).toMatchObject({
      organizationId: "org-1",
      userId: "user-1",
      method: "POST",
      outcome: "success",
      action: "inativou",
      referring: "uma credencial de TI",
      metadata: {
        routeTarget: "ti-service",
        activityVisible: true,
      },
    });
    expect(auditService.records[0]?.createdAt).toEqual(expect.any(String));
    expect(auditService.records[0]?.finishedAt).toEqual(expect.any(String));
    expect(JSON.stringify(auditService.records[0])).not.toContain(
      "Contains private administrative context",
    );
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
    await stopServer(auditService.server);
  }
});
```

The existing test `does not change responses when audit ingestion fails` remains the best-effort
audit regression and must continue to pass.

- [ ] **Step 5: Run gateway audit tests**

Run:

```bash
pnpm --filter @workspace/gateway exec vitest run src/test/activityCatalog.test.ts src/test/activityCatalogCoverage.test.ts src/app.routes.test.ts
```

Expected: PASS. The activity is explicit, every public operation remains classified, TI routes map
to `ti-service`, the domain response is independent of audit ingestion, and no reason is serialized.

- [ ] **Step 6: Commit the complementary audit**

```bash
git add services/gateway/src/audit/activityCatalog.ts services/gateway/src/test/activityCatalog.test.ts services/gateway/src/app.routes.test.ts
git commit -m "feat: audit TI password deactivation activity"
```

### Task 6: Add the Typed Frontend Contract and Cache-Safe Mutation

**Files:**

- Modify: `app/src/modules/ti/types/passwords.ts:1-43`
- Modify: `app/src/modules/ti/services/tiService.contract.ts:35-39`
- Modify: `app/src/modules/ti/services/tiPasswordsService.ts:1-59`
- Modify: `app/src/modules/ti/hooks/useTiPasswords.ts:1-105`
- Modify: `app/src/modules/ti/run-ti-tests.mjs:414-580`

**Responsibilities:**

- Type lifecycle fields and the exact status union.
- Centralize the action path.
- Send only `{ reason }`.
- Remove the exact secret-detail cache and invalidate every password list after success.
- Never put the safe deactivation response into the secret-detail cache.

**Interfaces:**

- Consumes: existing `TiId`, `TiListFilters`, `TiEnvelope`, `buildTiPath`, and password query keys.
- Produces: frontend interfaces from the global Interface Map and
  `TI_ENDPOINTS.passwords.deactivate`.

- [ ] **Step 1: Write failing frontend contract tests**

Add named tests to `run-ti-tests.mjs`:

```js
await runTest("ti password deactivation exposes typed lifecycle contract", async () => {
  const typesSource = await readModuleSource("types/passwords.ts");

  assert.match(typesSource, /export type TiPasswordStatusFilter = "active" \| "inactive" \| "all"/);
  assert.match(typesSource, /export type TiPasswordListFilters = TiListFilters &/);
  assert.match(typesSource, /active: boolean/);
  assert.match(typesSource, /deactivated_at\?: string \| null/);
  assert.match(typesSource, /deactivated_by_user_id\?: TiId \| null/);
  assert.match(typesSource, /deactivation_reason\?: string \| null/);
  assert.match(typesSource, /export interface TiPasswordDeactivatePayload/);
  assert.match(typesSource, /reason: string/);
});

await runTest("ti password deactivation uses the centralized endpoint and safe payload", async () => {
  const contractSource = await readModuleSource("services/tiService.contract.ts");
  const serviceSource = await readModuleSource("services/tiPasswordsService.ts");

  assert.match(contractSource, /deactivate: "\/ti\/passwords\/\{id\}\/deactivate"/);
  assert.match(serviceSource, /async deactivatePassword\(/);
  assert.match(
    serviceSource,
    /api\.post<TiEnvelope<TiPasswordListItem>>\(\s*buildTiPath\(TI_ENDPOINTS\.passwords\.deactivate, id\),\s*payload/,
  );
  assert.doesNotMatch(serviceSource, /deactivatePassword[\s\S]*setQueryData/);
});

await runTest("ti password deactivation mutation evicts detail and invalidates lists", async () => {
  const hookSource = await readModuleSource("hooks/useTiPasswords.ts");

  assert.match(hookSource, /export function useDeactivateTiPasswordMutation/);
  assert.match(
    hookSource,
    /queryClient\.removeQueries\(\{\s*queryKey: tiQueryKeys\.passwords\.detail\(variables\.id\),\s*exact: true,?\s*\}\)/,
  );
  assert.match(
    hookSource,
    /queryClient\.invalidateQueries\(\{\s*queryKey: tiQueryKeys\.passwords\.all\(\),?\s*\}\)/,
  );
  assert.doesNotMatch(hookSource, /setQueryData\(\s*tiQueryKeys\.passwords\.detail/);
});
```

- [ ] **Step 2: Run the app contract suite to verify the new tests fail**

Run:

```bash
pnpm --filter @workspace/app test:ti
```

Expected feature signal: the three new named tests FAIL because types, endpoint, service method, and
mutation are absent. The command also retains the separate known clipboard failure.

- [ ] **Step 3: Add the frontend types**

Update the import and interfaces:

```ts
import type { TiId, TiListFilters, TiStatus } from "./common";

export type TiPasswordStatusFilter = "active" | "inactive" | "all";

export type TiPasswordListFilters = TiListFilters & {
  status?: TiPasswordStatusFilter;
};

export interface TiPasswordListItem {
  id: TiId;
  local?: string | null;
  user_id?: TiId | null;
  notes?: string | null;
  status?: TiStatus | boolean;
  active: boolean;
  deactivated_at?: string | null;
  deactivated_by_user_id?: TiId | null;
  deactivation_reason?: string | null;
  user?: TiPasswordUser | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TiPasswordDeactivatePayload {
  reason: string;
}
```

Do not add lifecycle fields to create or update payloads.

- [ ] **Step 4: Add the endpoint and service method**

Add:

```ts
passwords: {
  list: "/ti/passwords/list",
  base: "/ti/passwords",
  detail: "/ti/passwords/{id}",
  deactivate: "/ti/passwords/{id}/deactivate",
},
```

Use `TiPasswordListFilters` for `listPasswords`, then add:

```ts
async deactivatePassword(
  id: TiId,
  payload: TiPasswordDeactivatePayload,
): Promise<TiPasswordListItem> {
  const response = await api.post<TiEnvelope<TiPasswordListItem>>(
    buildTiPath(TI_ENDPOINTS.passwords.deactivate, id),
    payload,
  );

  return unwrapTiEnvelope<TiPasswordListItem>(response.data);
},
```

- [ ] **Step 5: Add the cache-safe mutation**

Export the variables type and hook:

```ts
export type TiPasswordDeactivateVariables = {
  id: TiId;
  payload: TiPasswordDeactivatePayload;
};

export function useDeactivateTiPasswordMutation(): UseMutationResult<
  TiPasswordListItem,
  Error,
  TiPasswordDeactivateVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiPasswordsService.deactivatePassword(id, payload),
    onSuccess: async (_password, variables) => {
      queryClient.removeQueries({
        queryKey: tiQueryKeys.passwords.detail(variables.id),
        exact: true,
      });
      await queryClient.invalidateQueries({ queryKey: tiQueryKeys.passwords.all() });
    },
  });
}
```

Change `useTiPasswords` and `listPasswords` parameters from `TiListFilters` to
`TiPasswordListFilters`. The existing query-key helper can continue accepting the structurally
compatible `TiListFilters`.

- [ ] **Step 6: Re-run the frontend source-contract suite**

Run:

```bash
pnpm --filter @workspace/app test:ti
```

Expected feature signal: the three new named tests PASS. The aggregate command remains non-zero only
for the recorded contradictory clipboard assertion; no new issue #507 contract test fails.

- [ ] **Step 7: Commit the frontend client**

```bash
git add app/src/modules/ti/types/passwords.ts app/src/modules/ti/services/tiService.contract.ts app/src/modules/ti/services/tiPasswordsService.ts app/src/modules/ti/hooks/useTiPasswords.ts app/src/modules/ti/run-ti-tests.mjs
git commit -m "feat: add TI password deactivation client"
```

### Task 7: Add Admin-Only Status UI, Confirmation, and Reveal Cleanup

**Files:**

- Modify: `app/src/modules/ti/components/TiPasswordsTab.tsx:1-614`
- Modify: `app/src/modules/ti/run-ti-tests.mjs:414-620`

**Responsibilities:**

- Fetch and render password administration only for `access.isAdmin`.
- Default status to active and reset page on filter changes.
- Show shared status badges and deactivation reason as safe metadata.
- Hide reveal, copy entry point, edit, and deactivate actions for inactive rows.
- Require a trimmed reason and show the external-system warning.
- Preserve dialog reason on failure and clear dialog/reveal/cache state on success.

**Interfaces:**

- Consumes: `useDeactivateTiPasswordMutation`, `TiPasswordStatusFilter`,
  `TiPasswordListFilters`, shared `StatusBadge`, `Dialog`, `TiNativeSelect`, and `TiTextarea`.
- Produces: no new cross-file interface; local state uses
  `deactivatingPassword: TiPasswordListItem | null` and `deactivationReason: string`.

- [ ] **Step 1: Write failing UI source-contract tests**

Add:

```js
await runTest("ti password administration is admin-only and defaults to active", async () => {
  const tabSource = await readModuleSource("components/TiPasswordsTab.tsx");

  assert.match(tabSource, /const canManagePasswords = access\.isAdmin/);
  assert.match(
    tabSource,
    /useState<TiPasswordListFilters>\(\{\s*status: "active",\s*page: 1,\s*page_size: PASSWORD_PAGE_SIZE/,
  );
  assert.match(tabSource, /useTiPasswords\(filters, \{ enabled: canManagePasswords \}\)/);
  assert.match(tabSource, /value: "active", label: "Ativas"/);
  assert.match(tabSource, /value: "inactive", label: "Inativas"/);
  assert.match(tabSource, /value: "all", label: "Todas"/);
  assert.match(tabSource, /page: 1/);
});

await runTest("ti password inactive rows expose metadata without secret actions", async () => {
  const tabSource = await readModuleSource("components/TiPasswordsTab.tsx");

  assert.match(tabSource, /const isActive = item\.active !== false/);
  assert.match(tabSource, /<StatusBadge/);
  assert.match(tabSource, /label: isActive \? "Ativa" : "Inativa"/);
  assert.match(tabSource, /deactivation_reason/);
  assert.match(tabSource, /isActive \? \(/);
  assert.match(tabSource, /label="Inativar"/);
  assert.doesNotMatch(tabSource, /setRevealPasswordId\(item\.id\)[\s\S]*item\.active === false/);
});

await runTest("ti password deactivation dialog requires reason and warns about external access", async () => {
  const tabSource = await readModuleSource("components/TiPasswordsTab.tsx");

  assert.match(tabSource, /const \[deactivatingPassword, setDeactivatingPassword\]/);
  assert.match(tabSource, /const \[deactivationReason, setDeactivationReason\]/);
  assert.match(tabSource, /deactivationReason\.trim\(\)/);
  assert.match(tabSource, /maxLength=\{500\}/);
  assert.match(tabSource, /Inativar credencial/);
  assert.match(
    tabSource,
    /inativar este registro no Giro Office[\s\S]*não revoga nem altera a senha no sistema externo/i,
  );
  assert.match(tabSource, /clearPasswordRevealCache\(deactivatingPassword\.id\)/);
  assert.match(tabSource, /setRevealPasswordId\(null\)/);
  assert.match(tabSource, /toast\.success\("Credencial inativada\."\)/);
});
```

- [ ] **Step 2: Run the app suite to establish feature RED**

Run:

```bash
pnpm --filter @workspace/app test:ti
```

Expected feature signal: the three new UI tests FAIL. The independent clipboard baseline failure
remains unchanged.

- [ ] **Step 3: Add imports, exact types, status options, and admin guards**

Import `CircleOff`, `StatusBadge`, `useDeactivateTiPasswordMutation`,
`TiPasswordListFilters`, and `TiPasswordStatusFilter`. Add:

```ts
const PASSWORD_STATUS_OPTIONS = [
  { value: "active", label: "Ativas" },
  { value: "inactive", label: "Inativas" },
  { value: "all", label: "Todas" },
] as const;
```

Initialize and fetch with:

```ts
const canManagePasswords = access.isAdmin;
const canRevealPasswords = access.isAdmin;
const [filters, setFilters] = useState<TiPasswordListFilters>({
  status: "active",
  page: 1,
  page_size: PASSWORD_PAGE_SIZE,
});
const passwordsQuery = useTiPasswords(filters, { enabled: canManagePasswords });
```

Update the existing test
`ti passwords tab keeps create edit flows in a dialog and searches paginated results` so its state
assertion matches `TiPasswordListFilters` and requires `status: "active"` before `page: 1`. Keep
the existing debounce, dialog, search, pagination, and shared-control assertions unchanged.

After the existing `useEffect` (so hook order remains unconditional), replace the old non-admin copy
that claimed consultation access with an early return:

```tsx
if (!canManagePasswords) {
  return (
    <TiPanel>
      <TiInlineNotice tone="warning">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Apenas administradores do módulo TI podem consultar e gerenciar credenciais.</p>
        </div>
      </TiInlineNotice>
    </TiPanel>
  );
}
```

The normal return now contains only the administrator path. Keep reveal guarded by
`canRevealPasswords`.

- [ ] **Step 4: Add filter and deactivation state handlers**

Add state and mutation:

```ts
const [deactivatingPassword, setDeactivatingPassword] =
  useState<TiPasswordListItem | null>(null);
const [deactivationReason, setDeactivationReason] = useState("");
const deactivatePasswordMutation = useDeactivateTiPasswordMutation();
const trimmedDeactivationReason = deactivationReason.trim();
```

Add filter and dialog helpers:

```ts
function setPasswordStatus(status: TiPasswordStatusFilter) {
  setFilters((current) => ({
    ...current,
    status,
    page: 1,
    page_size: PASSWORD_PAGE_SIZE,
  }));
}

function openDeactivateDialog(item: TiPasswordListItem) {
  if (item.active === false) {
    return;
  }

  setDeactivatingPassword(item);
  setDeactivationReason("");
}

function closeDeactivateDialog() {
  if (deactivatePasswordMutation.isPending) {
    return;
  }

  setDeactivatingPassword(null);
  setDeactivationReason("");
}
```

Add the success/failure flow:

```ts
async function handleDeactivatePassword() {
  if (
    !canManagePasswords ||
    !deactivatingPassword ||
    !trimmedDeactivationReason ||
    trimmedDeactivationReason.length > 500 ||
    deactivatePasswordMutation.isPending
  ) {
    return;
  }

  try {
    await deactivatePasswordMutation.mutateAsync({
      id: deactivatingPassword.id,
      payload: { reason: trimmedDeactivationReason },
    });
    clearPasswordRevealCache(deactivatingPassword.id);
    if (getId(revealPasswordId) === getId(deactivatingPassword.id)) {
      setRevealPasswordId(null);
    }
    setDeactivatingPassword(null);
    setDeactivationReason("");
    toast.success("Credencial inativada.");
  } catch (error) {
    toast.error(getMutationErrorMessage(error, "Não foi possível inativar a credencial."));
  }
}
```

The catch path must not clear `deactivatingPassword` or `deactivationReason`.

- [ ] **Step 5: Render the status filter and safe inactive rows**

Add the select beside the search input:

```tsx
<TiNativeSelect
  label="Status"
  options={PASSWORD_STATUS_OPTIONS}
  value={String(filters.status ?? "active")}
  onChange={(event) => {
    setPasswordStatus(event.target.value as TiPasswordStatusFilter);
  }}
/>
```

Within the row mapping, compute:

```ts
const isActive = item.active !== false;
```

Render the shared badge and reason:

```tsx
<StatusBadge
  config={{
    label: isActive ? "Ativa" : "Inativa",
    variant: isActive ? "success" : "neutral",
  }}
  size="sm"
/>
{!isActive && item.deactivation_reason ? (
  <span className="block max-w-xs break-words text-xs text-slate-500 dark:text-slate-400">
    Motivo: {item.deactivation_reason}
  </span>
) : null}
```

Wrap all row actions:

```tsx
{isActive ? (
  <>
    <TiTableAction
      disabled={!canRevealPasswords}
      icon={Eye}
      label="Revelar"
      onClick={() => {
        clearPasswordRevealCache(revealPasswordId);
        setRevealPasswordId(item.id);
      }}
    />
    <TiTableAction icon={Pencil} label="Editar" onClick={() => openEditForm(item)} />
    <TiTableAction
      icon={CircleOff}
      label="Inativar"
      onClick={() => openDeactivateDialog(item)}
    />
  </>
) : null}
```

Copy remains only inside a successful active reveal dialog, never in a list row.

- [ ] **Step 6: Render the shared confirmation dialog**

Add:

```tsx
<Dialog
  open={Boolean(deactivatingPassword)}
  onOpenChange={(open) => {
    if (!open) {
      closeDeactivateDialog();
    }
  }}
  title="Inativar credencial"
  description="Confirme a inativação da credencial selecionada."
  contentClassName="!w-[min(92vw,460px)] [&>header]:px-4 [&>header]:py-3"
  bodyClassName="!px-4 !py-3"
>
  <div className="space-y-3">
    <TiFieldLine
      label="Local"
      value={formatText(deactivatingPassword?.local, "Sem local")}
    />
    <TiFieldLine
      label="Usuário"
      value={deactivatingPassword ? getPasswordUserName(deactivatingPassword) : "-"}
    />
    <TiInlineNotice tone="warning">
      Inativar este registro no Giro Office não revoga nem altera a senha no sistema externo.
      Revogue ou altere a credencial na origem quando necessário.
    </TiInlineNotice>
    <TiTextarea
      label="Motivo da inativação"
      maxLength={500}
      value={deactivationReason}
      onChange={(event) => setDeactivationReason(event.target.value)}
      helperText={`${deactivationReason.length}/500`}
    />
    <div className="flex justify-end gap-2">
      <button
        type="button"
        className={tiSecondaryButtonClassName}
        disabled={deactivatePasswordMutation.isPending}
        onClick={closeDeactivateDialog}
      >
        Cancelar
      </button>
      <TiIconAction
        icon={CircleOff}
        label={
          deactivatePasswordMutation.isPending
            ? "Inativando..."
            : "Inativar credencial"
        }
        variant="primary"
        disabled={
          !trimmedDeactivationReason ||
          trimmedDeactivationReason.length > 500 ||
          deactivatePasswordMutation.isPending
        }
        onClick={() => {
          void handleDeactivatePassword();
        }}
      />
    </div>
  </div>
</Dialog>
```

Do not render the password, ciphertext, or raw mutation payload in this dialog or its toasts.

- [ ] **Step 7: Run frontend feature checks**

Run:

```bash
pnpm --filter @workspace/app test:ti
```

Expected feature signal: all issue #507 named tests PASS. The aggregate exit remains attributable
only to the recorded clipboard baseline case.

- [ ] **Step 8: Commit the UI**

```bash
git add app/src/modules/ti/components/TiPasswordsTab.tsx app/src/modules/ti/run-ti-tests.mjs
git commit -m "feat: add TI password deactivation UI"
```

### Task 8: Add Smoke Flow and Service Documentation

**Files:**

- Modify: `scripts/generated/ti-service.smoke.mjs:326-358`
- Modify: `scripts/all-services-smoke.mjs:1520-1570`
- Modify: `services/ti-service/README.md:18-39`
- Verify only: `scripts/all-services-smoke.manifest.mjs`

**Responsibilities:**

- Align generated operation metadata with admin-only password routes.
- Create a credential before deactivation and reuse its stored ID.
- Cover one successful deactivation plus repeated-deactivation `409`.
- Preserve generated unauthorized paired coverage.
- Document status filters, soft-only behavior, and external-system non-revocation.

**Interfaces:**

- Consumes: OpenAPI operation ID `deactivateTiPassword`, smoke state `tiPasswordId`, action-handler
  dispatch, and generated manifest loading.
- Produces: good action `tiPasswordDeactivate` and explicit bad action
  `tiPasswordDeactivateConflict`.

- [ ] **Step 1: Run coverage to observe the new OpenAPI gap**

Run:

```bash
pnpm smoke:coverage
```

Expected after Task 4 and before this task: FAIL because
`ti-service|POST|/ti/passwords/{id}/deactivate` has no generated good expectation.

- [ ] **Step 2: Confirm the generator discovers the new operation without overwriting fixtures**

Run:

```bash
pnpm smoke:scaffold -- --service=ti-service --default-url=http://localhost:3040 --dry-run
```

Expected: the JSON `routePlaceholders` includes
`POST /ti/passwords/{id}/deactivate`. Keep this invocation dry-run because the current scaffold
command recreates the whole service file and would discard the existing fixture-backed operation
metadata.

- [ ] **Step 3: Promote the discovered operation into deterministic generated metadata**

Change existing TI password list/get metadata from `auth: "bearer"` to
`auth: "admin-bearer"`. Insert after password patch:

```js
{
  service: "ti-service",
  method: "POST",
  path: "/ti/passwords/{id}/deactivate",
  action: "tiPasswordDeactivate",
  target: "gateway",
  auth: "admin-bearer",
},
{
  service: "ti-service",
  method: "POST",
  path: "/ti/passwords/{id}/deactivate",
  action: "tiPasswordDeactivateConflict",
  target: "gateway",
  auth: "admin-bearer",
  specOperation: false,
  expectationKind: "bad",
  expectedStatus: [409],
  expectedLabel: "inactive credential conflict",
},
```

There must remain exactly one `specOperation` good entry for the route. The manifest will continue
to generate its separate unauthorized case automatically.

- [ ] **Step 4: Add concrete smoke handlers**

Add:

```js
async tiPasswordDeactivate(op) {
  await httpRequest(op, {
    expectedStatus: [200],
    path: `/ti/passwords/${requireState("tiPasswordId")}/deactivate`,
    auth: "public",
    headers: getTiAdminHeaders(),
    json: {
      reason: "Smoke credential retired.",
    },
  });
},

async tiPasswordDeactivateConflict(op) {
  await httpRequest(op, {
    expectedStatus: [409],
    expectEnvelope: false,
    path: `/ti/passwords/${requireState("tiPasswordId")}/deactivate`,
    auth: "public",
    headers: getTiAdminHeaders(),
    json: {
      reason: "Smoke repeated deactivation.",
    },
  });
},
```

Keep handler order after create/get/patch so the owned credential remains active until the good
deactivation. Do not log or copy the created password or reason into artifacts beyond the normal
request fixture.

- [ ] **Step 5: Update the TI service README**

Add a concise section:

```markdown
## Senhas de TI

As rotas de senhas exigem permissão administrativa do módulo TI.

- `GET /ti/passwords/list` lista credenciais ativas por padrão e aceita
  `status=active|inactive|all`.
- `POST /ti/passwords/:id/deactivate` inativa uma credencial com um motivo obrigatório de até
  500 caracteres.

A inativação é apenas no Giro Office: ela não revoga, altera ou rotaciona a senha no sistema
externo. Não há rota de exclusão permanente ou reativação.
```

- [ ] **Step 6: Run smoke coverage and targeted harness checks**

Run:

```bash
pnpm smoke:coverage
pnpm harness:test
```

Expected: smoke coverage PASSes with one good and at least one bad expectation for every OpenAPI
operation; the total is greater than the baseline `335/335`. Harness tests PASS and generated
metadata remains deterministic.

- [ ] **Step 7: Commit smoke and documentation**

```bash
git add scripts/generated/ti-service.smoke.mjs scripts/all-services-smoke.mjs services/ti-service/README.md
git commit -m "test: cover TI password deactivation smoke flow"
```

### Task 9: Run Final Security and Regression Validation

**Files:**

- Verify only: all files changed in Tasks 1–8

**Responsibilities:**

- Prove each layer agrees on paths, types, authorization, status semantics, cache behavior, and
  errors.
- Separate known baseline blockers from feature regressions.
- Confirm no hard delete/reactivation or secret leakage was introduced.
- Leave a clean worktree without an empty validation commit.

**Interfaces:**

- Consumes: all interfaces and commits produced above.
- Produces: a verification report containing command, exit status, feature result, and any
  independently identified baseline blocker.

- [ ] **Step 1: Run focused backend tests that are independent of the logger blocker**

Run:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiPasswordMigration.test.ts src/test/tiPassword.schemas.test.ts src/test/tiPasswordService.test.ts
```

Expected: PASS with all lifecycle, validation, list, guard, race, tenant, and no-secret assertions.

- [ ] **Step 2: Run TI route/OpenAPI tests and classify the result**

Run:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiPassword.routes.test.ts src/test/app.test.ts
```

Expected when the shared logger package resolves: PASS. In the recorded worktree, a failure before
test discovery naming `@workspace/shared/logger` is the known baseline blocker; any discovered
issue #507 assertion failure is a regression and must be fixed before continuing.

- [ ] **Step 3: Run gateway tests**

Run:

```bash
pnpm --filter @workspace/gateway exec vitest run src/test/activityCatalog.test.ts src/test/activityCatalogCoverage.test.ts src/app.routes.test.ts
pnpm --filter @workspace/gateway typecheck
```

Expected: PASS with semantic deactivation activity, `ti-service` route target, metadata secrecy,
best-effort ingestion, and complete classification.

- [ ] **Step 4: Run frontend tests and classify the result**

Run:

```bash
pnpm --filter @workspace/app test:ti
pnpm --filter @workspace/app typecheck
```

Expected issue #507 result: every new deactivation test reports PASS. Record the existing direct
clipboard assertion and unresolved `@workspace/api` imports separately; do not change them in this
issue.

- [ ] **Step 5: Run TI service package validation with an explicit generation URL**

Run:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/giro_office pnpm --filter @workspace/ti-service typecheck
pnpm --filter @workspace/ti-service check
```

Expected: Prisma generation and TypeScript/Biome checks PASS. If the bare environment is used
instead, an undefined `DATABASE_URL` is the recorded environment blocker rather than a code
regression.

- [ ] **Step 6: Run smoke and workspace diff checks**

Run:

```bash
pnpm smoke:coverage
git diff --check
git status --short
```

Expected: complete paired smoke coverage, no whitespace errors, and no generated Prisma clients or
unrelated files in the worktree.

- [ ] **Step 7: Search for forbidden lifecycle and secret patterns**

Run:

```bash
rg -n 'DELETE /ti/passwords|/ti/passwords/.*/activate|reactivat|setQueryData\\(.*passwords\\.detail' services/ti-service app/src/modules/ti scripts
rg -n 'deactivation_reason.*(log|metadata|toast)|password.*(deactivation_reason|metadata)' services/ti-service services/gateway app/src/modules/ti
rg -n 'requireTiPermission\\(TiPermissionLevel\\.Technician\\)' services/ti-service/src/routes/tiPassword.routes.ts
```

Expected: no implementation of delete/reactivation, no detail-cache population from deactivation,
no reason/password logging or gateway metadata, and no technician middleware on password routes.
Documentation statements describing the absence of delete/reactivation are allowed.

- [ ] **Step 8: Perform an authenticated browser smoke when the local stack is available**

Verify in this order:

1. Password tab is absent or non-fetching for a non-admin profile.
2. Admin default list requests `status=active`.
3. `Inativas` and `Todas` reset pagination and display correct badges.
4. Active row opens the confirmation with local, linked user, reason, and external-system warning.
5. Blank reason cannot submit; surrounding whitespace is trimmed.
6. Successful deactivation closes matching reveal state and removes the row from the active list.
7. The inactive filter shows lifecycle metadata and no Reveal, Copy, Edit, or Deactivate action.
8. Direct inactive reveal, update, and repeated deactivate requests return `409`.
9. The database row preserves the authenticated actor, one timestamp, and reason.
10. Gateway activity says `inativou uma credencial de TI` without the reason.

Expected: all ten observations hold. If the local stack is unavailable, report this as an
environment limitation and retain the automated evidence from the earlier steps.

- [ ] **Step 9: Review commit scope**

Run:

```bash
git log --oneline --decorate -8
git diff HEAD~8..HEAD --stat
git status --short
```

Expected: eight focused implementation commits from Tasks 1–8 and a clean worktree. Do not create
an empty commit for this verification-only task and do not push without explicit authorization.

## Acceptance Trace

| Approved requirement | Implementing task |
| --- | --- |
| Existing rows active; invariant; scalar actor; index | Task 1 |
| Exact status union and strict trimmed reason | Task 2 |
| Default active list and shared count/findMany predicate | Task 3 |
| Safe lookup and inactive reveal-before-decrypt | Task 3 |
| Conditional tenant-safe update and deactivate | Task 3 |
| Original audit survives repeated/concurrent requests | Tasks 1 and 3 |
| Admin-only routes and standard errors | Task 4 |
| OpenAPI status/default/body/path/`409` alignment | Task 4 |
| Complementary semantic gateway audit without reason | Task 5 |
| Typed client, exact detail eviction, list invalidation | Task 6 |
| Admin UI filter, badge, no inactive actions | Task 7 |
| Required dialog reason and external credential warning | Task 7 |
| Good deactivation and repeated `409` smoke coverage | Task 8 |
| No hard delete/reactivation or secret leakage | Tasks 1–9 |
| Baseline failures reported independently | Task 9 |

## Execution Handoff

Plan complete and saved to
`docs/superpowers/plans/2026-07-27-issue-507-ti-password-deactivation.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — use `superpowers:subagent-driven-development`, dispatch a
   fresh worker per task, and review spec compliance and code quality between commits.
2. **Inline Execution** — use `superpowers:executing-plans`, execute tasks in order, and pause at
   the RED/PASS and commit checkpoints.

Do not start either option until the user authorizes functional implementation.
