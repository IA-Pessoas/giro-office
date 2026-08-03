# User Module Minimum Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RH and Technology start at Viewer and never offer or submit `Sem acesso` in the user creation and permission editing interfaces.

**Architecture:** Add one typed frontend permission rule in the users domain and consume it at state initialization, select-option rendering, value normalization, and payload construction. Keep the backend and its existing Viewer-to-User self-service promotion unchanged, while normalizing legacy frontend `null` values without issuing automatic writes.

**Tech Stack:** Next.js 16, React 18, TypeScript 5, native HTML selects, Node.js assertion-based users test runner, pnpm workspace.

## Global Constraints

- RH (`rh`) and Technology (`ti`) have frontend minimum permission level Viewer (`0`).
- RH and Technology expose only Viewer (`0`), User (`1`), and Administrator (`2`).
- Every other module keeps its current `Sem acesso`, Viewer, User, and Administrator behavior.
- Existing RH and Technology levels `1` and `2` must remain unchanged.
- Legacy missing or `null` RH and Technology values display as Viewer without making the form dirty or triggering an automatic write.
- Create and edit payloads produced by these frontend flows must contain RH and Technology at level `0` or higher.
- The existing create-payload and backend promotion from Viewer (`0`) to User (`1`) remains allowed and must stay covered.
- Do not modify backend services, schemas, routes, OpenAPI, database state, or migrations.
- Do not change top-level permission, user type, department synchronization, owner behavior, or authorization rules.
- Do not address the adjacent `userService.update` serialization gap for `type` and `modules`.
- Do not add a new UI test framework.
- Follow TDD: every behavior change begins with a focused failing test.

---

## Baseline and Known Environment State

- `pnpm --filter @workspace/app test:users` passes all 17 existing cases on the plan baseline.
- `pnpm --filter @workspace/app typecheck` currently stops in `tsc --noEmit` with five pre-existing
  `TS2307` errors because `@workspace/api` cannot be resolved from:
  - `app/src/shared/hooks/useMe.ts`;
  - `app/src/shared/hooks/useMeMutations.ts`;
  - `app/src/shared/hooks/useUpdateCurrentUser.ts`;
  - `app/src/shared/hooks/useUserProfile.ts`; and
  - `app/src/shared/services/api.ts`.
- `typecheck:usefetch` is not reached while those baseline errors remain.
- Do not fix those unrelated errors in this implementation. Final verification must distinguish the
  same baseline failures from any new errors.

## File and Responsibility Map

- `app/src/modules/users/constants/permissionConfig.ts`
  - Own the single typed RH/Technology minimum map.
  - Export the pure lookup, normalization, and module-specific option helpers used by all later
    tasks.
  - Keep the full generic permission option list for unaffected modules.
- `app/src/modules/users/utils/permissionUtils.ts`
  - Apply the central minimum to known permission records and drafts.
  - Preserve existing extra-module and metadata behavior.
  - Ensure edit payload construction cannot reintroduce RH/Technology `null`.
- `app/src/modules/users/utils/createUserPayload.ts`
  - Defend creation payloads against stale or manually constructed module state.
  - Preserve the existing eligible-user promotion to level `1`.
- `app/src/modules/users/components/CreateUserModal.tsx`
  - Initialize RH and Technology as enabled Viewer selections.
  - Render module-specific options and normalize changes.
  - Preserve native select semantics, existing labels, disabled states, and success reset.
- `app/src/shared/components/newLayout/Administracao.tsx`
  - Render module-specific options in the permission editor.
  - Normalize programmatic edit values through the central rule.
  - Preserve loading, owner, dirty-state, save, cache, and session-refresh behavior.
- `app/src/modules/users/run-users-tests.mjs`
  - Remain the only automated test file changed.
  - Test pure rules and payload behavior directly.
  - Use focused source checks only to prove that the two UI components consume the tested helpers.

No new production file is required. No file under `services/`, `infra/`, `packages/api/`, or
gateway scope may change.

### Task 1: Add the Central Module Minimum Rule

**Files:**
- Modify: `app/src/modules/users/constants/permissionConfig.ts:1-62`
- Test: `app/src/modules/users/run-users-tests.mjs:1-62`

