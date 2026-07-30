# TI Robot Required-Field Errors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the TI robot create/edit dialog reject missing name and type values with exact Portuguese backend messages, accessible inline frontend errors, deterministic focus, and create/update payload semantics that preserve clearing behavior.

**Architecture:** Keep dialog state, focus orchestration, and rendering in `TiRobotsTab`. Put the small deterministic robot-form rules in one TI-domain utility so validation, create/update payload shaping, and mutation-error parsing have executable behavioral tests without introducing a form framework. Keep HTTP validation in the existing TI robot Zod schema and verify the serialized route error envelope through the existing Vitest route suite.

**Tech Stack:** React 18, TypeScript, Next.js, TanStack Query, native form controls, Zod, Express, Vitest, Supertest, the existing `run-ti-tests.mjs` TI guardrail runner, Biome, pnpm workspaces.

## Global Constraints

- Work only in `/home/bruno/Documents/Projects/giro-office/.worktrees/issue-509`.
- Use test-driven development: add the named failing test, run it and observe the expected issue-specific failure, then write only the minimum production code needed to pass it.
- Use `apply_patch` for every source or documentation edit. Do not overwrite files with shell redirection.
- Preserve the existing robot routes, services, hooks, query invalidation, dialog component, run-registration flow, gateway, OpenAPI, database schema, and smoke manifest.
- Do not add a generic form library, generic validation framework, or change `TiNativeSelect`. Its existing prop forwarding already exposes native `id`, `name`, `required`, and ARIA props.
- The required strings are exact:
  - Name: `Informe o nome do robô.`
  - Type: `Selecione o tipo do robô.`
- Validate both fields in one pass. Render both errors when both are invalid, then focus the first invalid native control in the fixed order `name`, `type`.
- A new create draft starts with `type: ""`. An edit draft continues to use the persisted type, including the existing legacy fallback in `createRobotDraft`.
- Create payloads omit blank optional `description` and `schedule` keys. Update payloads send `null` for blank `description` and `schedule` so an existing value can be cleared.
- Required `name` and `type` remain non-optional in `TiRobotPayload`; do not weaken these fields to make builders compile.
- Error parsing precedence is `response.data.error`, `response.data.message`, `Error.message`, then `Não foi possível concluir a ação.`. Do not show `Request failed with status code 400` when the API returned a useful message.
- Keep required state accessible: a visible marker, programmatic label association, `required`, `aria-invalid`, conditional `aria-describedby`, inline error text with stable IDs, and a global mutation banner with `role="alert"`.
- Reset field errors and pending focus whenever the create or edit dialog opens. Clear a field's error as soon as that field changes.
- Do not conflate the known baseline failures listed below with issue 509, and do not fix them in this implementation.

---

## Responsibility Map

| File | Responsibility in this change |
| --- | --- |
| `services/ti-service/src/schemas/tiRobot.schemas.ts` | Own exact create-body required messages while preserving the shared robot type enum and optional update semantics. |
| `services/ti-service/src/test/tiRobot.routes.test.ts` | Prove HTTP 400 envelopes, exact user-facing messages, and that invalid requests never reach Prisma. |
| `app/src/modules/ti/types/robots.ts` | Express the frontend mutation contract: `name` and `type` are required; optional fields retain their existing types. |
| `app/src/modules/ti/utils/robotForm.ts` (new) | Own only pure TI robot-form rules: field validation, separate create/update payload shaping, and mutation-error message precedence. This is a domain utility, not a generic form abstraction. |
| `app/src/modules/ti/components/TiRobotsTab.tsx` | Own create/edit draft lifecycle, field-error state, one-shot focus, dialog rendering, ARIA wiring, and mutation calls. |
| `app/src/modules/ti/run-ti-tests.mjs` | Add focused behavioral tests for the pure utility and source guardrails for React-only focus/ARIA wiring. Add a narrow test-name filter so issue tests can run despite an unrelated earlier baseline failure. |

No service or hook signature changes are required: `tiRobotsService` and `useTiRobots` already pass `TiRobotPayload` through to both mutations, so strengthening that interface propagates to their existing call sites.

## Known Baseline Blockers

Record these before implementation and compare final runs against them:

- `pnpm --filter @workspace/app test:ti` currently stops at `run-ti-tests.mjs:548`: the password clipboard source guardrail expects a direct `navigator.clipboard.writeText(secret)` call while the component uses the safe helper. The new `TI_TEST_PATTERN` runs must pass independently; the full-suite failure remains baseline.
- `pnpm --filter @workspace/app typecheck` currently cannot resolve `@workspace/api` until that workspace package has been built. Build `@workspace/api` before the scoped typecheck; do not change imports for this issue.
- `pnpm --filter @workspace/ti-service test` currently reports 56 passing tests and 12 route-suite failures because built `@workspace/shared/logger` is unavailable. Build `@workspace/shared` before the targeted route test; do not change logger imports for this issue.
- `pnpm --filter @workspace/ti-service typecheck` currently stops in Prisma generation when `DATABASE_URL` is absent. Supply a syntactically valid local-only URL for generation; no database connection is needed for `prisma generate` or `tsc --noEmit`.

### Task 1: Make the backend contract return exact required-field messages

**Files:**
- Modify: `services/ti-service/src/test/tiRobot.routes.test.ts`
- Modify: `services/ti-service/src/schemas/tiRobot.schemas.ts`

**Interfaces:**

```ts
export type CreateTiRobotBody = {
  name: string;
  description?: string;
  type: "Backup" | "Relatorio" | "Integracao" | "Manutencao" | "Monitoramento";
  schedule?: string;
  status: "active" | "inactive" | "running" | "failed";
  active: boolean;
};
```

The HTTP failure contract remains:

```json
{
  "success": false,
  "error": "Informe o nome do robô.",
  "code": "BAD_REQUEST"
}
```

or:

```json
{
  "success": false,
  "error": "Selecione o tipo do robô.",
  "code": "BAD_REQUEST"
}
```

- [ ] **Step 1: Strengthen the route tests with exact messages and persistence guards**

Change the test helper import:

```ts
import { createPrismaMock, createTestApp } from "./tiServiceTestUtils.js";
```

Replace the generic `POST /ti/robots validates body` case with these concrete cases:

```ts
it.each([
  {
    label: "a missing name",
    body: { type: "Backup" },
    error: "Informe o nome do robô.",
  },
  {
    label: "a blank name",
    body: { name: "   ", type: "Backup" },
    error: "Informe o nome do robô.",
  },
  {
    label: "a missing type",
    body: { name: "Backup diario" },
    error: "Selecione o tipo do robô.",
  },
  {
    label: "an invalid type",
    body: { name: "Backup diario", type: "Outro" },
    error: "Tipo de robô inválido.",
  },
])("POST /ti/robots rejects $label before persistence", async ({ body, error }) => {
  const prisma = createPrismaMock();
  const response = await request(createTestApp(prisma))
    .post("/ti/robots")
    .set(gatewayHeaders(TI_ADMIN_PERMISSION))
    .send(body);

  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({
    success: false,
    error,
    code: "BAD_REQUEST",
  });
  expect(prisma.tIRobot.create).not.toHaveBeenCalled();
});

it("POST /ti/robots accepts the minimal required create body", async () => {
  const response = await request(createTestApp())
    .post("/ti/robots")
    .set(gatewayHeaders(TI_ADMIN_PERMISSION))
    .send({
      name: "Backup diario",
      type: "Backup",
    });

  expect(response.status).toBe(201);
  expect(response.body).toMatchObject({
    success: true,
    data: {
      name: "Backup diario",
      type: "Backup",
      status: "active",
      active: true,
    },
  });
});
```

- [ ] **Step 2: Run the targeted test and confirm the issue-specific red state**

Run:

```bash
pnpm --filter @workspace/shared build
pnpm --filter @workspace/ti-service exec vitest run src/test/tiRobot.routes.test.ts
```

Expected: the shared build succeeds; the route suite fails because the current schema serializes its generic name/type required text instead of one or both exact messages. The minimal valid create case should already pass.

- [ ] **Step 3: Implement exact Zod messages without changing update optionality**

Replace the type schema and the create `name` member with:

```ts
const ROBOT_NAME_REQUIRED_MESSAGE = "Informe o nome do robô.";
const ROBOT_TYPE_REQUIRED_MESSAGE = "Selecione o tipo do robô.";
const ROBOT_TYPE_INVALID_MESSAGE = "Tipo de robô inválido.";

export const tiRobotTypeSchema = z.enum(
  ["Backup", "Relatorio", "Integracao", "Manutencao", "Monitoramento"],
  {
    errorMap: (issue) => ({
      message:
        issue.code === z.ZodIssueCode.invalid_type && issue.received === "undefined"
          ? ROBOT_TYPE_REQUIRED_MESSAGE
          : ROBOT_TYPE_INVALID_MESSAGE,
    }),
  },
);

const requiredTiRobotNameSchema = z
  .string({
    required_error: ROBOT_NAME_REQUIRED_MESSAGE,
    invalid_type_error: ROBOT_NAME_REQUIRED_MESSAGE,
  })
  .trim()
  .min(1, { message: ROBOT_NAME_REQUIRED_MESSAGE });
```

