# Issue 509: TI Robot Required-Field Errors Design

## Context

Issue #509 reports that the `Tecnologia > Robôs` create and edit dialog exposes a technical
`Request failed with status code 400` message when the submitted robot data is invalid. The form
also lacks field-level validation states, does not focus the first invalid field, and does not
associate validation feedback with its controls for assistive technologies.

The active frontend is `TiRobotsTab`; the legacy Tecnologia mock is not part of this flow. The
active backend contract is `POST /ti/robots` and `PATCH /ti/robots/:id` in `ti-service`.

## Goals

- Show a specific inline message for every missing required robot field.
- Give every invalid required control an unambiguous visual state.
- Focus the first invalid control after a failed submit.
- Associate labels, required state, invalid state, and error text semantically.
- Keep the dialog open and preserve the draft so the user can correct it in place.
- Prevent empty optional create fields from producing an avoidable HTTP `400`.
- Prefer the API error envelope over Axios's technical status message.
- Return field-specific Portuguese messages for missing required fields at the API boundary.
- Keep the change focused on the active TI robot form and its existing API contract.

## Non-goals

- Do not introduce a form library or a module-wide validation framework.
- Do not refactor all TI form controls or all API error helpers.
- Do not change robot permissions, routes, query keys, cache invalidation, database structure, or
  organization scoping.
- Do not change robot-run registration validation.
- Do not reactivate or modify the legacy Tecnologia mock.
- Do not redesign the dialog or the Robôs workspace.
- Do not change how non-validation server errors are serialized globally.

## Root Cause

The defect is a combination of frontend payload, error parsing, and form-state problems.

First, `buildRobotPayload` currently converts blank `description` and `schedule` values to `null`
for both create and update. The create schema accepts those fields as optional strings but not as
`null`, so a minimal create request that contains valid `name` and `type` values can still return
`400`. The update schema, in contrast, intentionally accepts `null` so an existing optional value
can be cleared.

Second, `getErrorMessage` checks `error instanceof Error` before inspecting an Axios response.
Because `AxiosError` extends `Error`, the function returns `Request failed with status code 400`
and never reaches the response body. Its unreachable response branch also reads
`response.data.message`, while the shared error envelope uses `response.data.error`.

Third, the form stores only one global `formError` and validates required fields sequentially.
Only one message can be shown, neither control receives an invalid state, and no invalid control is
focused. The labels visually wrap their controls, but the errors are not identified or referenced
through ARIA attributes.

Finally, the create draft initializes `type` to `Monitoramento` and the form select has no empty
option. This makes the backend-required type an implicit default rather than an explicit user
choice, and prevents the UI from exercising or displaying its missing-field state.

## Required-Field Contract

`POST /ti/robots` requires:

- `name`: a non-empty, trimmed string;
- `type`: one of `Backup`, `Relatorio`, `Integracao`, `Manutencao`, or `Monitoramento`.

`status` defaults to `active`, and `active` defaults to `true`. `description` and `schedule` are
optional on create. The frontend must omit them when blank.

`PATCH /ti/robots/:id` requires at least one property but does not require a particular field.
Blank optional text in the edit form may be serialized as `null` to clear a previously stored
description or schedule.

## Considered Approaches

### 1. Focused local validation and separate create/update payload builders

Keep validation state inside `TiRobotsTab`, validate all required fields on submit, render inline
errors, and focus the first invalid field. Build create and update payloads according to their
different nullability contracts.

This is the selected approach. It meets all acceptance criteria with a small, domain-local change
and avoids a broad form abstraction.

### 2. Browser-native constraint validation

Add `required` and rely on the browser to block submit and focus the first invalid control.

This reduces local state, but browser messages vary, field styling and live feedback become harder
to control, and it does not solve API error parsing or create payload nullability. Native
attributes remain useful semantic reinforcement, but native validation alone is insufficient.

### 3. Shared TI form-field and API-error framework

Extend all TI inputs and selects with shared error props and centralize Axios error normalization.

This could improve consistency across the module, but it expands the issue into unrelated forms
and increases regression risk. The issue does not justify that refactor.

## Architecture and Components

### `TiRobotsTab`

`TiRobotsTab` remains the owner of the robot dialog, its draft, validation, mutation, and API
feedback. It will add:

- a local `fieldErrors` object limited to `name` and `type`;
- a form ref plus stable `name` attributes used to locate and focus the invalid native control;
- a validation function that returns all current required-field errors;
- separate create and update payload construction;
- field change handlers that update the draft and clear only that field's resolved error; and
- post-validation focus logic for the first invalid field in visual order.