**Interfaces:**
- Consumes: `KnownPermissionModuleKey` and the existing `PERMISSION_SELECT_OPTIONS`.
- Produces:
  - `type PermissionLevel = 0 | 1 | 2`
  - `type PermissionSelectOption = (typeof PERMISSION_SELECT_OPTIONS)[number]`
  - `MINIMUM_PERMISSION_LEVEL_BY_MODULE: Partial<Record<KnownPermissionModuleKey, PermissionLevel>>`
  - `getMinimumPermissionLevel(moduleKey: string): PermissionLevel | null`
  - `normalizePermissionForModule(moduleKey: string, value: number | null | undefined): PermissionLevel | null`
  - `getPermissionSelectOptions(moduleKey: string): readonly PermissionSelectOption[]`

- [ ] **Step 1: Write the failing central-rule tests**

Add this import near the top of `run-users-tests.mjs`:

```js
import {
  getMinimumPermissionLevel,
  getPermissionSelectOptions,
  normalizePermissionForModule,
} from "./constants/permissionConfig.ts";
```

Add these concrete tests before the current source-configuration tests:

```js
runTest("RH and Technology define Viewer as their frontend minimum", () => {
  assert.equal(getMinimumPermissionLevel("rh"), 0);
  assert.equal(getMinimumPermissionLevel("ti"), 0);
  assert.equal(getMinimumPermissionLevel("fiscal"), null);
});

runTest("minimum module options omit no access and preserve higher levels", () => {
  assert.deepEqual(
    getPermissionSelectOptions("rh").map((option) => option.value),
    ["0", "1", "2"],
  );
  assert.deepEqual(
    getPermissionSelectOptions("ti").map((option) => option.value),
    ["0", "1", "2"],
  );
  assert.deepEqual(
    getPermissionSelectOptions("fiscal").map((option) => option.value),
    ["null", "0", "1", "2"],
  );
});

runTest("module permission normalization changes only values below a configured minimum", () => {
  assert.equal(normalizePermissionForModule("rh", null), 0);
  assert.equal(normalizePermissionForModule("ti", undefined), 0);
  assert.equal(normalizePermissionForModule("rh", 1), 1);
  assert.equal(normalizePermissionForModule("ti", 2), 2);
  assert.equal(normalizePermissionForModule("fiscal", null), null);
  assert.equal(normalizePermissionForModule("fiscal", 1), 1);
});
```

- [ ] **Step 2: Run the tests to verify the new imports fail**

Run:

```bash
pnpm --filter @workspace/app test:users
```

Expected: FAIL before test execution with an ESM error stating that
`permissionConfig.ts` does not provide `getMinimumPermissionLevel` (or the first missing named
export).

- [ ] **Step 3: Implement the minimum map and pure helpers**

Append the following typed domain rule after `PERMISSION_SELECT_OPTIONS` and before
`getPermissionModuleLabel`:

```ts
export type PermissionLevel = 0 | 1 | 2;
export type PermissionSelectOption = (typeof PERMISSION_SELECT_OPTIONS)[number];

export const MINIMUM_PERMISSION_LEVEL_BY_MODULE: Partial<
  Record<KnownPermissionModuleKey, PermissionLevel>
> = {
  rh: 0,
  ti: 0,
};

export function getMinimumPermissionLevel(moduleKey: string): PermissionLevel | null {
  return (
    MINIMUM_PERMISSION_LEVEL_BY_MODULE[moduleKey as KnownPermissionModuleKey] ?? null
  );
}

export function normalizePermissionForModule(
  moduleKey: string,
  value: number | null | undefined,
): PermissionLevel | null {
  const normalizedValue: PermissionLevel | null =
    value === 0 || value === 1 || value === 2 ? value : null;
  const minimumLevel = getMinimumPermissionLevel(moduleKey);

  if (
    minimumLevel !== null &&
    (normalizedValue === null || normalizedValue < minimumLevel)
  ) {
    return minimumLevel;
  }

  return normalizedValue;
}

export function getPermissionSelectOptions(
  moduleKey: string,
): readonly PermissionSelectOption[] {
  const minimumLevel = getMinimumPermissionLevel(moduleKey);

  if (minimumLevel === null) {
    return PERMISSION_SELECT_OPTIONS;
  }

  return PERMISSION_SELECT_OPTIONS.filter(
    (option) => option.value !== "null" && Number(option.value) >= minimumLevel,
  );
}
```