Then use the dedicated name schema only in create:

```ts
export const createTiRobotBodySchema = z
  .object({
    name: requiredTiRobotNameSchema,
    description: z.string().optional(),
    type: tiRobotTypeSchema,
    schedule: z.string().optional(),
    status: tiRobotStatusSchema.default("active"),
    active: z.boolean().optional().default(true),
  })
  .strict();
```

Leave `updateTiRobotBodySchema` unchanged: `name` and `type` remain optional there because an update may change a different field. Its existing `zNonEmptyText("name")` still rejects a supplied blank name.

- [ ] **Step 4: Run the targeted route suite and confirm green**

Run:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiRobot.routes.test.ts
```

Expected: PASS, including all three exact-message cases, the no-persistence assertions, and minimal create.

- [ ] **Step 5: Commit the backend slice**

```bash
git add services/ti-service/src/schemas/tiRobot.schemas.ts services/ti-service/src/test/tiRobot.routes.test.ts
git commit -m "fix(ti-service): clarify robot required fields"
```

### Task 2: Add tested frontend form rules and strengthen the payload contract

**Files:**
- Modify: `app/src/modules/ti/run-ti-tests.mjs`
- Modify: `app/src/modules/ti/types/robots.ts`
- Create: `app/src/modules/ti/utils/robotForm.ts`

**Interfaces:**

```ts
export interface TiRobotPayload {
  name: string;
  description?: string | null;
  type: TiRobotType | string;
  status?: string;
  active?: boolean;
  schedule?: string | null;
  [key: string]: unknown;
}

export type RobotField = "name" | "type";
export type RobotFieldErrors = Partial<Record<RobotField, string>>;

export interface RobotDraft {
  name: string;
  description: string;
  type: TiRobotType | string;
  status: string;
  active: boolean;
  schedule: string;
}