The existing global `formError` remains available for request-level errors that cannot be assigned
to one field. Local required-field failures are shown inline rather than being flattened into the
global banner.

### Type Select

The create draft starts with an empty `type`. `ROBOT_FORM_TYPE_OPTIONS` receives a disabled,
empty option labeled `Selecione o tipo` before the domain values. The empty value makes the
required state explicit and testable.

Editing continues to initialize the select from the stored robot type. Existing valid records
therefore do not require a new choice.

`TiNativeSelect` already forwards native select attributes, including `id`, `name`, `required`,
and ARIA attributes. It does not need to change. The form locates the native type select through
its form ref and the select's stable `name`.

### Payload Types

The existing `TiRobotPayload` will make `name` and `type` required. Its optional text properties
remain nullable because the same mutation contract supports update clearing. Separate create and
update builders enforce the runtime difference: create omits blank optional text, while update
sends `null` for blank optional text.

No service URL, mutation behavior, or React Query key changes.

### Backend Schema

`createTiRobotBodySchema` will provide explicit Portuguese messages for both required fields:

- `Informe o nome do robô.`
- `Selecione o tipo do robô.`

The name rule must use the same message for an absent value, an empty string, or whitespace-only
input. The type enum must use the specific required message when absent while preserving a clear
invalid-option message for values outside the enum.

The route and `parseWithZod` flow remain unchanged. Invalid requests continue to use the shared
`400 BAD_REQUEST` envelope.

## Data Flow

### Create

1. Opening `Novo robô` resets the draft, local field errors, and global form error.
2. `name` and `type` start empty; status and active retain their existing defaults.
3. Submit trims the name and validates both required fields in one pass.
4. If either field is invalid:
   - all relevant inline errors are stored together;
   - no mutation runs;
   - the dialog and draft remain unchanged; and
   - focus moves to the first invalid field in DOM order.
5. If validation passes, the create builder includes required/defaulted values and includes
   `description` or `schedule` only when their trimmed values are non-empty.
6. On success, existing cache invalidation runs and the dialog closes.
7. On request failure, the dialog stays open and the draft is preserved.

### Update

1. Opening `Editar robô` hydrates the current robot and clears stale errors.
2. The same required-field validation runs before mutation.
3. The update builder sends `null` for a blank description or schedule to clear the stored value.
4. Success closes the dialog; validation or request failure keeps it open.

## UX and Accessibility

The form will expose both required fields consistently:

- Labels show a visible required marker and use stable `htmlFor`/`id` relationships.
- Controls include native `required` semantics.
- Invalid controls set `aria-invalid="true"`.
- Each inline error has a stable ID and is referenced by its control through `aria-describedby`.
- Inline messages use visible text, not color alone:
  - `Informe o nome do robô.`
  - `Selecione o tipo do robô.`
- Invalid controls receive the existing TI visual language plus a red border/ring state.
- A submit with multiple missing values displays both messages at the same time.
- Focus moves to `name` when both are invalid, or to `type` when only type is invalid.
- Focus is requested only after a submit failure; clearing an error while typing must not steal
  focus.
- Request-level errors use the existing banner with `role="alert"`. They must not replace
  field-level required messages.

The existing Radix dialog focus trap and close behavior remain intact. Validation must not close
and reopen the dialog, remount the form, or reset user input.

## Error and Compatibility Handling

`getErrorMessage` will inspect an Axios-shaped response before falling back to `Error.message`.
For the shared envelope, `response.data.error` is the preferred message. `response.data.message`
remains a compatibility fallback after `error`, followed by `Error.message`. A missing or unsafe
response message falls back to the existing friendly generic copy.

The UI must never display `Request failed with status code 400` for a validation response.

Client-side required validation protects the normal interaction, while backend validation remains
authoritative for direct API clients and malformed requests. Backend messages use the same product
copy as the frontend where the same missing-field condition is represented.

Create requests omit blank optional text to match the current OpenAPI and Zod contract. Update
requests retain `null` clearing behavior already accepted by the update schema. Existing robot
records and responses remain compatible.

## Test Strategy

Implementation follows TDD.

### Frontend tests

Focused TI tests will first prove that:

