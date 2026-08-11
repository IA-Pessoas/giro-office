# Certificate Password Decryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store PJ and PF certificate passwords encrypted at rest, decrypt them only for authorized certificate detail responses, preserve the existing permission boundary, and document the operational configuration without changing the database schema.

**Architecture:** Add a small versioned AES-256-GCM JSON-envelope helper in `shared`, wrap it with certificate-specific validation and safe service errors, inject that dependency into the PJ and PF services, and encrypt at service boundaries. Existing legacy envelopes use the same key and format as the Pessoal password crypto; plaintext values are treated as legacy input and lazily re-encrypted on authorized reads. Unauthorized reads never decrypt or return the password.

**Tech Stack:** TypeScript, Node.js `crypto`, Vitest, Node test runner, Prisma service layer, Express routes, pnpm.

---

## Task 1: Add the shared text encryption primitive and certificate crypto adapter

**Files:**
- Create `shared/src/security/encryptedText.ts`.
- Update `shared/src/security/index.ts` and any package export required for the new module.
- Create `services/certificate-service/src/services/certificatePasswordCrypto.ts`.
- Create `services/certificate-service/src/test/certificatePasswordCrypto.test.ts`.
- Create or update `shared/tests/security/encryptedText.test.ts`.

- [ ] Write failing tests first for the shared primitive: AES-256-GCM JSON envelope with `v`, base64 `iv`, base64 `tag`, and base64 `data`; round-trip; version preservation; malformed envelope classification; plaintext classification; and invalid key rejection.
- [ ] Run the focused shared test command and confirm it fails for the intended missing implementation.
- [ ] Implement only the shared primitive needed by this issue. Keep `shared/src/security/encryption.ts` unchanged because its colon-delimited format is used by other services.
- [ ] Run the focused shared tests and typecheck.
- [ ] Write failing certificate adapter tests for the configured key/version, legacy envelope decryption, plaintext detection, and conversion of malformed or undecryptable values into a safe `ServiceError` response.
- [ ] Implement the certificate adapter using the shared primitive. Require `CERTIFICATE_PASSWORD_ENCRYPTION_KEY` to decode to exactly 32 bytes; default the version only where the existing service configuration convention permits it; never log key material or plaintext.
- [ ] Run the focused certificate crypto test and the service typecheck.

## Task 2: Encrypt and authorize PJ and PF service behavior

**Files:**
- Update `services/certificate-service/src/services/certificatePjService.ts`.
- Update `services/certificate-service/src/services/certificatePfService.ts`.
- Update `services/certificate-service/src/routes/certificatePjRoutes.ts` and `services/certificate-service/src/routes/certificatePfRoutes.ts`.
- Update the related PJ/PF service and route tests under `services/certificate-service/src/test/`.

- [ ] Extend the service dependencies with the certificate password crypto adapter while keeping existing test construction compatible where possible.
- [ ] Add failing PJ and PF tests proving create and update persist an encrypted envelope and do not return plaintext passwords.
- [ ] Add failing PJ and PF detail tests proving permission `certificado >= 2` returns the decrypted password, lower permission omits it, and unauthorized reads do not attempt decryption.
- [ ] Add failing PJ and PF tests for legacy plaintext values: an authorized read returns the plaintext once and persists the encrypted replacement; an unauthorized read omits it without rewriting it.
- [ ] Add failing PJ and PF tests for invalid encrypted values, asserting a controlled 422 response/service error and no raw crypto exception.
- [ ] Implement the smallest service-layer change: encrypt incoming password values before Prisma writes; remove password from mutation responses unless the existing contract explicitly requires it; decrypt only after the existing permission check; preserve file metadata behavior and list redaction.
- [ ] Ensure routes construct the crypto dependency from application configuration and use the same configured key for PJ and PF.
- [ ] Run focused PJ/PF service and route tests, then the complete certificate-service test suite and typecheck.

## Task 3: Wire configuration and document deployment requirements

**Files:**
- Update `services/certificate-service/src/app.ts` and `services/certificate-service/src/server.ts`.
- Update `services/certificate-service/src/test/envBootstrap.ts` and the certificate environment tests.
- Update `services/certificate-service/README.md`.
- Update `.env.example` if this repository documents service variables there.
- Update `scripts/ci/vps-secrets.manifest`.

- [ ] Add failing configuration tests for the required certificate password key and key version, including exact 32-byte base64 validation and a clear startup failure when the key is absent or invalid.
- [ ] Implement configuration wiring without embedding secrets, generating a new production key, or changing existing file-encryption configuration.
- [ ] Document that the key must remain identical to the key used for existing legacy certificate envelopes; document algorithm, envelope format, rotation/version expectations, and that no schema migration or bulk backfill is introduced.
- [ ] Keep secret values only in deployment environment configuration. Do not commit `.env` or `.env.vps.*` values.
- [ ] Run configuration tests, complete certificate-service tests, typecheck, and the relevant build/check commands.

## Task 4: Review, simplify, and verify

- [ ] Run `git diff --check`, inspect `git diff --stat`, and search all PJ/PF service call sites to confirm constructor/configuration compatibility.
- [ ] Use the performance review guidance to verify no per-list decryption, unbounded buffering, repeated key decoding, or unnecessary database round trips were introduced. Decryption must remain detail-only and authorization-gated.
- [ ] Request an independent code review covering correctness, security, acceptance criteria, and over-engineering; address concrete findings and rerun affected tests.
- [ ] Run the fresh verification set: shared tests/typecheck, certificate-service tests/typecheck/build/check, and any targeted integration or route smoke tests available in the repository.
- [ ] Confirm the final behavior against issue #755: PJ and PF, encrypted writes, authorized decrypt, unauthorized omission, legacy handling, invalid-value handling, configuration documentation, and no database schema change.

## Task 5: Commit, push, and open a draft PR

- [ ] Confirm the worktree is on `fix/issue-755-certificate-password`, based on `develop`, and has no unrelated changes.
- [ ] Commit the implementation with a focused message and push the branch with verification hooks bypassed only if required by the repository workflow.
- [ ] Open a draft PR from `fix/issue-755-certificate-password` to `develop`, link `Closes #755`, use the issue labels/milestone where supported, and request the configured reviewer.
- [ ] Include validation evidence, the explicit no-schema-migration statement, environment-variable requirements, and the supplied QA screenshot link in the PR body. Because this is a backend change, do not manufacture a UI screenshot.
- [ ] Leave the worktree and draft PR available for the user to test manually; do not merge or delete the worktree.

## Verification commands

Run from `C:/Users/Alan.Souza/Documents/Repositorios/workspace/.worktrees/issue-755-certificate-password`:

```powershell
pnpm --filter @giro/shared test
pnpm --filter @giro/shared typecheck
pnpm --filter certificate-service exec vitest run
pnpm --filter certificate-service typecheck
pnpm --filter certificate-service build
pnpm --filter certificate-service check
git diff --check
```

If package names differ from the workspace manifests, use the exact package names reported by `pnpm list --depth -1` and record the substituted command in the PR validation section.
