# User Module Minimum Permissions Design

## Context

Issue #515 reports that the user creation and permission editing interfaces still offer
`Sem acesso` for the RH and Technology modules. Those modules are intended to be available to every
user at a minimum Viewer level in the administration UI.

The current frontend models all additional modules uniformly:

- the create-user modal initializes every module as disabled and renders that state as
  `Sem acesso`;
- the permission editor uses one global option list containing `Sem acesso`; and
- permission response normalization preserves `null` for every module, including RH and
  Technology.

Recent self-service provisioning added a separate payload and backend policy that may promote RH
and Technology to level `1` for eligible users. That policy did not update the UI defaults or
available options, so the interface can display or accept a value that is inconsistent with the
effective access granted after submission.

Graphify did not have a local UI graph in this worktree. Discovery used the manual fallback defined
by `AGENTS.md`, based on focused source searches, Git history, and direct inspection of the current
frontend files.

## Goals

- Define one frontend domain rule that gives RH and Technology a minimum permission level of
  Viewer (`0`).
- Initialize both modules as Viewer in the create-user UI.
- Remove `Sem acesso` from the RH and Technology selects in both creation and editing.
- Preserve the existing Viewer, User, and Administrator choices for RH and Technology.
- Preserve all existing choices and defaults for every other module.
- Normalize legacy `null` RH or Technology values to Viewer in the edit form.
- Defend the rule at frontend state and payload boundaries so a stale or manually constructed UI
  state cannot submit `null` for RH or Technology.
- Cover module-specific options and defaults in the existing users test suite.

## Non-goals

- Do not modify `user-service`, permission schemas, database constraints, migrations, routes, or
  OpenAPI.
- Do not change the current backend or create-payload policy that may promote eligible users from
  Viewer (`0`) to User (`1`) for RH or Technology.
- Do not migrate existing permission rows automatically when the editor is opened.
- Do not change top-level user permission, user type, department-permission synchronization, owner
  behavior, or authorization rules.
- Do not change permission options for modules other than RH and Technology.
- Do not introduce a new UI test framework or refactor the administration page beyond what this
  rule requires.
- Do not address the adjacent `userService.update` serialization gap for `type` and `modules`.
  That behavior predates this issue and is not required to implement the module-specific UI
  minimum. It should be tracked and validated separately.

## Current Behavior and Root Cause

`CreateUserModal.createInitialModuleSelections` currently assigns
`{ enabled: false, level: 0 }` to every module. `getModuleSelectValue` maps a disabled selection to
the string sentinel `"none"`, and every additional-module select renders the same four options,
starting with `Sem acesso`.

The edit flow in `Administracao` loads the permission record, passes it through
`normalizePermissionResponse` and `normalizePermissionDraft`, and renders every known module from
the shared `PERMISSION_SELECT_OPTIONS`. That global list starts with `{ value: "null", label:
"Sem acesso" }`. `handlePermissionChange` also accepts `"null"` for every module.

The create payload and backend contain a newer, independent rule: when the user's department
permission makes the user eligible for self-service, RH and Technology can be promoted to level
`1`. This protects some submitted records but does not fix the visible default, does not prevent the
user from selecting `Sem acesso`, and does not normalize legacy `null` values in the editor.

The root cause is therefore a missing module-specific rule in the frontend permission model. The
controls, normalization, and tests still assume that all modules allow the same minimum value.

## Considered Approaches

### 1. Add local conditions in both components

The create modal and administration editor could each special-case `rh` and `ti`, filter their
options, and coerce their local values.

This is a small diff, but it duplicates the business rule, leaves payload builders dependent on UI
correctness, and makes future drift likely.

### 2. Define a central frontend rule and consume it at every UI boundary

The users permission domain will declare RH and Technology minimums centrally. Small pure helpers
will expose whether a module allows no access, normalize a module value, and return valid options.
Creation state, edit normalization, change handlers, and payload builders will consume those
helpers.

This is the selected approach. It keeps the change frontend-only, is directly testable, and
protects all relevant UI boundaries without changing unrelated modules.

### 3. Enforce the minimum in the backend

The API could reject or coerce `null` for RH and Technology and migrate existing rows.

This would provide a system-wide invariant, but it expands a UI issue into an API and data
contract change. It may affect existing integrations and conflicts with the approved requirement
to leave the backend and its current promotion behavior unchanged.

## Architecture and Components

### Central permission rule

`app/src/modules/users/constants/permissionConfig.ts` will own the module-specific minimum, using a
typed representation equivalent to:

```ts
const MINIMUM_PERMISSION_LEVEL_BY_MODULE = {
  rh: 0,
  ti: 0,
} as const;
```

The same module will expose these focused pure helpers:

- `getMinimumPermissionLevel(moduleKey)`, returning `0` for RH and Technology and `null` when a
  module has no frontend minimum;