Do not remove or reorder `PERMISSION_SELECT_OPTIONS`; unaffected modules must still receive the
same tuple and labels.

- [ ] **Step 4: Run the scoped users tests**

Run:

```bash
pnpm --filter @workspace/app test:users
```

Expected: PASS for all existing tests plus the three new central-rule tests. The existing
`MODULE_TYPELESS_PACKAGE_JSON` warning may remain.

- [ ] **Step 5: Commit the central rule**

```bash
git add app/src/modules/users/constants/permissionConfig.ts \
  app/src/modules/users/run-users-tests.mjs
git commit -m "feat(users): define minimum module permissions"
```

### Task 2: Normalize Legacy Edit Drafts and Edit Payloads

**Files:**
- Modify: `app/src/modules/users/utils/permissionUtils.ts:1-179`
- Test: `app/src/modules/users/run-users-tests.mjs`

**Interfaces:**
- Consumes:
  - `normalizePermissionForModule(moduleKey: string, value: number | null | undefined): PermissionLevel | null`
  - existing `KNOWN_PERMISSION_MODULE_KEYS`
- Produces unchanged public signatures with stronger RH/Technology behavior:
  - `normalizePermissionResponse(raw: Record<string, unknown>): PermissionNormalizationResult`
  - `normalizePermissionDraft(draft: PermissionDraft, allowedExtraKeys?: readonly string[]): PermissionDraft`
  - `buildPermissionUpdatePayload(draft: PermissionDraft, extraKeys?: readonly string[]): PermissionDraft`
- Preserves: extra keys, metadata filtering, development warnings, freeze behavior, and draft
  equality semantics.

- [ ] **Step 1: Write failing legacy-normalization and payload tests**

Add these imports to `run-users-tests.mjs`:

```js
import {
  arePermissionDraftsEqual,
  buildPermissionUpdatePayload,
  freezePermissionSnapshot,
  normalizePermissionDraft,
  normalizePermissionResponse,
} from "./utils/permissionUtils.ts";
```

Add:

```js
runTest("legacy RH and Technology no-access values normalize to Viewer", () => {
  const response = normalizePermissionResponse({
    rh: null,
    ti: null,
    fiscal: null,
  });

  assert.equal(response.known.rh, 0);
  assert.equal(response.known.ti, 0);
  assert.equal(response.known.fiscal, null);

  const missingDraft = normalizePermissionDraft({});
  assert.equal(missingDraft.rh, 0);
  assert.equal(missingDraft.ti, 0);
});

runTest("normalized legacy permissions do not become dirty solely on load", () => {
  const draft = normalizePermissionDraft({
    rh: null,
    ti: null,
    fiscal: null,
  });
  const snapshot = freezePermissionSnapshot(draft);

  assert.equal(arePermissionDraftsEqual(draft, snapshot), true);
});

runTest("permission update payload enforces only RH and Technology minimums", () => {
  const payload = buildPermissionUpdatePayload({
    rh: null,
    ti: null,
    fiscal: null,
    contabil: 2,
  });

  assert.equal(payload.rh, 0);
  assert.equal(payload.ti, 0);
  assert.equal(payload.fiscal, null);
  assert.equal(payload.contabil, 2);
});
```

- [ ] **Step 2: Run the tests and observe the legacy values fail**

Run:

```bash
pnpm --filter @workspace/app test:users
```

Expected: FAIL in `legacy RH and Technology no-access values normalize to Viewer` with an
`AssertionError` showing actual `null` and expected `0`.

- [ ] **Step 3: Apply the central rule only to known-module normalization**

Change the configuration import to include the helper:

```ts
import {
  KNOWN_PERMISSION_MODULE_KEYS,
  normalizePermissionForModule,
} from "../constants/permissionConfig";
```

