# TI Extension Number Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept only exact four-digit TI extension numbers at the frontend and API boundaries, and stop displaying the internal extension UUID.

**Architecture:** Add a focused frontend utility for sanitization and validation, consume it in the existing controlled form, and enforce the same `^[0-9]{4}$` contract in the existing Zod route schemas. Keep UUIDs in technical contracts while removing only the visible field. Update OpenAPI to document the exact request contract.

**Tech Stack:** React 18, TypeScript, Next.js, Zod, Express, Vitest, Supertest, Node assertion runner, OpenAPI, Biome, pnpm.

## Global Constraints

- Work only in `/home/bruno/Documents/Projects/giro-office/.worktrees/issue-508`.
- Keep branch `fix/508-ti-extensions-validate-number-hide-id` based on `develop`.
- Extension numbers are strings matching exactly `^[0-9]{4}$`.
- Preserve leading zeroes such as `0007`.
- Keep UUIDs in API responses, query keys, row keys, selection state, and `/:id` routes.
- Never render the extension UUID in the operational UI.
- Do not add a database migration or dependency.
- Existing invalid rows remain readable; subsequent writes must correct their number.
- Preserve existing authentication, authorization, user assignment, pagination, and duplicate-number behavior.
- Follow TDD: observe the required failure before every production change.

---

### Task 1: Add the frontend extension-number boundary

**Files:**
- Create: `app/src/modules/ti/utils/extensionNumber.ts`
- Modify: `app/src/modules/ti/run-ti-tests.mjs:504`

**Interfaces:**
- Produces: `TI_EXTENSION_NUMBER_LENGTH: 4`
- Produces: `sanitizeTiExtensionNumber(value: string): string`
- Produces: `isValidTiExtensionNumber(value: string): boolean`

- [ ] **Step 1: Write the failing utility test**

Insert this case before the existing `"ti extension hooks and tab expose ramal mutations"` case:

```js
await runTest("ti extension numbers use an exact four-digit contract", async () => {
  const {
    TI_EXTENSION_NUMBER_LENGTH,
    isValidTiExtensionNumber,
    sanitizeTiExtensionNumber,
  } = await import("./utils/extensionNumber.ts");

  assert.equal(TI_EXTENSION_NUMBER_LENGTH, 4);
  assert.equal(isValidTiExtensionNumber("1001"), true);
  assert.equal(isValidTiExtensionNumber("0007"), true);

  for (const invalid of ["", "123", "12345", "12A4", "12-4", " 1234 "]) {
    assert.equal(isValidTiExtensionNumber(invalid), false);
  }

  assert.equal(sanitizeTiExtensionNumber("12A4"), "124");
  assert.equal(sanitizeTiExtensionNumber("12-34-56"), "1234");
});
```

- [ ] **Step 2: Run the TI frontend suite and verify RED**

Run:

```bash
pnpm --filter @workspace/app test:ti
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `utils/extensionNumber.ts`. The failure must occur in the new test, after the existing baseline cases.

- [ ] **Step 3: Implement the minimal utility**

Create `app/src/modules/ti/utils/extensionNumber.ts`:

```ts
export const TI_EXTENSION_NUMBER_LENGTH = 4;

const TI_EXTENSION_NUMBER_PATTERN = /^[0-9]{4}$/;

export function sanitizeTiExtensionNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, TI_EXTENSION_NUMBER_LENGTH);
}