- `normalizePermissionForModule(moduleKey, value)`, preserving valid values while raising
  `null`, `undefined`, or a value below the configured minimum; and
- `getPermissionSelectOptions(moduleKey)`, returning the filtered native-select options.

The minimum map is the single source of truth. The generic `PERMISSION_SELECT_OPTIONS` remains
available as the complete option set for modules that still allow no access.

### Create-user form

`app/src/modules/users/components/CreateUserModal.tsx` will use the central rule when creating
module selection state:

- RH starts as `{ enabled: true, level: 0 }`;
- Technology starts as `{ enabled: true, level: 0 }`; and
- every other module keeps `{ enabled: false, level: 0 }`.

The RH and Technology selects will render Viewer, User, and Administrator, in that order. They will
not render `Sem acesso`. Other module selects retain the current option order and sentinel.

`handleModuleLevelChange` will apply the same minimum defensively instead of trusting the rendered
options. The existing reset after a successful creation will call the same initializer, restoring
the approved defaults.

`app/src/modules/users/utils/createUserPayload.ts` will apply the central minimum when building the
module payload. This guarantees explicit RH and Technology values of at least `0`, including for a
top-level Viewer, even if the caller supplies stale module state.

The existing self-service rule is intentionally preserved. For eligible users it may promote RH or
Technology from UI-default Viewer (`0`) to User (`1`). The UI default is a minimum selection, not a
promise that downstream policy will persist exactly level `0`.

### Permission edit form

`app/src/modules/users/utils/permissionUtils.ts` will apply the central minimum while normalizing a
permission draft and while building an update payload:

- legacy `rh: null`, missing `rh`, `ti: null`, or missing `ti` become `0`;
- existing `1` and `2` values remain unchanged; and
- all other module values keep the current normalization behavior.

`app/src/shared/components/newLayout/Administracao.tsx` will request options per module instead of
mapping the unfiltered global list. Its change handler will use the same normalization helper as a
defense against an invalid programmatic value.

The normalized Viewer value will be used for both the loaded draft and its comparison snapshot.
Opening a legacy record therefore does not mark the form dirty and does not issue an automatic
write. The stored `null` remains unchanged until the administrator submits a real edit. Any
subsequent permission payload from this UI includes at least Viewer for RH and Technology.

The department badge, owner-disabled state, loading state, save lifecycle, cache updates, and
session refresh behavior remain unchanged.

## Data Flow

### Creation

1. The create modal initializes all module selections from the central minimum rule.
2. RH and Technology render with Viewer selected and without `Sem acesso`.
3. Change handlers normalize the selected value against the module minimum.
4. `buildCreateUserModulesPayload` normalizes the final module record again.
5. The frontend sends the existing create-user request.
6. The unchanged backend may preserve the submitted level or apply its existing promotion policy.

### Editing

1. The permission API returns the existing module record.
2. Existing response-shape normalization runs as it does today.
3. Draft normalization converts legacy or missing RH/Technology values to Viewer.
4. The editor renders module-specific option lists.
5. Change handlers and the payload builder enforce the same minimum.
6. The existing permission update request and post-save refresh run unchanged.

## UX and Accessibility

- Native `<select>` controls, existing labels, focus behavior, keyboard interaction, and disabled
  states remain intact.
- RH and Technology show `Visualizador` as the selected value on initial creation and for legacy
  null values in editing.
- Their option order remains progressive: `Visualizador`, `Usuário`, `Administrador`.
- `Sem acesso` is absent rather than shown disabled, so keyboard and screen-reader users are not
  presented with an unavailable action.
- Other modules continue to show `Sem acesso`, `Visualizador`, `Usuário`, and `Administrador`.
- No new toast, inline error, loading state, or explanatory copy is required because invalid
  choices are no longer exposed and stale values are normalized deterministically.

## Error Handling and Compatibility

- No new network or backend error path is introduced.
- Legacy permission responses with `null`, missing keys, or unexpected metadata continue through
  the existing response normalizer. Only RH and Technology receive the new minimum.
- Higher RH and Technology values are preserved.
- Owner users remain read-only in the permission editor and continue to receive backend-managed
  maximum access.
- Department-linked module behavior remains unchanged.
- The backend still accepts `null` from other callers because API enforcement is out of scope.
- The frontend and backend may continue to differ between a Viewer UI default and an effective
  User level after approved self-service promotion. Tests must document this intentional behavior
  rather than treating it as an error.

## Detailed Test Strategy

Implementation will follow TDD within
`app/src/modules/users/run-users-tests.mjs`, the existing scoped users test runner.

Pure rule and normalization tests will prove that:

- RH and Technology have minimum level `0`;
- their option lists contain exactly Viewer, User, and Administrator;
- modules such as Fiscal still include `Sem acesso`;
- `null` and `undefined` normalize to `0` only for RH and Technology;
- levels `1` and `2` are preserved;
- `null` remains valid for modules without a minimum; and
- normalization is idempotent.