Initialize known modules through the helper so missing RH/Technology keys also become Viewer:

```ts
function createEmptyKnownPermissionRecord(): KnownPermissionRecord {
  return KNOWN_PERMISSION_MODULE_KEYS.reduce<KnownPermissionRecord>((acc, moduleKey) => {
    acc[moduleKey] = normalizePermissionForModule(moduleKey, undefined);
    return acc;
  }, {} as KnownPermissionRecord);
}
```

When a known response key exists, normalize it with its module identity:

```ts
known[moduleKey] = normalizePermissionForModule(
  moduleKey,
  normalizePermissionValue(raw[moduleKey]),
);
```

In `normalizePermissionDraft`, replace only the known-module assignment:

```ts
for (const moduleKey of KNOWN_PERMISSION_MODULE_KEYS) {
  normalizedDraft[moduleKey] = normalizePermissionForModule(
    moduleKey,
    normalizePermissionValue(draft[moduleKey]),
  );
}
```

Keep extra-module normalization on the existing generic `normalizePermissionValue`; unknown
modules must not inherit the RH/Technology minimum.

`buildPermissionUpdatePayload` needs no second rule because it already calls
`normalizePermissionDraft`. Verify that its loop continues to emit every known key.

- [ ] **Step 4: Run the scoped users tests**

Run:

```bash
pnpm --filter @workspace/app test:users
```

Expected: PASS, including legacy `null`, missing-key, clean-snapshot, payload-defense, higher-value,
and unaffected-module assertions.

- [ ] **Step 5: Commit edit-data normalization**

```bash
git add app/src/modules/users/utils/permissionUtils.ts \
  app/src/modules/users/run-users-tests.mjs
git commit -m "fix(users): normalize minimum edit permissions"
```

### Task 3: Apply Minimum Defaults and Options to User Creation

**Files:**
- Modify: `app/src/modules/users/components/CreateUserModal.tsx:7-15,40-84,152-160,366-392`
- Modify: `app/src/modules/users/utils/createUserPayload.ts:1-80`
- Test: `app/src/modules/users/run-users-tests.mjs`

**Interfaces:**
- Consumes:
  - `MINIMUM_PERMISSION_LEVEL_BY_MODULE`
  - `getMinimumPermissionLevel(moduleKey: string): PermissionLevel | null`
  - `normalizePermissionForModule(moduleKey: string, value: number | null | undefined): PermissionLevel | null`
  - `getPermissionSelectOptions(moduleKey: string): readonly PermissionSelectOption[]`
- Produces:
  - unchanged `CreateUserModuleSelectionState`
  - unchanged `buildCreateUserModulesPayload(...)` signature, now guaranteeing explicit
    `rh >= 0` and `ti >= 0`
  - unchanged modal props and submission contract
- Preserves: department-module display, owner disabling, eligible-user promotion to `1`, success
  reset, and all other module defaults.

- [ ] **Step 1: Change the payload expectation and add failing UI-consumption checks**

Replace the existing test named
`viewer does not receive RH or TI self-service by default` with:

```js
runTest("Viewer creation payload includes RH and Technology at Viewer minimum", () => {
  assert.deepEqual(
    buildCreateUserModulesPayload(
      {
        rh: { enabled: false, level: 0 },
        ti: { enabled: false, level: 0 },
        fiscal: { enabled: false, level: 0 },
      },
      "fiscal",
      0,
    ),
    {
      fiscal: 0,
      rh: 0,
      ti: 0,
    },
  );
});
```

Add:

```js
runTest("create user UI consumes minimum-aware defaults and options", () => {
  assert.match(
    createUserModalSource,
    /getMinimumPermissionLevel\(moduleOption\.key\)/,
  );
  assert.match(
    createUserModalSource,
    /getPermissionSelectOptions\(moduleOption\.key\)\.map/,
  );
  assert.match(
    createUserModalSource,
    /normalizePermissionForModule\(moduleKey,/,
  );
  assert.match(createUserModalSource, /CREATE_MODULE_OPTION_LABELS/);
  assert.equal(
    createUserModalSource.includes('<option value="none">Sem acesso</option>'),
    false,
  );
});
```

