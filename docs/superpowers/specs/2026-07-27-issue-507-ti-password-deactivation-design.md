# TI Password Credential Deactivation Design

**Issue:** #507 — `[Produto] Tecnologia Senhas: permitir inativar ou excluir credenciais`

**Date:** 2026-07-27

**Status:** Approved for implementation

## Summary

The TI password catalog will support soft deactivation only. An administrator can deactivate an
active credential through an explicit confirmation dialog with a required reason. Deactivation
preserves the encrypted credential record and writes the authoritative actor, timestamp, and reason
in the same atomic database mutation that changes the record to inactive.

Inactive credentials are excluded from the default list, can be selected through an
administrator-only status filter, and cannot be revealed, copied, edited, deactivated again,
reactivated, or permanently deleted. The backend is the security boundary for all of these rules;
the frontend mirrors them for clear and safe interaction.

## Approved Decisions

- Support soft deactivation only.
- Do not add permanent deletion.
- Do not add reactivation.
- Restrict password listing, reveal, creation, update, filtering, and deactivation to TI module
  administrators.
- Add `active`, `deactivated_at`, `deactivated_by_user_id`, and `deactivation_reason` to
  `PasswordTecnologia`.
- Keep `deactivated_by_user_id` as a scalar audit value without a foreign key so user lifecycle
  changes cannot erase the recorded actor.
- Add an organization/status/local index for the list query.
- Expose `POST /ti/passwords/:id/deactivate`.
- Require a trimmed, non-empty deactivation reason with a maximum length of 500 characters.
- Accept `status=active|inactive|all` on the list endpoint and default it to `active`.
- Return `409 Conflict` when an inactive credential is revealed, updated, or deactivated again.
- Reject inactive access before attempting password decryption.
- Use a tenant-scoped conditional mutation so concurrent deactivation attempts cannot overwrite the
  first audit record.
- Treat the domain fields as the authoritative, atomic deactivation audit. Gateway request audit is
  complementary and must not be the only record.
- Make the UI state and copy explicit that deactivating a Giro Office record does not revoke or
  rotate the password in the external system.

## Context and Root Cause

`PasswordTecnologia` currently stores the credential location, linked user, encrypted password,
notes, timestamps, and organization. It has no lifecycle state or deactivation audit fields. The
TI password routes currently expose list, create, detail/reveal, and update operations, but no
deactivation or deletion action.

The list service scopes by organization and supports user and text filters, but it has no active
status predicate. The detail service decrypts the credential for an administrator, and the update
service currently calls that detail path as an existence check, causing an unnecessary decrypt
before an update.

The frontend follows the same lifecycle limitation: it can create, edit, reveal, and copy an
authorized credential, but it has no status filter, inactive presentation, confirmation dialog, or
reason input.

The gateway already records request-level audit data and classifies `/ti/passwords` as TI
credentials. That audit is asynchronous and best-effort. It records actor and request timestamps,
but it does not atomically record the credential state transition or the business reason. It
therefore cannot satisfy the issue by itself.

The root cause is a missing domain lifecycle, not merely a missing button. The database, service
rules, HTTP contract, UI state, cache behavior, audit semantics, and tests must change together.

## Goals

- Let a TI administrator deactivate an active credential deliberately and safely.
- Persist the deactivation state, actor, timestamp, and reason atomically.
- Hide inactive credentials from the default list.
- Let administrators filter the catalog by active, inactive, or all records.
- Prevent every secret-bearing or mutating operation on an inactive credential.
- Preserve tenant isolation and make concurrent deactivation deterministic.
- Keep encrypted secrets out of list responses, audit payloads, logs, errors, and UI feedback.
- Keep OpenAPI, generated smoke coverage, backend tests, and frontend tests aligned with the public
  contract.

## Non-goals

- Permanently deleting a password credential.
- Reactivating an inactive password credential.
- Rotating, revoking, or changing the password in an external system.
- Adding a background retention or purge policy.
- Redesigning the shared permission model or assigning a new numeric TI permission level.
- Changing the encryption algorithm, key management, or stored ciphertext format.
- Adding deactivation to password catalogs owned by other modules.
- Auditing clipboard contents or storing the revealed password in an audit event.