export function isValidTiExtensionNumber(value: string): boolean {
  return TI_EXTENSION_NUMBER_PATTERN.test(value);
}
```

- [ ] **Step 4: Run the TI frontend suite and verify GREEN**

Run:

```bash
pnpm --filter @workspace/app test:ti
```

Expected: PASS, including the new exact-four-digit case.

- [ ] **Step 5: Commit the utility boundary**

```bash
git add app/src/modules/ti/run-ti-tests.mjs app/src/modules/ti/utils/extensionNumber.ts
git commit -m "fix(ti): define extension number contract"
```

---

### Task 2: Enforce the frontend contract and hide the UUID

**Files:**
- Modify: `app/src/modules/ti/run-ti-tests.mjs:504-530`
- Modify: `app/src/modules/ti/components/TiExtensionsTab.tsx:35-355`

**Interfaces:**
- Consumes: `TI_EXTENSION_NUMBER_LENGTH`
- Consumes: `sanitizeTiExtensionNumber(value: string): string`
- Consumes: `isValidTiExtensionNumber(value: string): boolean`
- Preserves: `TiExtension.id` for technical selection and mutations

- [ ] **Step 1: Write the failing component contract test**

Insert this case immediately after the utility test:

```js
await runTest("ti extension form validates digits and hides the internal id", async () => {
  const tabSource = await readModuleSource("components/TiExtensionsTab.tsx");

  assert.match(
    tabSource,
    /import \{[\s\S]*TI_EXTENSION_NUMBER_LENGTH,[\s\S]*isValidTiExtensionNumber,[\s\S]*sanitizeTiExtensionNumber,[\s\S]*\} from "\.\.\/utils\/extensionNumber"/,
  );
  assert.equal(
    [...tabSource.matchAll(/isValidTiExtensionNumber\(number\)/g)].length,
    2,
  );
  assert.equal(
    [
      ...tabSource.matchAll(
        /toast\.error\("Informe um ramal com exatamente 4 dígitos\."\)/g,
      ),
    ].length,
    2,
  );
  assert.match(tabSource, /inputMode="numeric"/);
  assert.match(tabSource, /maxLength=\{TI_EXTENSION_NUMBER_LENGTH\}/);
  assert.match(
    tabSource,
    /updateExtensionField\(\s*"number",\s*sanitizeTiExtensionNumber\(event\.target\.value\),?\s*\)/,
  );
  assert.doesNotMatch(tabSource, /<TiFieldLine label="ID"/);
});
```

- [ ] **Step 2: Run the TI frontend suite and verify RED**

Run:

```bash
pnpm --filter @workspace/app test:ti
```

Expected: FAIL because `TiExtensionsTab.tsx` does not import or use the utility, lacks numeric input hints, and still renders the `ID` field.

- [ ] **Step 3: Import the utility**

Add this import after the TI type import:

```ts
import {
  TI_EXTENSION_NUMBER_LENGTH,
  isValidTiExtensionNumber,
  sanitizeTiExtensionNumber,
} from "../utils/extensionNumber";
```

- [ ] **Step 4: Replace create and update validation**

In both `buildCreatePayload` and `buildUpdatePayload`, replace:

```ts
if (!number) {
  toast.error("Informe o número do ramal.");
  return null;
}
```

with:

```ts
if (!isValidTiExtensionNumber(number)) {
  toast.error("Informe um ramal com exatamente 4 dígitos.");
  return null;
}
```

- [ ] **Step 5: Constrain the controlled input**

Replace the current `TiTextField` with:

```tsx
<TiTextField
  inputMode="numeric"
  label="Número"
  maxLength={TI_EXTENSION_NUMBER_LENGTH}
  onChange={(event) =>
    updateExtensionField("number", sanitizeTiExtensionNumber(event.target.value))
  }
  placeholder="Ex: 1001"
  value={extensionForm.number}
