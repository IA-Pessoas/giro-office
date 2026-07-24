# TI Password Copy Credential Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Tecnologia > Senhas > Copiar senha` copy exactly the explicitly revealed password
and provide safe success or failure feedback.

**Architecture:** Add one TI-domain clipboard boundary with an injected writer and a boolean
result. `TiPasswordsTab` will remain responsible for reading the already revealed credential and
showing generic toasts, while the helper owns browser availability and rejection handling without
logging or exposing the secret.

**Tech Stack:** TypeScript, React, Next.js, React Toastify, Node.js frontend contract runner, Biome

## Global Constraints

- Work only in `fix/505-ti-password-copy-credential` and its isolated worktree.
- Keep the change frontend-only; do not change API, backend, reveal permissions, or React Query
  cache behavior.
- Copy only `revealedPassword.password` after the existing explicit reveal flow.
- Do not add DOM or `document.execCommand` clipboard fallbacks.
- Do not log, serialize, persist, or include the secret or raw clipboard error in UI messages.
- Do not change package manifests or `pnpm-lock.yaml`.
- Use the existing TI test runner and run frontend typecheck before completion.

---

### Task 1: Add the testable sensitive clipboard boundary

**Files:**
- Create: `app/src/modules/ti/utils/copySensitiveText.ts`
- Modify: `app/src/modules/ti/run-ti-tests.mjs`

**Interfaces:**
- Consumes: an arbitrary string and an optional object implementing
  `writeText(value: string): Promise<void>`.
- Produces:
  `copySensitiveText(value: string, clipboard: ClipboardWriter | undefined): Promise<boolean>`.

- [ ] **Step 1: Add the failing executable helper test**

Insert this test after the password contract test block in
`app/src/modules/ti/run-ti-tests.mjs`:

```js
await runTest("ti sensitive clipboard helper copies the exact value", async () => {
  const { copySensitiveText } = await import("./utils/copySensitiveText.ts");
  const writes = [];
  const revealedPassword = "S3nh@ com espaços ";

  const copied = await copySensitiveText(revealedPassword, {
    writeText: async (value) => {
      writes.push(value);
    },
  });

  assert.equal(copied, true);
  assert.deepEqual(writes, [revealedPassword]);
});

await runTest("ti sensitive clipboard helper handles a rejected write", async () => {
  const { copySensitiveText } = await import("./utils/copySensitiveText.ts");

  assert.equal(
    await copySensitiveText("segredo de teste", {
      writeText: async () => {
        throw new Error("NotAllowedError");
      },
    }),
    false,
  );
});

await runTest("ti sensitive clipboard helper handles an unavailable writer", async () => {
  const { copySensitiveText } = await import("./utils/copySensitiveText.ts");

  assert.equal(await copySensitiveText("segredo de teste", undefined), false);
});
```

- [ ] **Step 2: Run the TI test suite and verify RED**

Run:

```bash
pnpm --filter @workspace/app test:ti
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`app/src/modules/ti/utils/copySensitiveText.ts`. Existing TI cases must still reach their normal
results before the new missing-module failure.

- [ ] **Step 3: Implement the minimal clipboard boundary**

Create `app/src/modules/ti/utils/copySensitiveText.ts`:

```ts
export type ClipboardWriter = {
  writeText: (value: string) => Promise<void>;
};