## Domain Model

### Prisma model

Extend `PasswordTecnologia` with:

```prisma
active                 Boolean   @default(true)
deactivated_at         DateTime?
deactivated_by_user_id String?
deactivation_reason    String?

@@index(
  [organization_id, active, local],
  map: "idx_tecnologia_passwords_org_active_local"
)
```

`deactivated_by_user_id` is intentionally a scalar. It must not have a relation or foreign key to
`User`. This preserves the original actor identifier if that user is renamed, transferred,
inactivated, or removed later.

### Invariants

An active record has:

- `active = true`;
- `deactivated_at = null`;
- `deactivated_by_user_id = null`; and
- `deactivation_reason = null`.

An inactive record has:

- `active = false`;
- a non-null server timestamp in `deactivated_at`;
- the authenticated administrator ID in `deactivated_by_user_id`; and
- a trimmed, non-empty reason no longer than 500 characters in `deactivation_reason`.

The migration should add a database check constraint that accepts exactly these two shapes. Prisma
does not need to model the check constraint for the application to benefit from it.

### Migration

The migration is additive:

1. add `active BOOLEAN NOT NULL DEFAULT TRUE`;
2. add the three nullable audit columns;
3. add the invariant check constraint; and
4. create `idx_tecnologia_passwords_org_active_local`.

All existing rows become active and satisfy the active invariant without a data rewrite in
application code. Existing legacy import rows can omit the new fields because the database default
applies. Prisma clients used by the TI service must be regenerated after the schema change; generated
files must not be edited by hand.

No ciphertext is transformed, decrypted, or re-encrypted during migration.

## Authorization

All TI password operations are administrator-only.

- The route middleware must use `TiPermissionLevel.Admin` for list, reveal, create, update, and
  deactivate.
- The frontend must use `access.isAdmin`, not `access.canEdit`, when deciding whether to fetch or
  render password administration features.
- A missing authenticated context returns `401`.
- A non-admin request returns `403`.
- A credential from another organization is indistinguishable from a missing credential and returns
  `404`.

`Technician` and `Admin` currently share numeric value `2`. This design does not introduce a new
permission level, but route names and frontend guards must express the approved admin-only policy
instead of relying on the alias.

## API Contract

### List credentials

`GET /ti/passwords/list`

Add an optional query parameter:

```text
status=active|inactive|all
```

Rules:

- omitted status behaves as `status=active`;
- `active` filters `active = true`;
- `inactive` filters `active = false`;
- `all` adds no active predicate;
- all existing organization, user, search, ordering, and pagination behavior remains;
- list results never include `password`;
- list results include `active`, `deactivated_at`, `deactivated_by_user_id`, and
  `deactivation_reason`;
- invalid status values return the standard `400` error envelope.

The query schema should expose a named `TiPasswordStatusFilter` union inferred from the Zod enum so
the service and tests do not repeat string literals.

### Deactivate credential

`POST /ti/passwords/:id/deactivate`

Request body:

```json
{
  "reason": "The vendor account was retired."
}
```

Validation:

- strict object;
- `reason` must be a string;
- trim before service invocation;
- minimum length after trimming: 1;
- maximum length after trimming: 500;
- unknown properties return `400`.

Successful response:

- status `200`;
- standard success envelope;
- safe credential metadata, including the four lifecycle fields;
- no `password`.

Errors:

- `400` for an invalid UUID, missing reason, blank reason, reason over 500 characters, or unknown
  body fields;
- `401` without authenticated forwarded context;
- `403` without TI admin permission;
- `404` when the credential does not exist in the authenticated organization;
- `409` when the credential is already inactive or loses the active race before the conditional
  mutation completes.

### Existing reveal

`GET /ti/passwords/:id`

The service must load safe metadata first. If `active` is false, return `409` before passing the
encrypted password to `EncryptionService.decrypt`.

Active administrator behavior remains unchanged. The successful response may contain the decrypted
password only on this explicit detail/reveal request.

### Existing update

`PATCH /ti/passwords/:id`