/>
```

- [ ] **Step 6: Remove only the visible UUID field**

Delete this line from the selected-extension panel:

```tsx
<TiFieldLine label="ID" value={getId(selectedExtension.id)} />
```

Keep `getId(item.id)` in the row key and keep all `selectedExtensionId` behavior unchanged.

- [ ] **Step 7: Run the TI frontend suite and verify GREEN**

Run:

```bash
pnpm --filter @workspace/app test:ti
```

Expected: PASS, including the utility and component contract cases.

- [ ] **Step 8: Commit the frontend integration**

```bash
git add app/src/modules/ti/components/TiExtensionsTab.tsx app/src/modules/ti/run-ti-tests.mjs
git commit -m "fix(ti): validate extension form input"
```

---

### Task 3: Reject invalid direct API writes

**Files:**
- Modify: `services/ti-service/src/test/tiExtension.routes.test.ts:14-113`
- Modify: `services/ti-service/src/schemas/tiExtension.schemas.ts:1-35`

**Interfaces:**
- Produces: create and update inputs whose `number` matches `^[0-9]{4}$`
- Produces: shared `400 BAD_REQUEST` response with
  `number deve conter exatamente 4 dígitos.`
- Preserves: `409` duplicate-number handling in `TiExtensionService`

- [ ] **Step 1: Add a stable extension UUID fixture**

Add after `userId`:

```ts
const extensionId = "20000000-0000-4000-8000-000000000001";
```

- [ ] **Step 2: Write the failing POST route test**

Add after the successful POST case:

```ts
it("POST /ti/extensions rejects an alphabetic number before persistence", async () => {
  const prisma = createExtensionPrismaMock();

  const response = await request(createTestApp(prisma as never))
    .post("/ti/extensions")
    .set(gatewayHeaders(TI_ADMIN_PERMISSION))
    .send({
      user_id: userId,
      number: "12A4",
    });

  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({
    success: false,
    error: "number deve conter exatamente 4 dígitos.",
    code: "BAD_REQUEST",
  });
  expect(prisma.extensionsTecnologia.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Write the failing PATCH route test**

Add after the POST validation case:

```ts
it("PATCH /ti/extensions/:id rejects a non-four-digit number before persistence", async () => {
  const prisma = createExtensionPrismaMock();

  const response = await request(createTestApp(prisma as never))
    .patch(`/ti/extensions/${extensionId}`)
    .set(gatewayHeaders(TI_ADMIN_PERMISSION))
    .send({
      number: "123",
    });

  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({
    success: false,
    error: "number deve conter exatamente 4 dígitos.",
    code: "BAD_REQUEST",
  });
  expect(prisma.extensionsTecnologia.update).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run only the extension route test and verify RED**

Run outside the sandbox because Supertest opens an ephemeral listener:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiExtension.routes.test.ts
```

Expected: both new cases FAIL because the current `zNonEmptyText` schema accepts `"12A4"` and `"123"`, producing `201` and `200` rather than `400`.

- [ ] **Step 5: Implement the exact backend schema**

Remove:

```ts
import { zNonEmptyText } from "@workspace/shared";
```

Add after the pagination import:

```ts
const tiExtensionNumberSchema = z.string().regex(/^[0-9]{4}$/, {
  message: "number deve conter exatamente 4 dígitos.",
});
```

Replace:

```ts
number: zNonEmptyText("number"),
```

with:

```ts
number: tiExtensionNumberSchema,
```

`updateTiExtensionBodySchema` continues deriving from the create schema with `.partial()`, so it
inherits the exact rule without duplicating it.

- [ ] **Step 6: Run the extension route test and verify GREEN**

Run outside the sandbox:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiExtension.routes.test.ts
```

Expected: PASS. The two invalid cases return `400`, do not call Prisma persistence, and the existing valid four-digit create case still returns `201`.

- [ ] **Step 7: Run the service-level extension tests**

Run:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiExtensionService.test.ts
```

Expected: PASS. Service duplicate and nested-password behavior remain unchanged.

- [ ] **Step 8: Commit the API validation**

```bash
git add services/ti-service/src/schemas/tiExtension.schemas.ts services/ti-service/src/test/tiExtension.routes.test.ts
git commit -m "fix(ti-service): validate extension numbers"
```

---

### Task 4: Align the OpenAPI contract

**Files:**
- Modify: `services/ti-service/src/test/app.test.ts:175-208`
- Modify: `services/ti-service/src/openapi/spec.ts:384-400`

**Interfaces:**
- Produces: identical OpenAPI number properties for `TiExtensionInput` and
  `TiExtensionUpdateInput`

- [ ] **Step 1: Write the failing OpenAPI assertion**

Inside `"serve a especificacao OpenAPI publica quando habilitada"`, immediately after the loop that
checks public paths, add:

```ts
const extensionNumberSchema = {
  type: "string",
  minLength: 4,
  maxLength: 4,
  pattern: "^[0-9]{4}$",
  example: "1001",
};

expect(response.body.components.schemas.TiExtensionInput.properties.number).toEqual(
  extensionNumberSchema,
);
expect(response.body.components.schemas.TiExtensionUpdateInput.properties.number).toEqual(
  extensionNumberSchema,
);
```

- [ ] **Step 2: Run the OpenAPI app test and verify RED**

Run outside the sandbox:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/app.test.ts
```

Expected: FAIL because both current number properties contain only
`{ type: "string", minLength: 1 }`.

- [ ] **Step 3: Update both OpenAPI input schemas**

Replace each extension `number` property with:

```ts
number: {
  type: "string",
  minLength: 4,
  maxLength: 4,
  pattern: "^[0-9]{4}$",
  example: "1001",
},
```

- [ ] **Step 4: Run the OpenAPI app test and verify GREEN**

Run outside the sandbox:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/app.test.ts
```

Expected: PASS, including both exact extension-number schema assertions.

- [ ] **Step 5: Validate smoke coverage**

Run:

```bash
pnpm smoke:coverage
```

Expected: PASS. No manifest edit is required because no route changed and the existing extension
smoke handlers already use `uniqueDigits(4)`.

- [ ] **Step 6: Commit the OpenAPI contract**

```bash
git add services/ti-service/src/openapi/spec.ts services/ti-service/src/test/app.test.ts
git commit -m "docs(ti-service): document extension number format"
```

---

### Task 5: Refresh context and run final verification

**Files:**
- Review: every file changed by Tasks 1-4
- Do not modify manifests or lockfiles

**Interfaces:**
- Confirms: frontend, API, OpenAPI, and smoke contracts agree
- Confirms: UUID remains technical but is not visible

- [ ] **Step 1: Refresh available Graphify scopes**

Run:

```bash
pnpm graphify:update:ui
pnpm graphify:update:services
```

Expected in the current environment: Graphify may report that the tool or local graphs are
unavailable. If unavailable, record the repository-prescribed fallback and continue with diff and
call-site review; do not install hooks or commit `graphify-out/`.

- [ ] **Step 2: Build shared TypeScript dependencies**

Run:

```bash
pnpm --filter @workspace/shared build
pnpm --filter @workspace/api build
```

Expected: PASS. Generated `dist/` outputs remain ignored.

- [ ] **Step 3: Run the full scoped suites**

Run:

```bash
pnpm --filter @workspace/app test:ti
pnpm --filter @workspace/ti-service test
```

Expected: frontend TI suite and all 123-plus `ti-service` tests PASS. Run the backend suite outside
the sandbox if Supertest reports `listen EPERM`.

- [ ] **Step 4: Run both typechecks**

Run:

```bash
pnpm --filter @workspace/app typecheck
pnpm --filter @workspace/ti-service typecheck
```

Expected: PASS.

- [ ] **Step 5: Run Biome on every changed source and test file**

Run frontend files through stdin because the root Biome config intentionally ignores `app/`:

```bash
pnpm exec biome check --stdin-file-path app/src/modules/ti/utils/extensionNumber.ts < app/src/modules/ti/utils/extensionNumber.ts
pnpm exec biome check --stdin-file-path app/src/modules/ti/components/TiExtensionsTab.tsx < app/src/modules/ti/components/TiExtensionsTab.tsx
pnpm exec biome check --stdin-file-path app/src/modules/ti/run-ti-tests.mjs < app/src/modules/ti/run-ti-tests.mjs
```

Run backend files directly:

```bash
pnpm exec biome check services/ti-service/src/schemas/tiExtension.schemas.ts services/ti-service/src/test/tiExtension.routes.test.ts services/ti-service/src/test/app.test.ts services/ti-service/src/openapi/spec.ts
```

Expected: all checks exit `0`.

- [ ] **Step 6: Review contract call sites and diff integrity**

Run:

```bash
rg -n "TiFieldLine label=\"ID\"|isValidTiExtensionNumber|sanitizeTiExtensionNumber|tiExtensionNumberSchema|\\^\\[0-9\\]\\{4\\}\\$" app/src/modules/ti services/ti-service/src
git diff --check origin/develop...HEAD
git diff --stat origin/develop...HEAD
git diff origin/develop...HEAD
git status --short --branch
```

Expected:

- no visible extension `ID` field;
- frontend and backend exact-four-digit validations are present;
- only approved implementation, tests, OpenAPI, spec, and plan files changed;
- no manifest or lockfile changes;
- no whitespace errors; and
- clean worktree after all task commits.

- [ ] **Step 7: Request a final review before publication**

Invoke `superpowers:requesting-code-review`, address only evidence-backed findings, and rerun any
affected verification command.

- [ ] **Step 8: Publish without merging**

After reading `github:yeet` and `superpowers:verification-before-completion`:

```bash
git push -u origin fix/508-ti-extensions-validate-number-hide-id
```

Open a draft PR against `develop` with:

- an English title;
- an English Markdown description covering summary, root cause, behavior, security/contract impact,
  and validation; and
- `Closes #508`.

Verify the PR is open, draft, targets `develop`, uses the intended head branch, contains the
Markdown description, and is not merged.