export function validateRobotDraft(draft: RobotDraft): RobotFieldErrors;
export function getFirstInvalidRobotField(
  errors: RobotFieldErrors,
): RobotField | undefined;
export function buildCreateRobotPayload(draft: RobotDraft): TiRobotPayload;
export function buildUpdateRobotPayload(draft: RobotDraft): TiRobotPayload;
export function getRobotMutationErrorMessage(
  error: unknown,
  fallback?: string,
): string;
```

- [ ] **Step 1: Add a narrow test-name filter to the existing TI runner**

Immediately before `runTest`, add:

```js
const testPattern = process.env.TI_TEST_PATTERN;
```

Start `runTest` with:

```js
async function runTest(name, fn) {
  if (testPattern && !name.includes(testPattern)) {
    return;
  }

  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
```

This does not change the default suite. It only lets implementation workers run an issue-specific test past the unrelated password baseline blocker.

- [ ] **Step 2: Add one behavioral test for all pure robot-form rules**

Add this test near the beginning of `run-ti-tests.mjs`, after the runner helpers:

```js
await runTest("issue 509 ti robot form utilities preserve validation and payload semantics", async () => {
  const {
    buildCreateRobotPayload,
    buildUpdateRobotPayload,
    getFirstInvalidRobotField,
    getRobotMutationErrorMessage,
    validateRobotDraft,
  } = await import("./utils/robotForm.ts");

  const emptyDraft = {
    name: "   ",
    description: "   ",
    type: "",
    status: "active",
    active: true,
    schedule: "   ",
  };

  assert.deepEqual(validateRobotDraft(emptyDraft), {
    name: "Informe o nome do robô.",
    type: "Selecione o tipo do robô.",
  });
  assert.deepEqual(
    validateRobotDraft({ ...emptyDraft, name: "Backup diário" }),
    { type: "Selecione o tipo do robô." },
  );
  assert.equal(
    getFirstInvalidRobotField(validateRobotDraft(emptyDraft)),
    "name",
  );
  assert.equal(
    getFirstInvalidRobotField(
      validateRobotDraft({ ...emptyDraft, name: "Backup diário" }),
    ),
    "type",
  );

  const validDraft = {
    ...emptyDraft,
    name: "  Backup diário  ",
    type: "Backup",
  };
  assert.deepEqual(validateRobotDraft(validDraft), {});
  assert.deepEqual(buildCreateRobotPayload(validDraft), {
    name: "Backup diário",
    type: "Backup",
    status: "active",
    active: true,
  });
  assert.deepEqual(buildUpdateRobotPayload(validDraft), {
    name: "Backup diário",
    description: null,
    type: "Backup",
    status: "active",
    active: true,
    schedule: null,
  });

  const filledDraft = {
    ...validDraft,
    description: "  Arquivos internos  ",
    schedule: "  diariamente às 02:00  ",
  };
  assert.deepEqual(buildCreateRobotPayload(filledDraft), {
    name: "Backup diário",
    description: "Arquivos internos",
    type: "Backup",
    status: "active",
    active: true,
    schedule: "diariamente às 02:00",
  });

  const responseError = Object.assign(new Error("Request failed with status code 400"), {
    response: {
      data: {
        error: "Selecione o tipo do robô.",
        message: "Mensagem secundária.",
      },
    },
  });
  assert.equal(
    getRobotMutationErrorMessage(responseError),
    "Selecione o tipo do robô.",
  );
  assert.equal(
    getRobotMutationErrorMessage({
      response: { data: { message: "Falha legível da API." } },
    }),
    "Falha legível da API.",
  );
  assert.equal(
    getRobotMutationErrorMessage(new Error("Falha legível do cliente.")),
    "Falha legível do cliente.",
  );
  assert.equal(
    getRobotMutationErrorMessage({}),
    "Não foi possível concluir a ação.",
  );

  const typeSource = await readModuleSource("types/robots.ts");
  const payloadTypeSource =
    typeSource.match(/export interface TiRobotPayload \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(payloadTypeSource, /name: string/);
  assert.match(payloadTypeSource, /type: TiRobotType \| string/);
  assert.doesNotMatch(payloadTypeSource, /name\?: string/);
  assert.doesNotMatch(payloadTypeSource, /type\?: TiRobotType \| string/);
});
```

In the existing robot type guardrail, scope the payload assertions to
`TiRobotPayload` so the deliberately optional `TiRobot.type` response field does not produce a
false failure:

```js
const payloadTypeSource =
  typeSource.match(/export interface TiRobotPayload \{[\s\S]*?\n\}/)?.[0] ?? "";
assert.match(payloadTypeSource, /name: string/);
assert.match(payloadTypeSource, /type: TiRobotType \| string/);
assert.doesNotMatch(payloadTypeSource, /name\?: string/);
assert.doesNotMatch(payloadTypeSource, /type\?: TiRobotType \| string/);
```

- [ ] **Step 3: Run the focused frontend test and confirm red**

Run:

```bash
TI_TEST_PATTERN="issue 509 ti robot form utilities" pnpm --filter @workspace/app test:ti
```

Expected: FAIL because `utils/robotForm.ts` does not exist yet. If the utility file was created prematurely, the strengthened payload-type assertions must fail until `name` and `type` become required.

- [ ] **Step 4: Strengthen `TiRobotPayload`**

Change only the two required members:

```ts
export interface TiRobotPayload {
  name: string;
  description?: string | null;
  type: TiRobotType | string;
  status?: string;
  active?: boolean;
  schedule?: string | null;
  [key: string]: unknown;
}
```

Do not change the signatures in `tiRobotsService.ts` or `useTiRobots.ts`; both already use `TiRobotPayload`.

- [ ] **Step 5: Implement the focused robot-form utility**

Create `app/src/modules/ti/utils/robotForm.ts` with:

```ts
import type { TiRobotPayload, TiRobotType } from "../types";

export const ROBOT_NAME_REQUIRED_MESSAGE = "Informe o nome do robô.";
export const ROBOT_TYPE_REQUIRED_MESSAGE = "Selecione o tipo do robô.";

export type RobotField = "name" | "type";
export type RobotFieldErrors = Partial<Record<RobotField, string>>;

export interface RobotDraft {
  name: string;
  description: string;
  type: TiRobotType | string;
  status: string;
  active: boolean;
  schedule: string;
}

export function validateRobotDraft(draft: RobotDraft): RobotFieldErrors {
  const errors: RobotFieldErrors = {};

  if (!draft.name.trim()) {
    errors.name = ROBOT_NAME_REQUIRED_MESSAGE;
  }

  if (!draft.type) {
    errors.type = ROBOT_TYPE_REQUIRED_MESSAGE;
  }

  return errors;
}

export function getFirstInvalidRobotField(
  errors: RobotFieldErrors,
): RobotField | undefined {
  return (["name", "type"] as const).find((field) => errors[field]);
}

function baseRobotPayload(draft: RobotDraft): TiRobotPayload {
  return {
    name: draft.name.trim(),
    type: draft.type,
    status: draft.status,
    active: draft.active,
  };
}

export function buildCreateRobotPayload(draft: RobotDraft): TiRobotPayload {
  const description = draft.description.trim();
  const schedule = draft.schedule.trim();

  return {
    ...baseRobotPayload(draft),
    ...(description ? { description } : {}),
    ...(schedule ? { schedule } : {}),
  };
}

export function buildUpdateRobotPayload(draft: RobotDraft): TiRobotPayload {
  return {
    ...baseRobotPayload(draft),
    description: draft.description.trim() || null,
    schedule: draft.schedule.trim() || null,
  };
}

export function getRobotMutationErrorMessage(
  error: unknown,
  fallback = "Não foi possível concluir a ação.",
): string {
  const responseData =
    error && typeof error === "object" && "response" in error
      ? (
          error as {
            response?: {
              data?: {
                error?: unknown;
                message?: unknown;
              };
            };
          }
        ).response?.data
      : undefined;

  for (const candidate of [responseData?.error, responseData?.message]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}
```

The builders intentionally trust the caller to validate first; their required return type prevents omission, while `handleSaveRobot` in Task 3 guarantees that an empty type never reaches a mutation.

- [ ] **Step 6: Run the focused behavioral test and confirm green**

Run:

```bash
TI_TEST_PATTERN="issue 509 ti robot form utilities" pnpm --filter @workspace/app test:ti
```

Expected: PASS with exactly one `PASS issue 509 ti robot form utilities preserve validation and payload semantics` line and exit code 0.

- [ ] **Step 7: Commit the contract and pure-rule slice**

```bash
git add app/src/modules/ti/run-ti-tests.mjs app/src/modules/ti/types/robots.ts app/src/modules/ti/utils/robotForm.ts
git commit -m "fix(ti): align robot form payload contract"
```

### Task 3: Integrate all-at-once validation, one-shot focus, and accessible field errors

**Files:**
- Modify: `app/src/modules/ti/run-ti-tests.mjs`
- Modify: `app/src/modules/ti/components/TiRobotsTab.tsx`

**Interfaces:**

`TiRobotsTab` consumes:

```ts
validateRobotDraft(draft: RobotDraft): RobotFieldErrors;
getFirstInvalidRobotField(errors: RobotFieldErrors): RobotField | undefined;
buildCreateRobotPayload(draft: RobotDraft): TiRobotPayload;
buildUpdateRobotPayload(draft: RobotDraft): TiRobotPayload;
getRobotMutationErrorMessage(error: unknown): string;
```

The component owns these local state contracts:

```ts
const robotFormRef = useRef<HTMLFormElement>(null);
const [fieldErrors, setFieldErrors] = useState<RobotFieldErrors>({});
const [focusField, setFocusField] = useState<RobotField | null>(null);
```

- [ ] **Step 1: Add React wiring guardrails before changing the component**

Add this focused test near the Task 2 issue test:

```js
await runTest("issue 509 ti robot dialog exposes accessible required field errors", async () => {
  const tabSource = await readModuleSource("components/TiRobotsTab.tsx");

  assert.match(tabSource, /useEffect/);
  assert.match(tabSource, /useRef/);
  assert.match(tabSource, /type: ""/);
  assert.match(
    tabSource,
    /\{\s*value: "",\s*label: "Selecione o tipo",\s*disabled: true\s*\}/,
  );
  assert.match(tabSource, /validateRobotDraft\(robotDraft\)/);
  assert.match(tabSource, /getFirstInvalidRobotField\(nextFieldErrors\)/);
  assert.match(tabSource, /buildCreateRobotPayload\(robotDraft\)/);
  assert.match(tabSource, /buildUpdateRobotPayload\(robotDraft\)/);
  assert.match(tabSource, /getRobotMutationErrorMessage\(error\)/);
  assert.match(tabSource, /robotFormRef\.current\?\.elements\.namedItem\(focusField\)/);
  assert.match(tabSource, /control\.focus\(\)/);
  assert.match(tabSource, /setFocusField\(null\)/);
  assert.match(tabSource, /ref=\{robotFormRef\}/);
  assert.match(tabSource, /noValidate/);
  assert.match(tabSource, /id="ti-robot-name"/);
  assert.match(tabSource, /name="name"/);
  assert.match(tabSource, /id="ti-robot-type"/);
  assert.match(tabSource, /name="type"/);
  assert.match(tabSource, /htmlFor="ti-robot-type"/);
  assert.match(tabSource, /required/);
  assert.match(tabSource, /aria-invalid=\{Boolean\(fieldErrors\.name\)\}/);
  assert.match(tabSource, /aria-invalid=\{Boolean\(fieldErrors\.type\)\}/);
  assert.match(tabSource, /aria-describedby=\{fieldErrors\.name/);
  assert.match(tabSource, /aria-describedby=\{fieldErrors\.type/);
  assert.match(tabSource, /id="ti-robot-name-error"/);
  assert.match(tabSource, /id="ti-robot-type-error"/);
  assert.match(tabSource, /role="alert"/);
  assert.match(tabSource, /clearRobotFieldError\("name"\)/);
  assert.match(tabSource, /clearRobotFieldError\("type"\)/);
});
```

- [ ] **Step 2: Update the existing robot-tab guardrail for the named builders**

In `ti robots tab exposes operational list detail forms and run action`, replace:

```js
assert.match(tabSource, /type: draft\.type/);
assert.match(tabSource, /active: draft\.active/);
```

with:

```js
assert.match(tabSource, /buildCreateRobotPayload\(robotDraft\)/);
assert.match(tabSource, /buildUpdateRobotPayload\(robotDraft\)/);
assert.doesNotMatch(tabSource, /function buildRobotPayload/);
```

The pure utility test from Task 2 now owns the `type` and `active` payload-value assertions.

- [ ] **Step 3: Run the focused UI guardrail and confirm red**

Run:

```bash
TI_TEST_PATTERN="issue 509 ti robot dialog" pnpm --filter @workspace/app test:ti
```

Expected: FAIL on the first missing issue-509 assertion (`useEffect`, empty initial type, or the disabled placeholder).

- [ ] **Step 4: Replace local form rules with the tested utility**

Change the React import to:

```ts
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
```

Remove `TiRobotPayload` and `TiRobotType` from the `../types` import, remove the local `RobotDraft` type, `getErrorMessage`, and `buildRobotPayload`, then import:

```ts
import {
  buildCreateRobotPayload,
  buildUpdateRobotPayload,
  getFirstInvalidRobotField,
  getRobotMutationErrorMessage,
  validateRobotDraft,
  type RobotDraft,
  type RobotField,
  type RobotFieldErrors,
} from "../utils/robotForm";
```

`getErrorMessage` is also used by `handleCreateRun`. Replace that catch block at the same time so
removing the helper leaves no dangling call and the run dialog retains equivalent friendly error
behavior:

```ts
} catch (error) {
  const message = getRobotMutationErrorMessage(error);
  setFormError(message);
  setActionError(message);
}
```

Change the create-only type options and initial draft:

```ts
const ROBOT_FORM_TYPE_OPTIONS = [
  { value: "", label: "Selecione o tipo", disabled: true },
  ...ROBOT_TYPE_OPTIONS.filter((option) => option.value),
] as const;

const INITIAL_ROBOT_DRAFT: RobotDraft = {
  name: "",
  description: "",
  type: "",
  status: "active",
  active: true,
  schedule: "",
};
```

Do not change `createRobotDraft`; existing robots must continue to populate their saved type.

- [ ] **Step 5: Add field-error state and post-render one-shot focus**

Immediately after `robotDraft` state, add:

```ts
const [fieldErrors, setFieldErrors] = useState<RobotFieldErrors>({});
const [focusField, setFocusField] = useState<RobotField | null>(null);
const robotFormRef = useRef<HTMLFormElement>(null);
```

After the mutation state declarations, add:

```ts
useEffect(() => {
  if (!focusField) {
    return;
  }

  const control = robotFormRef.current?.elements.namedItem(focusField);

  if (control instanceof HTMLElement) {
    control.focus();
  }

  setFocusField(null);
}, [focusField]);
```

Use an effect instead of focusing inside submit: React must first render the new field error state, then move focus exactly once.

Add this local helper:

```ts
function clearRobotFieldError(field: RobotField) {
  setFieldErrors((current) => {
    if (!current[field]) {
      return current;
    }

    const next = { ...current };
    delete next[field];
    return next;
  });
}
```

- [ ] **Step 6: Reset dialog-local validation and validate all fields on submit**

In both `openCreateDialog` and `openEditDialog`, add:

```ts
setFieldErrors({});
setFocusField(null);
```

Replace `handleSaveRobot` with:

```ts
async function handleSaveRobot(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setFormError(null);

  const nextFieldErrors = validateRobotDraft(robotDraft);
  setFieldErrors(nextFieldErrors);

  const firstInvalidField = getFirstInvalidRobotField(nextFieldErrors);

  if (firstInvalidField) {
    setFocusField(firstInvalidField);
    return;
  }

  try {
    if (editingRobot) {
      await updateRobotMutation.mutateAsync({
        id: editingRobot.id,
        payload: buildUpdateRobotPayload(robotDraft),
      });
    } else {
      await createRobotMutation.mutateAsync(buildCreateRobotPayload(robotDraft));
    }

    setIsRobotDialogOpen(false);
  } catch (error) {
    setFormError(getRobotMutationErrorMessage(error));
  }
}
```

This preserves the current mutation ownership and query invalidation. It changes only validation, payload selection, and error copy.

- [ ] **Step 7: Add the accessible name control and global mutation alert**

Change the form opening tag and mutation banner to:

```tsx
<form ref={robotFormRef} className="space-y-4" noValidate onSubmit={handleSaveRobot}>
  {formError ? (
    <div
      className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
      role="alert"
    >
      {formError}
    </div>
  ) : null}
```

`noValidate` is required so the native constraint-validation popup does not prevent the React submit handler; the native `required` attribute remains exposed to assistive technology.

Replace the name field with:

```tsx
<label className="flex min-w-0 flex-col gap-2" htmlFor="ti-robot-name">
  <span className={tiLabelClassName}>
    Nome <span aria-hidden="true">*</span>
  </span>
  <input
    id="ti-robot-name"
    name="name"
    required
    aria-describedby={fieldErrors.name ? "ti-robot-name-error" : undefined}
    aria-invalid={Boolean(fieldErrors.name)}
    className={cn(
      tiInputClassName,
      fieldErrors.name &&
        "border-red-500 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500",
    )}
    value={robotDraft.name}
    onChange={(event) => {
      setRobotDraft((draft) => ({ ...draft, name: event.target.value }));
      clearRobotFieldError("name");
    }}
  />
  {fieldErrors.name ? (
    <span id="ti-robot-name-error" className="text-xs text-red-600 dark:text-red-300">
      {fieldErrors.name}
    </span>
  ) : null}
</label>
```

- [ ] **Step 8: Add the disabled type placeholder and accessible inline type error**

Keep `TiNativeSelect`. Render the visible label as its sibling so the required marker can be hidden
from assistive technology and the specification's explicit `htmlFor`/`id` relationship remains
testable. `TiNativeSelect` continues to forward the native control ID, field name, required state,
and ARIA references:

```tsx
<div className="flex min-w-0 flex-col gap-2">
  <label className={tiLabelClassName} htmlFor="ti-robot-type">
    Tipo <span aria-hidden="true">*</span>
  </label>
  <TiNativeSelect
    id="ti-robot-type"
    name="type"
    required
    aria-describedby={fieldErrors.type ? "ti-robot-type-error" : undefined}
    aria-invalid={Boolean(fieldErrors.type)}
    className={cn(
      fieldErrors.type &&
        "border-red-500 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500",
    )}
    value={robotDraft.type}
    options={ROBOT_FORM_TYPE_OPTIONS}
    onChange={(event) => {
      setRobotDraft((draft) => ({
        ...draft,
        type: event.target.value,
      }));
      clearRobotFieldError("type");
    }}
  />
  {fieldErrors.type ? (
    <span id="ti-robot-type-error" className="text-xs text-red-600 dark:text-red-300">
      {fieldErrors.type}
    </span>
  ) : null}
</div>
```

The first option is disabled but selected by the empty create draft. An edit draft with a real type selects the saved option.

- [ ] **Step 9: Run the issue-specific frontend tests and confirm green**

Run:

```bash
TI_TEST_PATTERN="issue 509 ti robot" pnpm --filter @workspace/app test:ti
```

Expected: both issue-509 tests PASS and the command exits 0.

- [ ] **Step 10: Run the existing robot guardrails**

Run:

```bash
TI_TEST_PATTERN="ti robots" pnpm --filter @workspace/app test:ti
```

Expected: PASS. The old `buildRobotPayload` assertions were replaced in Step 2; do not
reintroduce that removed generic builder.

- [ ] **Step 11: Commit the dialog slice**

```bash
git add app/src/modules/ti/components/TiRobotsTab.tsx app/src/modules/ti/run-ti-tests.mjs
git commit -m "fix(ti): show accessible robot field errors"
```

### Task 4: Verify the complete change and classify baseline-only failures

**Files:**
- Verify only: all files changed in Tasks 1-3
- Do not modify: gateway, OpenAPI, Prisma schema, smoke manifests, `TiNativeSelect`, password components/tests

**Interfaces:**

No new interfaces. Verify the exact contracts declared above and confirm no accidental changes outside the responsibility map.

- [ ] **Step 1: Review the complete diff before running broad checks**

Run:

```bash
git status --short
git diff --check HEAD~3..HEAD
git diff --stat HEAD~3..HEAD
git diff HEAD~3..HEAD -- \
  app/src/modules/ti/components/TiRobotsTab.tsx \
  app/src/modules/ti/run-ti-tests.mjs \
  app/src/modules/ti/types/robots.ts \
  app/src/modules/ti/utils/robotForm.ts \
  services/ti-service/src/schemas/tiRobot.schemas.ts \
  services/ti-service/src/test/tiRobot.routes.test.ts
```

Expected: no whitespace errors; only the six planned files appear; no placeholders (`TODO`, `TBD`, empty handlers), no generic form abstraction, no `TiNativeSelect` change, and no technical HTTP 400 copy in the dialog path.

- [ ] **Step 2: Run scoped formatting/lint validation**

Run:

```bash
pnpm exec biome check \
  app/src/modules/ti/components/TiRobotsTab.tsx \
  app/src/modules/ti/run-ti-tests.mjs \
  app/src/modules/ti/types/robots.ts \
  app/src/modules/ti/utils/robotForm.ts \
  services/ti-service/src/schemas/tiRobot.schemas.ts \
  services/ti-service/src/test/tiRobot.routes.test.ts
```

Expected: PASS. Apply only Biome's scoped fixes if required, rerun the issue tests, and amend the commit that owns the affected file rather than creating an unrelated cleanup commit.

- [ ] **Step 3: Run targeted automated tests**

Run:

```bash
pnpm --filter @workspace/shared build
pnpm --filter @workspace/ti-service exec vitest run src/test/tiRobot.routes.test.ts
TI_TEST_PATTERN="issue 509 ti robot" pnpm --filter @workspace/app test:ti
TI_TEST_PATTERN="ti robots" pnpm --filter @workspace/app test:ti
```

Expected: all four commands PASS. The backend output includes the exact name/type 400 cases; the frontend output includes both issue-509 tests and the existing robot guardrails.

- [ ] **Step 4: Run scoped typechecks with baseline prerequisites**

Run:

```bash
pnpm --filter @workspace/api build
pnpm --filter @workspace/app typecheck
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/giro_office pnpm --filter @workspace/ti-service typecheck
```

Expected: the API build and app typecheck PASS. Prisma generation and the TI service TypeScript check PASS without connecting to a database. If either still fails, record the exact output and determine whether it matches a documented baseline dependency problem before changing code.

- [ ] **Step 5: Compare broad suites with the recorded baseline**

Run:

```bash
pnpm --filter @workspace/app test:ti
pnpm --filter @workspace/ti-service test
```

Expected:

- The app command reaches the same unrelated password clipboard guardrail at `run-ti-tests.mjs:548`; every issue-509 and robot-form test that runs before it is green.
- After `@workspace/shared` has been built, the TI service suite should pass. If the package runner still cannot resolve a shared built subpath, record it as the same baseline module-resolution blocker; the targeted route suite from Step 3 remains the issue-specific evidence.
- There must be no new robot, schema, route, payload, or type failure.

- [ ] **Step 6: Perform the browser smoke checklist**

With the normal authenticated TI development environment available:

1. Open **TI → Robôs → Novo robô**.
2. Confirm type displays the disabled `Selecione o tipo` placeholder.
3. Submit with both required fields empty.
4. Confirm both exact inline messages render, the name control has the red state, and focus lands on name.
5. Type a name; confirm only the name error clears immediately.
6. Submit again; confirm the type error remains and focus lands on the type select.
7. Select a type and create; confirm the dialog closes and the robot list refreshes.
8. Edit a robot with populated optional fields, clear description and schedule, save, reopen, and confirm both values remain cleared.
9. Trigger or mock a backend 400 with `response.data.error`; confirm the global `role="alert"` banner shows the API message and never `Request failed with status code 400`.
10. Close and reopen create and edit dialogs; confirm no stale inline error or pending focus remains.

Expected: all ten checks pass with keyboard-only operation and no regression in edit, cancel, or run-registration dialogs.

- [ ] **Step 7: Confirm final repository state**

Run:

```bash
git status --short --branch
git log -3 --oneline
```

Expected: the worktree is clean and the three focused implementation commits are present:

```text
fix(ti): show accessible robot field errors
fix(ti): align robot form payload contract
fix(ti-service): clarify robot required fields
```

Do not push. Do not create an empty verification commit.
