# RH Request Assignee Nullability Design

## Context

The legacy RH request workflow allowed a request to exist before an RH user assumed it. The
legacy MariaDB column `tb_rh.solicitacoes.atribuido` was physically `NOT NULL`, but the
application wrote the sentinel value `0` on creation and replaced it only when an RH user chose
the "assumir" action.

The `03.08.2026` backup contains 915 RH requests:

- 668 rows use `atribuido = 0` and are semantically unassigned;
- 247 rows contain an explicit assignee reference;
- no row uses SQL `NULL` because the sentinel encoded absence.

The current PostgreSQL database represents the same absence with SQL `NULL`. Its
`public."rh.requests".assigned_to_user_id` column is nullable, and 641 of its 880 current rows
contain `NULL`. However, the Prisma schema and the applied
`20260319193816_rh_schema_improvements` migration declare the field required. The V4 read-only
preflight correctly reports both `DESTINATION_NULLABILITY_MISMATCH` and
`PRISMA_DATABASE_DRIFT`.

The current RH service also auto-assigns an eligible RH user when the caller omits
`assigned_to_user_id`. That behavior does not reproduce the legacy workflow and can fabricate a
historical relationship during migration.

This design is the explicit, narrowly scoped exception to the V4 mapping documents that otherwise
forbid product schema and service changes. It does not authorize any database write, legacy-data
cleanup, or migration execution.

## Decision

Model an unassigned RH request explicitly with `assigned_to_user_id = NULL` across PostgreSQL,
Prisma, the RH service, the public contract, and migration V4.

New requests may be created without an assignee. An authorized RH user may assign the request
later through the existing update workflow. Explicit assignee values remain validated, and a
requester cannot be assigned to their own request.

## Alternatives considered

### 1. Nullable end to end — selected

Aligns the current database with the legacy behavior, preserves absence without fabricating a
user relationship, and makes Prisma types describe the rows that already exist.

### 2. Nullable Prisma field with mandatory service auto-assignment

Would clear the physical schema drift but preserve the behavioral drift. New and migrated requests
would still receive synthesized relationships, so this option is rejected.

### 3. Backfill every request and enforce `NOT NULL`

Would require selecting assignees for 668 legacy requests that never had one. That assignment is
not recoverable from source evidence and would violate the migration rule against fabricating
relationships. This option is rejected.

## Schema and migration contract

Update `RhRequest` in `infra/prisma/schema.prisma`:

```prisma
assigned_to_user_id String?
assigned_to         User?   @relation("RequestAssignee", fields: [assigned_to_user_id], references: [id])
```

Add the versioned Prisma migration:

`infra/prisma/migrations/20260805144655_allow_unassigned_rh_request_assignee/migration.sql`

Its only schema statement is:

```sql
ALTER TABLE "rh.requests"
ALTER COLUMN "assigned_to_user_id" DROP NOT NULL;
```

The migration is intentionally safe when the target column is already nullable. It is committed so
fresh databases built from migration history converge to the same schema as production and Prisma.
It is not applied to any remote database as part of this work.

## RH service behavior

### Create

`RequestService.create` keeps `assigned_to_user_id` optional. When omitted, it persists `NULL` and
does not query for an eligible RH assignee. When supplied, it normalizes the value and rejects an
assignee equal to the requester.

The `findEligibleRhAssignee` helper and `RH_OPERATION_PERMISSION` constant are removed because
automatic assignment is no longer part of the domain contract.

### Update

Updating title, description, category, urgency, or status must work when an existing request is
unassigned. If `assigned_to_user_id` is provided, the service validates it and enforces the
requester/assignee separation rule. Omission preserves the current nullable value.

This scope does not add an explicit "unassign" operation. The existing input shape accepts either
an assignee string or omission, not `null`.

### Message access

Message authorization accepts `assigned_to_user_id: string | null`. An unassigned request remains
accessible to its requester and to users with RH management permission. Other users remain denied.
No access is granted merely because the assignee is absent.

## HTTP and OpenAPI contract

The create and update request bodies already make `assigned_to_user_id` optional. No route shape is
added. Any response schema or example that represents an RH request must permit `null` for the
field. Query filtering remains a UUID string filter and does not add a filter for unassigned rows.

## V4 migration mapping

For `tb_rh.solicitacoes.atribuido`:

- `0`, empty, or missing legacy values map to SQL `NULL`;
- a valid non-zero collaborator reference resolves to the corresponding current user;
- an invalid, ambiguous, or unresolved non-zero reference goes to quarantine;
- no eligible-user lookup or fallback assignment is performed;
- no new user, table, or service is proposed.

The RH request mapping no longer declares `required_lookup_never_null`. Its semantic evidence must
document the legacy sentinel and the delayed "assumir" workflow. The generated V4 package,
historical comparison, manifest hashes, and read-only preflight are regenerated atomically.

The expected preflight result removes the two assignee nullability/drift blockers. Other blockers
remain visible and are not weakened by this correction.

## Error handling

- Explicit assignee equal to requester: preserve the existing domain error.
- Invalid explicit assignee input: preserve current request validation.
- Invalid non-zero legacy reference: quarantine with its existing safe provenance; do not emit the
  source row as prepared.
- Missing legacy assignee (`0`): valid mapped absence, not quarantine and not pending mapping.
- Database/preflight mismatch after regeneration: keep `readyForMigration=false` and report the
  mismatch; never suppress physical drift.

## Test strategy

Implementation follows red-green-refactor.

1. Prisma/migration contract test proves the field is optional and the migration drops `NOT NULL`
   without data manipulation.
2. RH service test proves create omits auto-assignee lookup and persists an unassigned request.
3. RH service test proves a non-assignee update succeeds for an existing row whose assignee is
   `null`.
4. Message service test proves requester access and unauthorized-user denial when the assignee is
   `null`.
5. V4 RH rule tests prove `atribuido = 0` is prepared as a nullable mapping and a non-zero unresolved
   reference is quarantined.
6. Preflight tests prove matching nullable Prisma/database catalogs do not emit either drift code.
7. Focused RH service tests, typecheck, Prisma validation, V4 tests, package acceptance, hash
   verification, and the real preflight run in `READ ONLY` mode.

Tests use mocks or local fixtures at database boundaries. No test writes to the Supabase project.

## Acceptance criteria

- Prisma declares `assigned_to_user_id` nullable.
- Versioned migration history converges fresh databases to nullable.
- New RH requests can persist without an assignee and are not automatically assigned.
- Existing unassigned requests can be updated without an assignee-related failure.
- Message authorization remains restrictive for unassigned requests.
- All 668 sentinel-zero legacy rows map to absence without fabricated user references.
- Invalid non-zero legacy references remain quarantined.
- The two assignee nullability/drift blockers disappear only because Prisma and PostgreSQL agree.
- The real preflight remains `READ ONLY` with `writesPerformed=false`.
- No production data is updated, deleted, backfilled, or migrated.

## Delivery

The implementation is committed to `feat/migration-v4-full-mapping` and pushed to draft PR #732
after all scoped validations pass. The worktree remains available for the remaining V4 blockers.
