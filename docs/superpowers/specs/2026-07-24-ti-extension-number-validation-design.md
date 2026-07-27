# TI Extension Number Validation and Internal ID Hiding Design

## Context

Issue #508 reports two defects in `Tecnologia > Ramais`:

- the extension number field accepts alphabetic and otherwise invalid values; and
- the selected-extension panel exposes the extension UUID to operational users.

The active frontend validates only that `number` is non-empty before sending create or update
requests. The `ti-service` schema uses `zNonEmptyText("number")`, so a direct API request can also
persist letters or a number with the wrong length. The selected-extension panel explicitly renders
`<TiFieldLine label="ID" ...>`.

The current UI placeholder, backend fixtures, and workspace smoke flow consistently use four-digit
extension numbers. The approved product rule is therefore an exact four-digit string.

## Goal

Accept and persist only extension numbers that match `^[0-9]{4}$`, provide clear validation
feedback, and stop rendering the internal UUID in the operational interface.

## Non-goals

- Do not remove the UUID from API responses, React Query keys, React row keys, route parameters, or
  mutation identifiers.
- Do not introduce a public replacement identifier.
- Do not migrate or rewrite existing extension records.
- Do not change extension permissions, pagination, user assignment, uniqueness, or database
  constraints.
- Do not modify or reactivate the legacy Tecnologia implementation.

## Considered Approaches

### 1. Validate at the frontend and API boundaries

The frontend constrains user input and validates before mutation. The API independently validates
the same exact format in create and update schemas.

This is the selected approach because it gives immediate feedback while protecting direct API
calls, without introducing a migration.

### 2. Validate only in the frontend

This would be the smallest UI change, but callers could bypass it and persist invalid data directly
through the API. It does not satisfy the issue.

### 3. Add frontend, API, and database format constraints

This would provide the strongest persistence guarantee, but it would require a migration and a
decision about existing invalid rows. That risk and scope are unnecessary for this correction.

## Frontend Design

A focused TI-domain utility will expose:

```ts
export const TI_EXTENSION_NUMBER_LENGTH = 4;

export function sanitizeTiExtensionNumber(value: string): string;

export function isValidTiExtensionNumber(value: string): boolean;
```

`sanitizeTiExtensionNumber` will remove non-digits and limit the value to four characters.
`isValidTiExtensionNumber` will accept only strings matching `^[0-9]{4}$`. The value remains a
string so leading zeroes such as `0007` are preserved.

`TiExtensionsTab` will use the utility for both create and update flows. The number input will:

- remain a text input;
- use `inputMode="numeric"` to request a numeric keyboard;
- use `maxLength={4}`;
- sanitize each change before updating form state; and
- show `Informe um ramal com exatamente 4 dígitos.` instead of sending an invalid mutation.

The selected-extension panel will continue to show the business fields `Número` and `Usuário`, but
will no longer render the UUID. The UUID remains in component state and contracts because it is
required for selection, detail queries, edits, cache keys, and HTTP routes.

## Backend Design

`tiExtension.schemas.ts` will define one domain-specific Zod schema for the number:

```ts
const tiExtensionNumberSchema = z
  .string()
  .regex(/^[0-9]{4}$/, { message: "number deve conter exatamente 4 dígitos." });
```

Both `createTiExtensionBodySchema` and `updateTiExtensionBodySchema` will consume that schema. The
route remains responsible for parsing input with `parseWithZod`, so invalid direct requests return
the shared `400 BAD_REQUEST` response before the service or Prisma is called.

The service remains unchanged. It can continue assuming route input has already been validated,
and the existing organization-scoped uniqueness check continues to return `409` for duplicates.

## OpenAPI Design

`TiExtensionInput.number` and `TiExtensionUpdateInput.number` will document the real contract:

```ts
{
  type: "string",
  minLength: 4,
  maxLength: 4,
  pattern: "^[0-9]{4}$",
  example: "1001",
}
```

No route is added or removed, so the smoke manifest structure does not change. Existing smoke
handlers already generate four-digit strings.

## Error and Compatibility Handling

- Empty, alphabetic, separated, shorter, and longer values are rejected before frontend mutation.
- Direct invalid API requests return `400` with
  `number deve conter exatamente 4 dígitos.`.
- Duplicate valid numbers continue to return `409`.
- Authentication and authorization responses remain unchanged.
- Existing invalid rows remain readable. Editing one requires correcting the number before save.
- Leading zeroes are preserved because the contract remains a string.
- No UUID is displayed, logged, or substituted with another internal field in the UI.

## Test Design

Implementation follows TDD.

Frontend tests will first prove that:

- `1001` and `0007` are valid;
- letters, separators, and lengths other than four are invalid;
- sanitization removes non-digits and caps the value at four digits;
- the component uses numeric input hints and validates before create and update mutations; and
- the selected-extension panel does not render an `ID` field.

Backend route tests will first prove that:

- `POST /ti/extensions` rejects alphabetic input with `400`;
- `PATCH /ti/extensions/:id` rejects a non-four-digit value with `400`;
- invalid input does not reach Prisma; and
- the existing four-digit create path continues to return `201`.

OpenAPI source checks will prove that both input schemas expose the exact length and regex pattern.

Final validation will include:

- `pnpm --filter @workspace/app test:ti`;
- `pnpm --filter @workspace/ti-service test` outside the sandbox when Supertest requires an
  ephemeral listener;
- frontend and `ti-service` typechecks;
- Biome checks on changed source and test files;
- `pnpm smoke:coverage`;
- `git diff --check`; and
- a direct diff and call-site review.

## Risks and Mitigations

- **Frontend/API rule drift:** both boundaries use the same explicit regex and are covered by
  independent tests; OpenAPI documents the same constraint.
- **Leading zero loss:** the input and contract remain strings rather than numeric values.
- **Legacy invalid records:** no read-time validation or migration is introduced; only subsequent
  writes require correction.
- **Accidental API break from hiding the ID:** the change removes only the visible field, not the
  `id` property from any technical contract.