The service must stop using the decrypting reveal method as its existence check. It must use a safe
tenant-scoped lookup that does not decrypt.

If the record is inactive, return `409` before validating linked-user changes, encrypting a new
password, or issuing the update. The final update must remain scoped to the authenticated
organization and active state so a deactivation race cannot update the record afterward.

### No delete or reactivate routes

The router and OpenAPI must not expose:

- `DELETE /ti/passwords/:id`;
- a permanent delete/purge action;
- an activate/reactivate endpoint; or
- an update payload that can set `active` directly.

Lifecycle fields are server-owned and must not be accepted by the generic update schema.

## Backend Architecture

### Safe lookup boundary

Refactor `TiPasswordService` around a private safe lookup that:

- queries by `id` and `organization_id`;
- includes only the existing safe nested user selection;
- does not decrypt;
- returns `404` when absent.

Reveal, update, and deactivate use this lookup. Only the active reveal path calls
`withDecryptedPassword`.

### Status predicate

`buildPasswordWhere` remains the single source for list predicates. It adds an active predicate
derived from the validated status filter before the same `where` object is passed to both `count`
and `findMany`.

This guarantees totals and page contents describe the same filtered dataset.

### Conditional atomic deactivation

Deactivation follows this sequence:

1. Perform the safe tenant-scoped lookup.
2. Return `409` immediately if it is already inactive.
3. Capture one server timestamp.
4. Execute `updateMany` with:
   - `id`;
   - `organization_id`;
   - `active: true`.
5. In that single update, set:
   - `active: false`;
   - `deactivated_at` to the captured timestamp;
   - `deactivated_by_user_id` to `context.userId`;
   - `deactivation_reason` to the validated trimmed reason.
6. If the affected count is zero, return `409`; another writer won the lifecycle race.
7. Read and return the safe inactive record without decrypting.

The conditional update is the atomic domain audit. State and actor/date/reason cannot diverge,
and a losing concurrent request cannot overwrite the original deactivation evidence.

No external audit call belongs inside this mutation, and audit availability must not change the
domain result.

## Audit Design

### Authoritative domain audit

The four lifecycle fields on `PasswordTecnologia` are the source of truth for the only allowed
lifecycle transition. This is sufficient because the approved design has:

- one transition from active to inactive;
- no reactivation;
- no hard deletion; and
- no subsequent lifecycle event that could overwrite the first event.

The service must never accept actor, timestamp, or lifecycle fields from the client.

### Complementary gateway audit

The gateway continues recording request-level actor, organization, method, path, outcome, and
timestamps. Add an explicit activity catalog rule for:

```text
POST /ti/passwords/:id/deactivate
```

The visible activity should describe the action as deactivating a TI credential, not registering a
new credential.

The gateway event is complementary because its ingestion is asynchronous and best-effort. It must
not be used to recover the deactivation reason or determine the credential's current status.

The reason must not be copied into generic gateway metadata. It remains in the tenant-scoped domain
record.

## Frontend Design

### Types and contract

Extend `TiPasswordListItem` with strongly typed lifecycle fields:

```ts
active: boolean;
deactivated_at?: string | null;
deactivated_by_user_id?: TiId | null;
deactivation_reason?: string | null;
```

Add:

```ts
type TiPasswordStatusFilter = "active" | "inactive" | "all";

interface TiPasswordDeactivatePayload {
  reason: string;
}
```

Add a centralized endpoint template for `/ti/passwords/{id}/deactivate` and a service method that
posts the payload.

### Query and mutation

The password list query key already includes the filters object. Add `status: "active"` to the
initial filter state and reset the page to `1` when status changes.

Add a deactivation mutation that:

- posts the validated reason;
- removes the exact password detail query from React Query on success;
- clears the component's current reveal selection if it references the deactivated ID;
- invalidates all password list queries so active, inactive, and all views refresh;
- does not place the returned credential into the detail cache.

### List filter and inactive presentation

Add an administrator-only status select with:

- `Ativas`;
- `Inativas`; and
- `Todas`.

Each row displays an `Ativa` or `Inativa` badge. Inactive rows retain safe metadata and the
deactivation reason for administrative review.