The existing eligible-user and explicit-management tests remain unchanged and continue proving
that level `0` can be promoted to `1`, while levels `1` and `2` are preserved.

- [ ] **Step 2: Run the tests and verify creation behavior is red**

Run:

```bash
pnpm --filter @workspace/app test:users
```

Expected: FAIL in `Viewer creation payload includes RH and Technology at Viewer minimum`; actual
payload is `{ fiscal: 0 }` before implementation. The UI source-consumption test must also fail.

- [ ] **Step 3: Defend the create payload before the existing promotion**

Import the minimum map in `createUserPayload.ts`:

```ts
import { MINIMUM_PERMISSION_LEVEL_BY_MODULE } from "../constants/permissionConfig";
```

After collecting enabled selections and before the existing
`if (departmentPermission >= 1)` block, add:

```ts
for (const [moduleKey, minimumLevel] of Object.entries(
  MINIMUM_PERMISSION_LEVEL_BY_MODULE,
)) {
  const currentLevel = modules[moduleKey];

  if (typeof currentLevel !== "number" || currentLevel < minimumLevel) {
    modules[moduleKey] = minimumLevel;
  }
}
```

Do not replace or move the existing eligible-user block:

```ts
if (departmentPermission >= 1) {
  if ((modules.ti ?? 0) < 1) {
    modules.ti = 1;
  }
  modules.rh = typeof modules.rh === "number" && modules.rh > 1 ? modules.rh : 1;
}
```

That block is the approved downstream promotion and must keep passing its existing tests.

- [ ] **Step 4: Implement minimum-aware create state, changes, and options**

Extend the `CreateUserModal` configuration import:

```ts
import {
  getMinimumPermissionLevel,
  getPermissionSelectOptions,
  normalizePermissionForModule,
} from "../constants/permissionConfig";
```

If preserving the current split import is clearer, import these helpers separately from the same
module. Do not duplicate an RH/TI key set in the component.

Preserve the create modal's current visible copy while moving option filtering to the shared
helper. Add this mapping after `ModuleSelectValue`:

```ts
const CREATE_MODULE_OPTION_LABELS: Record<ModuleSelectValue, string> = {
  none: "Sem acesso",
  "0": "Visualizador",
  "1": "Usuario",
  "2": "Administrador",
};
```

Update `createInitialModuleSelections`:

```ts
function createInitialModuleSelections(): ModuleSelectionState {
  return CREATE_USER_MODULE_OPTIONS.reduce((acc, moduleOption) => {
    const minimumLevel = getMinimumPermissionLevel(moduleOption.key);

    acc[moduleOption.key] = {
      enabled: minimumLevel !== null,
      level: minimumLevel ?? 0,
    };
    return acc;
  }, {} as ModuleSelectionState);
}
```

Normalize the sentinel before updating component state:

```ts
const handleModuleLevelChange = (moduleKey: ModuleKey, value: ModuleSelectValue) => {
  const normalizedLevel = normalizePermissionForModule(
    moduleKey,
    value === "none" ? null : Number(value),
  );

  setSubmitError(null);
  setModuleSelections((prev) => ({
    ...prev,
    [moduleKey]: {
      enabled: normalizedLevel !== null,
      level: normalizedLevel ?? 0,
    },
  }));
};
```

Replace the four literal `<option>` elements with the central options and the existing
create-specific labels:

```tsx
{getPermissionSelectOptions(moduleOption.key).map((option) => {
  const createValue: ModuleSelectValue =
    option.value === "null" ? "none" : option.value;

  return (
    <option key={option.value} value={createValue}>
      {CREATE_MODULE_OPTION_LABELS[createValue]}
    </option>
  );
})}
```

This maps only the existing edit sentinel `"null"` to the create-form sentinel `"none"`.
RH/Technology never receive that option because the helper filters it out. Other modules preserve
their current values and exact visible labels.

- [ ] **Step 5: Run the scoped users tests**

Run:

```bash
pnpm --filter @workspace/app test:users
```

Expected: PASS. Specifically confirm output includes:

- `PASS Viewer creation payload includes RH and Technology at Viewer minimum`
- `PASS create user UI consumes minimum-aware defaults and options`
- `PASS eligible non-RH user receives RH and TI self-service by default`
- `PASS explicit RH and TI management are preserved on user creation`

- [ ] **Step 6: Commit the create-flow behavior**

```bash
git add app/src/modules/users/components/CreateUserModal.tsx \
  app/src/modules/users/utils/createUserPayload.ts \
  app/src/modules/users/run-users-tests.mjs
git commit -m "fix(users): enforce minimum create permissions"
```

### Task 4: Apply Module-Specific Options to Permission Editing

**Files:**
- Modify: `app/src/shared/components/newLayout/Administracao.tsx:16-20,82-94,531-540,1119-1160`
- Test: `app/src/modules/users/run-users-tests.mjs`

**Interfaces:**
- Consumes:
  - `getPermissionSelectOptions(moduleKey: string): readonly PermissionSelectOption[]`
  - `normalizePermissionForModule(moduleKey: string, value: number | null | undefined): PermissionLevel | null`
  - minimum-aware `normalizePermissionDraft` and `buildPermissionUpdatePayload` from Task 2
- Produces: unchanged administration component props and save flow, with module-specific edit
  options and defensive value normalization.
- Preserves: owner-disabled controls, department badge, dirty-state comparison, direct permission
  update, department synchronization, cache updates, and session refresh.

- [ ] **Step 1: Write the failing editor-consumption test**

Add:

```js
runTest("admin permission editor uses module-specific options and normalization", () => {
  assert.match(
    administracaoSource,
    /getPermissionSelectOptions\(moduleKey\)\.map/,
  );
  assert.match(
    administracaoSource,
    /normalizePermissionForModule\(\s*moduleKey,/s,
  );
  assert.doesNotMatch(
    administracaoSource,
    /\{PERMISSION_SELECT_OPTIONS\.map\(\(option\) => \(/,
  );
});
```

Keep the existing `department module remains editable in permissions tab` test unchanged; it
guards the approved department behavior and the out-of-scope synchronization flow.

- [ ] **Step 2: Run the tests and verify the editor check fails**

Run:

```bash
pnpm --filter @workspace/app test:users
```

Expected: FAIL in
`admin permission editor uses module-specific options and normalization` because the component
still maps `PERMISSION_SELECT_OPTIONS` directly and assigns `null` directly.

- [ ] **Step 3: Import and use module-specific edit helpers**

Extend the permission configuration import in `Administracao.tsx`:

```ts
import {
  PERMISSION_MODULE_GROUPS,
  PERMISSION_SELECT_OPTIONS,
  getPermissionModuleLabel,
  getPermissionSelectOptions,
  normalizePermissionForModule,
} from "@modules/users/constants/permissionConfig";
```

Retain `PERMISSION_SELECT_OPTIONS` only for the existing `PermissionSelectValue` type derivation.
Do not use it to render rows.

Normalize edit changes before passing the draft through the existing full-draft normalizer:

```ts
const handlePermissionChange = (moduleKey: string, nextValue: PermissionSelectValue) => {
  const normalizedValue = normalizePermissionForModule(
    moduleKey,
    nextValue === "null" ? null : Number(nextValue),
  );

  setPermissionDraft((currentDraft) =>
    normalizePermissionDraft(
      {
        ...currentDraft,
        [moduleKey]: normalizedValue,
      },
      permissionExtraKeys,
    ),
  );
  setPermissionSaveError(null);
};
```

Replace the editor's global option mapping:

```tsx
{getPermissionSelectOptions(moduleKey).map((option) => (
  <option key={option.value} value={option.value}>
    {option.label}
  </option>
))}
```

Do not add a disabled `Sem acesso` option. Native select behavior remains accessible because only
valid options are present and the draft has already been normalized before rendering.

- [ ] **Step 4: Run the scoped users tests**

Run:

```bash
pnpm --filter @workspace/app test:users
```

Expected: PASS for all rule, create, legacy normalization, edit payload, UI source-consumption,
existing provisioning, and department synchronization tests.

- [ ] **Step 5: Commit the edit UI behavior**