export async function copySensitiveText(
  value: string,
  clipboard: ClipboardWriter | undefined,
): Promise<boolean> {
  if (!clipboard) {
    return false;
  }

  try {
    await clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the TI test suite and verify GREEN**

Run:

```bash
pnpm --filter @workspace/app test:ti
```

Expected: all TI tests pass. The new case must prove exact string preservation, a successful
resolved write, a rejected write returning `false`, and an unavailable writer returning `false`.
The Node module-type warning is already emitted by other TypeScript imports in this runner and is
not a failure.

- [ ] **Step 5: Commit the tested clipboard boundary**

```bash
git add app/src/modules/ti/utils/copySensitiveText.ts app/src/modules/ti/run-ti-tests.mjs
git commit -m "fix(ti): handle sensitive clipboard writes"
```

---

### Task 2: Integrate safe copy feedback into `TiPasswordsTab`

**Files:**
- Modify: `app/src/modules/ti/components/TiPasswordsTab.tsx`
- Modify: `app/src/modules/ti/run-ti-tests.mjs`

**Interfaces:**
- Consumes:
  `copySensitiveText(value: string, clipboard: ClipboardWriter | undefined): Promise<boolean>` from
  Task 1 and the existing `revealedPassword?.password`.
- Produces: a confirmed clipboard write with `Senha copiada.` feedback, or a generic failure toast
  without raw error or secret content.

- [ ] **Step 1: Add the failing component-integration contract test**

Insert this case after the helper test in `app/src/modules/ti/run-ti-tests.mjs`:

```js
await runTest("ti password copy uses the safe helper and generic feedback", async () => {
  const tabSource = await readModuleSource("components/TiPasswordsTab.tsx");

  assert.match(tabSource, /import \{ copySensitiveText \} from "\.\.\/utils\/copySensitiveText"/);
  assert.match(
    tabSource,
    /const clipboard = typeof navigator === "undefined" \? undefined : navigator\.clipboard/,
  );
  assert.match(tabSource, /const copied = await copySensitiveText\(secret, clipboard\)/);
  assert.match(tabSource, /toast\.success\("Senha copiada\."\)/);
  assert.match(
    tabSource,
    /toast\.error\(\s*"Não foi possível copiar a senha\. Verifique a permissão da área de transferência\.",?\s*\)/,
  );
  assert.doesNotMatch(tabSource, /navigator\.clipboard\.writeText\(secret\)/);
  assert.doesNotMatch(tabSource, /document\.execCommand/);
});
```

- [ ] **Step 2: Run the TI test suite and verify RED**

Run:

```bash
pnpm --filter @workspace/app test:ti
```

Expected: the new integration case fails because `TiPasswordsTab` still calls
`navigator.clipboard.writeText(secret)` directly and does not import the helper.

- [ ] **Step 3: Replace the direct clipboard call with the safe boundary**

Add this import near the existing TI hooks and types imports in
`app/src/modules/ti/components/TiPasswordsTab.tsx`:

```ts
import { copySensitiveText } from "../utils/copySensitiveText";
```

Replace `handleCopyRevealedPassword` with:

```ts
async function handleCopyRevealedPassword() {
  const secret = revealedPassword?.password;

  if (!secret) {
    toast.error("Senha indisponível para cópia.");
    return;
  }

  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  const copied = await copySensitiveText(secret, clipboard);

  if (copied) {
    toast.success("Senha copiada.");
    return;
  }

  toast.error(
    "Não foi possível copiar a senha. Verifique a permissão da área de transferência.",
  );
}
```

Do not change the reveal query, cache clearing, button permission guard, or password rendering.

- [ ] **Step 4: Run the TI test suite and verify GREEN**

Run:

```bash
pnpm --filter @workspace/app test:ti
```

Expected: all TI tests pass, including exact clipboard writing, unavailable/rejected clipboard
handling, helper integration, generic feedback, and the existing reveal-cache protections.

- [ ] **Step 5: Run frontend typecheck**

Run:

```bash
pnpm --filter @workspace/app typecheck
```

Expected: both `tsc --noEmit` and `typecheck:usefetch` exit `0`. If workspace packages have not yet
produced their ignored `dist` outputs in this worktree, build only the required workspace package
and rerun the same typecheck without changing manifests.

- [ ] **Step 6: Commit the component integration**

```bash
git add app/src/modules/ti/components/TiPasswordsTab.tsx app/src/modules/ti/run-ti-tests.mjs
git commit -m "fix(ti): copy revealed passwords safely"
```

---

### Task 3: Complete scoped verification and publication readiness

**Files:**
- Verify: `app/src/modules/ti/components/TiPasswordsTab.tsx`
- Verify: `app/src/modules/ti/utils/copySensitiveText.ts`
- Verify: `app/src/modules/ti/run-ti-tests.mjs`
- Verify: `docs/superpowers/specs/2026-07-24-ti-password-copy-credential-design.md`
- Verify: `docs/superpowers/plans/2026-07-24-ti-password-copy-credential.md`

**Interfaces:**
- Consumes: the complete branch diff against `origin/develop`.
- Produces: a clean, tested, reviewable branch containing only issue #505 changes.

- [ ] **Step 1: Refresh Graphify or record the prescribed fallback**

Run:

```bash
pnpm graphify:update:ui
```

Expected: the frontend graph refreshes. If Graphify remains unavailable or the graph does not
exist, record that result and use the manual checks in Steps 4–6, as required by `AGENTS.md`.

- [ ] **Step 2: Run final frontend tests and typecheck**

Run:

```bash
pnpm --filter @workspace/app test:ti
pnpm --filter @workspace/app typecheck
```

Expected: all TI tests pass and both TypeScript checks exit `0`.

- [ ] **Step 3: Run scoped Biome checks**

Run each changed source file through Biome:

```bash
pnpm exec biome check --stdin-file-path app/src/modules/ti/components/TiPasswordsTab.tsx < app/src/modules/ti/components/TiPasswordsTab.tsx
pnpm exec biome check --stdin-file-path app/src/modules/ti/utils/copySensitiveText.ts < app/src/modules/ti/utils/copySensitiveText.ts
pnpm exec biome check --stdin-file-path app/src/modules/ti/run-ti-tests.mjs < app/src/modules/ti/run-ti-tests.mjs
```

Expected: each command exits `0`.

- [ ] **Step 4: Check security-sensitive call sites**

Run:

```bash
rg -n "copySensitiveText|navigator\\.clipboard|document\\.execCommand|console\\.|toast\\." \
  app/src/modules/ti/components/TiPasswordsTab.tsx \
  app/src/modules/ti/utils/copySensitiveText.ts \
  app/src/modules/ti/run-ti-tests.mjs
```

Expected:

- the component calls `copySensitiveText` with the revealed password;
- no direct `navigator.clipboard.writeText(secret)` remains;
- no `document.execCommand` fallback exists;
- the helper contains no `console` call; and
- toast messages are generic and do not interpolate `secret` or an error object.

- [ ] **Step 5: Verify diff scope and untouched manifests**

Run:

```bash
git diff --check origin/develop...HEAD
git diff --name-status origin/develop...HEAD
git diff --exit-code origin/develop...HEAD -- \
  package.json app/package.json pnpm-lock.yaml
```

Expected: no whitespace errors; only the approved spec, plan, TI password component, TI clipboard
helper, and TI test runner are changed; package manifests and lockfile remain unchanged.

- [ ] **Step 6: Review the full branch diff**

Run:

```bash
git diff origin/develop...HEAD -- \
  app/src/modules/ti/components/TiPasswordsTab.tsx \
  app/src/modules/ti/utils/copySensitiveText.ts \
  app/src/modules/ti/run-ti-tests.mjs
git status --short --branch
```

Expected: the branch is clean, the implementation matches the approved design, no secret is
logged or persisted, and no unrelated code is present.

- [ ] **Step 7: Prepare publication**

After verification, use `superpowers:verification-before-completion`,
`superpowers:finishing-a-development-branch`, and `github:yeet` to:

- fetch and compare the latest `origin/develop`;
- push `fix/505-ti-password-copy-credential`;
- open a draft PR against `develop`;
- use an English PR title and an English Markdown description;
- include root cause, user impact, validation evidence, and `Closes #505`; and
- preserve the isolated worktree for review changes.