Inactive rows must not render Reveal, Copy, Edit, or Deactivate actions. The absence of controls is
defense in depth; the API still enforces the same rules.

### Confirmation dialog

The active-row `Inativar` action opens the shared `Dialog` and shows enough safe context to prevent
selection mistakes, including the location and linked user.

The dialog contains:

- a concise explanation that the record will leave the default active list;
- a required reason textarea;
- a warning:

  > Deactivating this record in Giro Office does not revoke or change the password in the external
  > system. Revoke or rotate the credential at its source when required.

- a cancel action; and
- an explicit `Inativar credencial` confirmation action.

The confirmation action remains disabled while the trimmed reason is empty or the mutation is
pending. The component trims before sending, but the backend performs the authoritative validation.
Success closes the dialog, clears its local reason, evicts sensitive detail cache, and shows generic
feedback. Failure keeps the dialog and reason available for retry and shows no secret or raw payload.

### Reveal and copy safety

An inactive record can never set `revealPasswordId`. If a credential becomes inactive while a
reveal dialog is open, successful deactivation closes that dialog and removes its exact cached
detail.

No copy control exists outside an active, successful reveal result. A stale frontend cannot bypass
the backend's inactive `409`.

## Data Flow

1. An authenticated TI administrator opens the password tab.
2. The frontend requests `GET /ti/passwords/list?status=active`; inactive credentials are omitted.
3. The administrator opens `Inativar` for an active safe list item.
4. The dialog displays safe identifying data, the external-system warning, and a required reason.
5. The frontend posts the trimmed reason to `/ti/passwords/:id/deactivate`.
6. The route validates UUID, body, forwarded context, and admin permission.
7. The service performs a tenant-scoped safe lookup and rejects inactive records.
8. A conditional `updateMany` atomically changes the status and writes actor/date/reason.
9. The service returns safe metadata without decrypting.
10. The frontend closes any reveal state for that ID, removes the detail cache, and invalidates
    password lists.
11. The gateway independently queues its complementary request audit.
12. The default active list no longer contains the credential; the administrator can inspect it
    with the inactive or all filter, without reveal, copy, or edit actions.

## Security Requirements

- The encrypted password remains encrypted at rest; deactivation does not decrypt or rewrite it.
- Inactive reveal is rejected before decryption.
- List, deactivate, and update responses never include `password`.
- Lifecycle fields are server-owned.
- Every lookup and mutation includes `organization_id`.
- Cross-tenant IDs return `404`.
- The actor is taken only from authenticated forwarded context.
- The timestamp is generated by the server.
- The reason is trimmed, length-bounded, and never logged with a password.
- No audit `changes`, metadata, toast, or error includes plaintext or ciphertext.
- Cache eviction removes previously revealed data after deactivation.
- Frontend visibility is not treated as authorization.
- Gateway audit failure does not erase or invalidate the atomic domain audit.
- The UI warning must not imply that Giro Office controls the external account.

## Error Semantics

| Condition | Status | Behavior |
| --- | ---: | --- |
| Missing forwarded authentication | 401 | Standard unauthenticated envelope |
| TI permission below admin | 403 | Standard forbidden envelope |
| Invalid UUID, status, or reason | 400 | First Zod validation message |
| Missing or cross-tenant credential | 404 | Same not-found response |
| Reveal of inactive credential | 409 | No decrypt attempt |
| Update of inactive credential | 409 | No encryption or update attempt |
| Repeated deactivation | 409 | Original audit fields remain unchanged |
| Concurrent deactivation loser | 409 | Conditional update affects zero rows |
| Unexpected database failure | 500 | Logged without secret; standard handler response |

## Compatibility

- Existing records become active, so the initial default list is unchanged immediately after
  migration.
- Existing list clients that omit `status` receive active rows in the same paginated envelope.
- Existing list and mutation response shapes change only additively with lifecycle metadata.
- Active reveal, create, and update behavior remains compatible.
- Once a record is inactive, update and reveal intentionally return a new `409` domain result.
- No public route is removed.
- No encryption format or environment variable changes.
- The legacy TI migration/import can continue omitting new columns because `active` defaults to
  true and audit fields default to null.