```bash
git add app/src/shared/components/newLayout/Administracao.tsx \
  app/src/modules/users/run-users-tests.mjs
git commit -m "fix(users): constrain module permission editing"
```

## Final Verification

- [ ] Run the complete scoped users suite from the repository root:

```bash
pnpm --filter @workspace/app test:users
```

Expected: exit `0`, with every existing and new users test reporting `PASS`. The
`MODULE_TYPELESS_PACKAGE_JSON` warning may remain but must not hide a failing assertion.

- [ ] Run frontend typecheck:

```bash
pnpm --filter @workspace/app typecheck
```

Expected if workspace package resolution is available: exit `0`.

Expected on the recorded baseline environment: exit `2` with only the same five `TS2307` errors
for unresolved `@workspace/api`. If any changed users or administration file appears in the error
output, treat it as a new failure and fix it before proceeding. Do not modify the unrelated shared
hooks or API package merely to change the baseline.

- [ ] Check formatting and whitespace for changed files:

```bash
git diff --check origin/develop...HEAD
```

Expected: no output and exit `0`.

- [ ] Confirm no backend or out-of-scope file changed:

```bash
git diff --name-only origin/develop...HEAD
```

Expected implementation paths, in addition to the approved spec and plan, are limited to:

```text
app/src/modules/users/constants/permissionConfig.ts
app/src/modules/users/components/CreateUserModal.tsx
app/src/modules/users/utils/createUserPayload.ts
app/src/modules/users/utils/permissionUtils.ts
app/src/shared/components/newLayout/Administracao.tsx
app/src/modules/users/run-users-tests.mjs
```

No path under `services/`, `infra/`, `packages/api/`, or gateway scope may appear.

- [ ] Review helper call sites and ensure both forms use the same rule:

```bash
rg -n \
  "MINIMUM_PERMISSION_LEVEL_BY_MODULE|getMinimumPermissionLevel|normalizePermissionForModule|getPermissionSelectOptions" \
  app/src/modules/users app/src/shared/components/newLayout/Administracao.tsx
```

Expected:

- the minimum map and three helpers are defined only in `permissionConfig.ts`;
- creation initialization, changes, options, and payload construction consume them;
- edit draft normalization, changes, options, and payload construction consume them; and
- no duplicate local `rh`/`ti` minimum list exists in either component.

- [ ] Review the complete implementation diff:

```bash
git diff origin/develop...HEAD -- \
  app/src/modules/users/constants/permissionConfig.ts \
  app/src/modules/users/components/CreateUserModal.tsx \
  app/src/modules/users/utils/createUserPayload.ts \
  app/src/modules/users/utils/permissionUtils.ts \
  app/src/shared/components/newLayout/Administracao.tsx \
  app/src/modules/users/run-users-tests.mjs
```

Confirm line by line that:

- RH and Technology default to Viewer;
- only their no-access option is removed;
- higher levels and other modules are unchanged;
- legacy `null` becomes Viewer in both draft and snapshot paths;
- no automatic mutation was introduced on editor load;
- existing Viewer-to-User promotion remains intact;
- no top-level permission, owner, department, cache, or session logic changed; and
- tests assert observable options/defaults plus payload defenses.

- [ ] Perform focused manual UI verification with an authenticated administration session:

1. Open `Administracao > Usuários > Novo usuário`.
2. Confirm RH and Technology start at `Visualizador`.
3. Confirm RH and Technology offer only `Visualizador`, `Usuário`, and `Administrador`.
4. Confirm Fiscal or another unaffected module still starts at and offers `Sem acesso`.
5. Select User and Administrator for RH/Technology and confirm both remain selectable.
6. Open `Administracao > Permissões` for a fixture or legacy user whose RH/Technology values are
   `null`.
7. Confirm both display `Visualizador` and that opening the record alone does not enable save.
8. Change another permission, save, and confirm RH/Technology remain at least Viewer after refresh.
9. Confirm owner controls remain disabled and department badges remain unchanged.

- [ ] Record final evidence in the handoff:

Include the users test result, typecheck result with the baseline distinction, manual verification
result, commit SHAs for Tasks 1-4, and confirmation that no backend file changed. Do not push until
explicitly requested.