- a new robot draft starts with an empty type and exposes `Selecione o tipo`;
- submitting empty name and type produces both specific messages;
- the first invalid field is name;
- a valid name with an empty type focuses type;
- invalid controls expose required, `aria-invalid`, and error-description associations;
- correcting one field clears only that field's error;
- local validation does not call the mutation;
- validation and request failures keep the dialog open and preserve the draft;
- create payloads omit blank `description` and `schedule`;
- update payloads use `null` to clear those fields;
- API envelope `error` is preferred over Axios's technical `Error.message`; and
- success continues to close the dialog and invalidate the existing caches.

Pure validation and payload helpers should receive behavioral assertions where practical. Existing
source guardrails may supplement, but must not be the only evidence for focus and validation
behavior.

### Backend tests

`tiRobot.routes.test.ts` will first prove that:

- create without `name` returns `400` and `Informe o nome do robô.`;
- create with blank or whitespace-only `name` returns the same message;
- create without `type` returns `400` and `Selecione o tipo do robô.`;
- invalid requests do not reach Prisma;
- a minimal `{ name, type }` request returns `201` with existing defaults; and
- the existing valid full payload still returns `201`.

The OpenAPI required list remains `name` and `type`. Because no route or operation is added, no
smoke manifest entry is required.

### Validation commands

- `pnpm --filter @workspace/app test:ti`
- `pnpm --filter @workspace/app typecheck`
- `pnpm --filter @workspace/ti-service test`
- `pnpm --filter @workspace/ti-service typecheck`
- scoped Biome checks for changed source and test files
- a manual browser smoke confirming focus order, inline errors, and in-place correction
- `git diff --check`
- direct diff and call-site review

Baseline runs on 2026-07-27 contain unrelated blockers that must not be silently attributed to
this issue:

- `app test:ti` stops at a password clipboard source guardrail;
- `app typecheck` cannot resolve `@workspace/api`;
- `ti-service test` cannot resolve built `@workspace/shared/logger` subpath exports in route
  suites; and
- `ti-service typecheck` cannot run Prisma generation without `DATABASE_URL`.

Implementation validation must either run in a correctly bootstrapped workspace or report these
same blockers explicitly; it must not change unrelated code to make the baseline green.

## Rollout and Risks

- **Risk: create/edit payload semantics diverge.** Keep distinct builders and test both blank
  optional-field paths.
- **Risk: focus occurs before error markup renders.** Trigger focus after validation state is
  committed, using a targeted one-shot effect keyed by the submit attempt.
- **Risk: focus is repeatedly stolen.** Tie focus to submit attempts, not every field-error render.
- **Risk: frontend and backend copy drift.** Assert the exact approved messages at both boundaries.
- **Risk: valid historical types are unexpected.** Preserve edit hydration and the current enum;
  do not normalize or migrate stored data in this issue.
- **Risk: unrelated baseline failures hide regressions.** Record baseline failures, run the most
  focused tests available, and compare final failures against the baseline.

The change requires no migration, feature flag, data backfill, or staged deployment. Frontend and
`ti-service` should be deployed through the normal release flow.

## Acceptance Criteria

- Missing name shows `Informe o nome do robô.` inline beside the name input.
- Missing type shows `Selecione o tipo do robô.` inline beside the type select.
- When both are missing, both messages and both invalid visual states are visible.
- The first invalid field receives focus after submit.
- Labels, required state, invalid state, and error messages are programmatically associated.
- No create or update mutation runs while required fields are invalid.
- The dialog remains open and the draft remains editable after local or API validation failure.
- A minimal valid create request does not send `null` optional text fields and does not fail for
  them.
- Edit can still clear optional text fields with `null`.
- API validation errors use `response.data.error`; technical Axios `400` copy is not displayed.
- Direct API requests missing name or type receive the specific Portuguese message in a standard
  `400 BAD_REQUEST` envelope.
- Existing successful create, edit, cache invalidation, permissions, and route behavior remain
  unchanged.

## Planned Files

- `app/src/modules/ti/components/TiRobotsTab.tsx`
  - local field errors, validation, focus, accessible markup, payload separation, API error parsing
- `app/src/modules/ti/types/robots.ts`
  - align create and update payload typing with the backend contract
- `app/src/modules/ti/run-ti-tests.mjs`
  - focused regression coverage and source guardrails
- `services/ti-service/src/schemas/tiRobot.schemas.ts`
  - field-specific required messages
- `services/ti-service/src/test/tiRobot.routes.test.ts`
  - route-level message and minimal-create coverage

`services/ti-service/src/routes/tiRobot.routes.ts`, the service implementation, database schema,
gateway, and smoke manifest are not expected to change.