- The gateway continues routing the `/ti` prefix without registry changes.

## Detailed Test Strategy

Implementation must follow red-green-refactor for each behavior below.

### Migration and schema tests

- Existing rows read as `active = true` after migration.
- Existing rows have all three deactivation audit fields null.
- The active invariant accepts the default shape.
- The inactive invariant accepts a complete actor/date/reason shape.
- The check constraint rejects incomplete inactive audit fields.
- The check constraint rejects active rows with stale deactivation fields.
- The organization/active/local index exists with the approved name and column order.
- The legacy load path succeeds without explicitly supplying lifecycle columns.

### `TiPasswordService` tests

List:

- omitted status builds `active: true` for both `count` and `findMany`;
- `status=active` builds `active: true`;
- `status=inactive` builds `active: false`;
- `status=all` omits the active predicate;
- status combines with organization, user, search, pagination, and ordering;
- list results never contain `password`;
- inactive results include safe audit metadata.

Reveal:

- active admin reveal returns the decrypted password;
- inactive reveal returns `409`;
- inactive reveal does not call `EncryptionService.decrypt`;
- cross-tenant and missing IDs return `404`.

Update:

- active update uses a safe lookup and preserves current behavior;
- inactive update returns `409`;
- inactive update does not call encrypt, linked-user validation, or Prisma update;
- a race with deactivation cannot update after `active` becomes false;
- the final update predicate includes organization and active state.

Deactivate:

- active credential becomes inactive with the authenticated actor;
- the service uses one server timestamp for the mutation;
- the stored reason is the validated trimmed reason;
- the response contains lifecycle metadata and no password;
- missing and cross-tenant IDs return `404`;
- already inactive returns `409` without mutation;
- an `updateMany` count of zero returns `409`;
- a failed concurrent attempt cannot overwrite the first actor, timestamp, or reason;
- deactivation never calls decrypt;
- unexpected Prisma errors become the standard safe `500`.

### Route tests

- `POST /ti/passwords/:id/deactivate` returns `401` without forwarded auth.
- Permission below admin returns `403`.
- Admin success returns `200` and a standard success envelope.
- Invalid UUID returns `400`.
- Missing, blank, whitespace-only, over-500-character, non-string, and extra-field reasons return
  `400`.
- The route passes the trimmed reason and authenticated context to the service.
- List accepts active, inactive, and all.
- List rejects an unknown status.
- List, reveal, create, update, and deactivate all use the admin middleware.
- Inactive reveal, update, and repeated deactivation serialize `409` consistently.

### OpenAPI and app contract tests

- `status` is documented as `active|inactive|all` with default `active`.
- `TiPasswordDeactivateInput` requires `reason`, applies `minLength: 1` and `maxLength: 500`, and
  rejects additional properties.
- `POST /ti/passwords/{id}/deactivate` documents `200`, `400`, `401`, `403`, `404`, and `409`.
- Existing reveal and update operations add `409`.
- The application OpenAPI operation inventory includes the new path and method.

### Gateway audit tests

- The explicit activity rule classifies the deactivate route as `inativou uma credencial de TI`.
- The route remains mapped to `ti-service`.
- Request audit captures authenticated actor, organization, outcome, and timestamps.
- Gateway ingestion failure does not alter the domain response.
- No password or deactivation reason is added to gateway metadata.

### Frontend contract and hook tests

- Types expose all four lifecycle fields and the exact status union.
- The endpoint builder produces `/ti/passwords/:id/deactivate`.
- The service posts only `{ reason }`.
- The list forwards the status filter.
- The deactivation mutation invalidates all password lists.
- The mutation removes the exact detail cache entry.
- The returned safe record is not written into detail cache.

### Frontend component tests

- Initial status is active.
- Changing status resets pagination to page 1.
- The filter renders Ativas, Inativas, and Todas.
- Active and inactive rows render the correct badge.
- Only an active row renders Reveal, Edit, and Deactivate.
- An inactive row renders none of Reveal, Copy, Edit, or Deactivate.
- Deactivate opens a shared confirmation dialog with safe identifying metadata.
- The reason is required and trimmed.
- The confirmation is disabled for blank reason and while pending.
- The external-system warning is visible with unambiguous copy.
- Success closes the dialog, clears reason state, closes matching reveal state, removes detail cache,
  invalidates lists, and shows generic success feedback.