Creation tests will prove that:

- initial module selections enable RH and Technology at level `0`;
- another module remains disabled by default;
- a defensive change cannot place RH or Technology below Viewer;
- a top-level Viewer payload includes `rh: 0` and `ti: 0`;
- explicit RH or Technology levels `1` and `2` are preserved;
- a Viewer (`0`) selection may still be promoted by the existing provisioning policy; and
- the current eligible-user promotion to level `1` remains accepted.

Editing tests will prove that:

- a loaded legacy draft with `rh: null` and `ti: null` becomes Viewer for both;
- the normalized snapshot matches the normalized draft, so opening legacy data alone is not dirty;
- a generated update payload cannot contain `rh: null` or `ti: null`;
- unrelated module values are unchanged; and
- the administration component consumes module-specific options instead of the global option list
  directly for every row.

Because the package does not currently use a component DOM testing library for this area, tests
will prefer exported pure view-model helpers and existing source-level UI checks rather than
introducing a new runner. Manual verification will cover the rendered controls:

1. Open `Administracao > Usuários > Novo usuário`.
2. Confirm RH and Technology start at Viewer and do not offer `Sem acesso`.
3. Confirm another module still starts at `Sem acesso` and retains all four choices.
4. Open `Administracao > Permissões` for a user with legacy null RH/Technology permissions.
5. Confirm both display Viewer without enabling save solely because the record was opened.
6. Confirm User and Administrator remain selectable and save normally.

Final validation will include:

- `pnpm --filter @workspace/app test:users`;
- `pnpm --filter @workspace/app typecheck`;
- a focused Biome or repository-equivalent check on changed frontend files, if available;
- `git diff --check`; and
- direct diff and call-site review for both permission forms and payload builders.

The implementation baseline has a known environment resolution failure in frontend typecheck:
`@workspace/api` cannot be resolved from several shared hooks and `shared/services/api.ts`. The
feature must not add new type errors; the pre-existing baseline failure should be reported
separately if it remains.

## Rollout and Risks

- **Legacy display differs from persisted data:** legacy `null` is shown as Viewer but is not
  written automatically. Mitigation: document the behavior and guarantee that the next submitted
  UI payload contains the normalized minimum.
- **Frontend/backend level difference:** current provisioning may promote Viewer to User.
  Mitigation: preserve and explicitly test the approved promotion policy.
- **Rule applied only in rendering:** filtering options alone would still allow invalid state.
  Mitigation: enforce the minimum in initialization, handlers, draft normalization, and payload
  construction.
- **Regression in unrelated modules:** broad normalization could accidentally remove their
  no-access state. Mitigation: key the rule exclusively by `rh` and `ti` and test a representative
  unaffected module.
- **Controlled select with a missing option:** merely hiding `Sem acesso` while retaining a null
  value can produce inconsistent browser behavior. Mitigation: normalize before rendering.
- **Scope expansion into user update serialization:** the existing `type`/`modules` serialization
  gap is real but independent. Mitigation: leave it unchanged here and create a separate issue if
  its flow needs correction.

No feature flag is required. The change is limited to administration frontend behavior and can be
rolled out with the normal app deployment.

## Acceptance Criteria

- RH starts at Viewer in the create-user UI.
- Technology starts at Viewer in the create-user UI.
- Neither RH nor Technology offers `Sem acesso` in creation or editing.
- Viewer, User, and Administrator remain available for both modules.
- Existing higher values are preserved.
- Legacy null or missing RH/Technology values display as Viewer in editing without an automatic
  save.
- Any create or edit payload produced by these frontend flows contains RH and Technology at level
  `0` or higher.
- All other module options, defaults, values, and payload behavior remain unchanged.
- Backend code, schemas, routes, OpenAPI, and database state are unchanged.
- The current downstream promotion from Viewer to User remains permitted and covered.
- Scoped users tests cover options, defaults, normalization, higher-level preservation, and
  unaffected modules.

## Planned Files

- `app/src/modules/users/constants/permissionConfig.ts`
  - central RH/Technology minimum rule and module-specific option helpers.
- `app/src/modules/users/components/CreateUserModal.tsx`
  - minimum-aware initial state, options, and change handling.
- `app/src/modules/users/utils/createUserPayload.ts`
  - creation payload defense and explicit Viewer defaults.
- `app/src/modules/users/utils/permissionUtils.ts`
  - legacy normalization and edit payload defense.
- `app/src/shared/components/newLayout/Administracao.tsx`
  - module-specific edit options and normalized changes.
- `app/src/modules/users/run-users-tests.mjs`
  - scoped tests for defaults, options, normalization, payloads, and regressions.

No service, schema, migration, route, OpenAPI, or infrastructure file is planned.
