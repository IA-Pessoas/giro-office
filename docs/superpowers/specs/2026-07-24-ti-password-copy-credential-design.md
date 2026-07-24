# TI Password Copy Credential Design

**Issue:** #505 — `[QA Pre Release] Tecnologia Senhas: botão Copiar senha não copia credencial`

**Date:** 2026-07-24

## Context

The active `Tecnologia > Senhas` screen reveals an authorized credential through
`TiPasswordsTab`. After the detail request succeeds, the component renders the returned password
and exposes a `Copiar senha` action.

The current handler calls `navigator.clipboard.writeText(secret)` directly. It does not verify
whether the Clipboard API exists and does not catch permission or runtime failures. The click
handler intentionally discards the returned promise with `void`, so a rejected clipboard write
produces neither a copied value nor user-facing failure feedback.

## Goals

- Copy exactly the password returned by the explicit reveal request.
- Report a generic success message after a confirmed clipboard write.
- Report a generic failure message when the Clipboard API is unavailable or rejects the write.
- Keep the secret out of logs, errors, toast messages, persistent storage, and additional DOM
  elements.
- Cover successful writes and clipboard failures with executable tests.

## Non-goals

- Changing password reveal permissions, API contracts, caching, or backend behavior.
- Copying passwords that have not already been explicitly revealed.
- Adding a DOM-based or `document.execCommand` clipboard fallback.
- Refactoring clipboard behavior in unrelated modules.
- Changing the visual structure of the password screen.

## Considered Approaches

### 1. Small injectable domain helper

Create a TI-domain helper that receives the text and an optional clipboard writer. It performs the
write, absorbs the implementation error, and returns a boolean result.

This is the selected approach because it separates the browser boundary from the UI, allows
deterministic tests for success and failure, and prevents raw clipboard errors from reaching the
component.

### 2. Inline `try/catch` in `TiPasswordsTab`

This would produce the smallest source diff, but testing would remain coupled to source-shape
assertions or require mounting the entire component with browser globals.

### 3. Legacy DOM fallback

Creating a temporary textarea and using `document.execCommand("copy")` could support environments
without the Clipboard API. It was rejected because the issue explicitly accepts a clear error for
an unavailable API, the technique is obsolete, and it would unnecessarily place the secret in an
additional DOM node.

## Design

### Clipboard boundary

Add a helper under `app/src/modules/ti/utils/` with a minimal writer contract:

```ts
type ClipboardWriter = {
  writeText: (value: string) => Promise<void>;
};

async function copySensitiveText(
  value: string,
  clipboard: ClipboardWriter | undefined,
): Promise<boolean>;
```

The helper will:

1. return `false` without side effects when the writer is unavailable;
2. call `writeText` exactly once with the supplied value;
3. return `true` only after the promise resolves;
4. catch write failures and return `false`; and
5. never log, serialize, persist, or include the value in an error.

The writer is injected instead of read inside the helper so tests do not need to mutate global
browser state.

### Component integration

`TiPasswordsTab` will continue to read only `revealedPassword?.password`. If the value is missing,
the existing guarded failure path remains generic.

For a present secret, the handler will pass:

- the revealed password; and
- `navigator.clipboard` only when `navigator` and the Clipboard API are available.

The helper result controls the UI feedback:

- `true`: show `Senha copiada.`;
- `false`: show a generic message explaining that the password could not be copied and that
  clipboard permission or browser support should be checked.

Neither message will contain the password or a raw exception. No new state, cache entry, request,
or persistence mechanism is introduced.

## Data Flow

1. An authorized user explicitly reveals a password through the existing detail query.
2. The revealed password remains in the existing React Query detail result.
3. The user clicks `Copiar senha`.
4. The component sends that exact value to the helper with the available clipboard writer.
5. The helper resolves to a boolean without exposing browser errors.
6. The component displays a generic success or failure toast.

## Error Handling and Security

- Missing revealed password: fail before accessing the clipboard.
- Missing Clipboard API: return `false` and show the generic failure toast.
- Permission denial or browser rejection: catch internally, return `false`, and show the same
  generic failure toast.
- Clipboard success: show feedback only after `writeText` resolves.
- No logging is added.
- No error object is interpolated into UI copy.
- No fallback duplicates the password in the DOM.
- Existing reveal-cache clearing behavior remains unchanged.

## Testing

Extend the existing TI frontend test runner with executable helper tests:

1. a successful writer receives exactly the supplied password and resolves `true`;
2. a rejecting writer resolves `false` without throwing;
3. an unavailable writer resolves `false`;
4. the component imports and uses the helper with the revealed password; and
5. the component contains generic success and failure feedback without serializing a caught error.

Validation will include:

- `pnpm --filter @workspace/app test:ti`;
- `pnpm --filter @workspace/app typecheck`;
- scoped Biome validation for changed frontend files; and
- `git diff --check`.

## Acceptance Criteria Mapping

- **Exact revealed password is copied:** verified by the injected-writer test.
- **Success and error feedback:** driven by the helper's boolean result.
- **No secret exposure outside the existing reveal:** enforced by the helper boundary and generic
  UI messages.
- **Clipboard failure is covered:** verified for both rejected and unavailable writers.