- Failure preserves the dialog and reason for retry and shows generic error feedback.
- The UI never renders a password in a list row or deactivation dialog.

### Smoke coverage

- Add one good admin expectation for `POST /ti/passwords/{id}/deactivate`.
- Add a bad expectation for insufficient permission or invalid reason, preserving paired coverage.
- Execute create before deactivate so the smoke owns the credential ID.
- After deactivation, exercise an inactive reveal or repeated deactivate and expect `409`.
- Keep the operation in the TI OpenAPI-derived generated smoke definitions.
- Run `pnpm smoke:coverage` and require complete paired coverage.

### Final validation

- `pnpm --filter @workspace/app test:ti`
- `pnpm --filter @workspace/app typecheck`
- `pnpm --filter @workspace/ti-service test`
- `pnpm --filter @workspace/ti-service typecheck`
- `pnpm smoke:coverage`
- scoped Biome checks for changed TypeScript and TSX files
- `git diff --check`
- authenticated browser smoke of active, inactive, all, confirmation, deactivation, cache eviction,
  and blocked inactive actions when the environment permits it

Any baseline or environment failure must be reported separately and must not be presented as a
regression introduced by issue #507.

## Baseline Recorded on 2026-07-27

The design worktree was validated before functional changes:

- Graphify UI context: unavailable because `app/graphify-out/graph.json` is absent.
- Graphify services context: unavailable because `services/graphify-out/graph.json` is absent.
- `pnpm --filter @workspace/app test:ti`: failed in the pre-existing contradictory clipboard
  source assertion that expects direct `navigator.clipboard.writeText(secret)` even though the same
  suite requires the safe helper.
- `pnpm --filter @workspace/app typecheck`: failed because `@workspace/api` and its type
  declarations cannot be resolved from five shared app files in this worktree.
- `pnpm --filter @workspace/ti-service test`: 56 tests passed, but 12 route suites failed to import
  `@workspace/shared/logger`.
- `pnpm --filter @workspace/ti-service typecheck`: failed during Prisma generation because
  `DATABASE_URL` is not defined.
- `pnpm smoke:coverage`: passed with `335/335 operations mapped with paired expectations`.

These failures were not changed as part of the design-only task.

## Rollout

1. Apply the additive database migration before deploying code that reads lifecycle fields.
2. Regenerate Prisma clients.
3. Deploy the TI service contract and backend guards.
4. Deploy OpenAPI, gateway activity classification, and smoke definitions with the service.
5. Deploy the frontend filter and deactivation flow after the backend endpoint is available.
6. Verify existing rows appear under Active and inactive count is initially zero.
7. Perform an authenticated production-like smoke with a disposable test credential.
8. Confirm domain audit fields, gateway request audit, default hiding, inactive filtering, cache
   eviction, and all three inactive `409` blocks.

Rollback considerations:

- The frontend can be rolled back without changing stored state.
- The service can be rolled back, but old code would not enforce inactive hiding or operation
  blocks; do not roll back application code while inactive rows exist unless traffic is stopped or a
  compatibility patch remains.
- The additive columns and index should remain during an application rollback.
- Do not drop audit columns as an emergency rollback because that would destroy deactivation
  evidence.

## Risks and Mitigations

### External credential remains valid

Risk: users may interpret Giro Office deactivation as revocation.

Mitigation: show the approved warning in the confirmation dialog and preserve it in product
documentation. Deactivation changes only Giro Office visibility and access.

### Stale revealed secret remains in browser cache

Risk: an administrator revealed a password before another request deactivated it.

Mitigation: successful local deactivation removes the exact detail cache and closes reveal state.
The backend blocks all subsequent reveals. Cross-session cache cannot be remotely erased, so query
staleness should remain short and inactive enforcement must stay server-side.

### Concurrent requests overwrite audit data

