import assert from "node:assert/strict";
import { mkdir, rm, stat, utimes } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { clearStaleLock, LOCK_STALE_MS } from "./prisma-generate.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const lockDir = join(rootDir, ".turbo", "prisma", "generate.lock");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

test("lock recente e preservado: o detentor ainda esta gerando", async (t) => {
  const had = await exists(lockDir);
  t.after(async () => {
    if (!had) {
      await rm(lockDir, { recursive: true, force: true });
    }
  });

  await mkdir(lockDir, { recursive: true });

  assert.equal(await clearStaleLock(), false);
  assert.equal(await exists(lockDir), true);
});

test("lock orfao e descartado em vez de travar o laco para sempre", async (t) => {
  const had = await exists(lockDir);
  t.after(async () => {
    if (!had) {
      await rm(lockDir, { recursive: true, force: true });
    }
  });

  await mkdir(lockDir, { recursive: true });
  // Simula o detentor morto sem rodar o `finally`: o diretorio fica com mtime antigo.
  const abandoned = new Date(Date.now() - LOCK_STALE_MS - 60_000);
  await utimes(lockDir, abandoned, abandoned);

  assert.equal(await clearStaleLock(), true);
  assert.equal(await exists(lockDir), false);
});

test("sem lock nao ha nada a limpar", async () => {
  await rm(lockDir, { recursive: true, force: true });
  assert.equal(await clearStaleLock(), false);
});