Risk: two administrators deactivate simultaneously.

Mitigation: use tenant-scoped `updateMany` with `active: true`; only one request writes the audit
fields, and the loser receives `409`.

### Generic update races with deactivation

Risk: an update passes a pre-check immediately before deactivation.

Mitigation: make the final update conditional on organization and `active: true`; a zero-row result
becomes `409`.

### Gateway audit is unavailable

Risk: request-level audit ingestion fails.

Mitigation: domain state and actor/date/reason are written atomically in the credential row and do
not depend on gateway audit availability.

### Audit reason contains sensitive text

Risk: an administrator pastes a secret into the reason.

Mitigation: label the field as an administrative reason, enforce 500 characters, do not mirror it
into gateway metadata or logs, and never display it outside the admin-only inactive catalog.

### Index or constraint affects migration

Risk: unexpected legacy data violates the lifecycle constraint.

Mitigation: all new lifecycle fields begin in the active default shape. Validate row counts and
constraint creation in a staging copy before production migration.

## Acceptance Criteria

- [ ] Existing credentials migrate as active with null deactivation audit fields.
- [ ] Only a TI administrator can list, reveal, create, update, filter, or deactivate credentials.
- [ ] `POST /ti/passwords/:id/deactivate` accepts only a trimmed reason of 1–500 characters.
- [ ] Deactivation atomically writes inactive state, server timestamp, authenticated actor ID, and
      reason.
- [ ] Repeated or concurrent deactivation returns `409` without overwriting the original audit.
- [ ] Default list returns active credentials only.
- [ ] Admin status filter supports active, inactive, and all.
- [ ] List responses never expose the password.
- [ ] Inactive reveal returns `409` before decrypt.
- [ ] Inactive update returns `409`.
- [ ] Inactive rows have no reveal, copy, edit, or deactivate action.
- [ ] Successful deactivation evicts matching sensitive detail cache and invalidates all password
      lists.
- [ ] Confirmation requires a reason and warns that the external credential remains valid.
- [ ] No hard delete or reactivation route or UI action exists.
- [ ] The gateway classifies the request as credential deactivation, while domain fields remain the
      authoritative audit.
- [ ] OpenAPI, backend tests, frontend tests, generated smoke definitions, and paired smoke coverage
      include the new contract.
- [ ] No secret appears in lifecycle audit fields, gateway metadata, logs, errors, or UI feedback.

## Files Expected to Change During Implementation

### Database

- `infra/prisma/schema.prisma`
- `infra/prisma/migrations/<timestamp>_add_ti_password_deactivation/migration.sql`
- regenerated Prisma clients through the repository generator

### TI service

- `services/ti-service/src/schemas/tiPassword.schemas.ts`
- `services/ti-service/src/services/tiPasswordService.ts`
- `services/ti-service/src/routes/tiPassword.routes.ts`
- `services/ti-service/src/openapi/spec.ts`
- `services/ti-service/src/test/tiPasswordService.test.ts`
- `services/ti-service/src/test/tiPassword.routes.test.ts`
- `services/ti-service/src/test/app.test.ts`
- `services/ti-service/src/test/tiServiceTestUtils.ts`
- `services/ti-service/README.md` if its documented route inventory is updated

### Frontend

- `app/src/modules/ti/types/passwords.ts`
- `app/src/modules/ti/services/tiService.contract.ts`
- `app/src/modules/ti/services/tiPasswordsService.ts`
- `app/src/modules/ti/hooks/useTiPasswords.ts`
- `app/src/modules/ti/components/TiPasswordsTab.tsx`
- `app/src/modules/ti/run-ti-tests.mjs`

### Gateway and smoke

- `services/gateway/src/audit/activityCatalog.ts`
- `services/gateway/src/test/activityCatalog.test.ts`
- `services/gateway/src/test/activityCatalogCoverage.test.ts` if explicit rule coverage requires it
- `scripts/all-services-smoke.mjs`
- `scripts/generated/ti-service.smoke.mjs`, regenerated rather than edited manually
- `scripts/all-services-smoke.manifest.mjs` only if an explicit negative override is required
