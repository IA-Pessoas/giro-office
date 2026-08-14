import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  'dist',
  'graphify-out',
  'node_modules',
]);
const executableConfigPattern = /^(?:postcss|tailwind|eslint|next|babel|vite)\.config\.(?:js|cjs|mjs|ts)$/;
const additionalConfigNames = new Set(['lint-staged.config.mjs', 'tasks.json']);
const maliciousMarkers = [
  /For only test/,
  /global\.[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*['"][A-Za-z0-9-]+['"]/,
  /global\[['"](?:!|_V)['"]\]/,
  /rmcej%otb%/,
  /Cot%3t=shtP/,
  /LAST_COMMIT_DATE/,
  /temp_auto_push\.bat/,
];

async function findExecutableConfigs(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findExecutableConfigs(entryPath)));
      continue;
    }

    if (executableConfigPattern.test(entry.name) || additionalConfigNames.has(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

test('executable project configs contain no PolinRider indicators', async () => {
  const configs = await findExecutableConfigs(repositoryRoot);
  assert.ok(configs.length > 0, 'expected executable project configs to be scanned');

  for (const config of configs) {
    const source = await readFile(config, 'utf8');
    const relativePath = path.relative(repositoryRoot, config);

    for (const marker of maliciousMarkers) {
      assert.doesNotMatch(source, marker, `${relativePath} contains ${marker}`);
    }

    const longestLine = Math.max(...source.split(/\r?\n/u).map((line) => line.length));
    assert.ok(longestLine < 2_000, `${relativePath} contains an unexpectedly long line`);
  }
});

test('pre-commit scans for supply-chain payloads before loading lint-staged config', async () => {
  const hook = await readFile(path.join(repositoryRoot, '.husky', 'pre-commit'), 'utf8');
  const scannerIndex = hook.indexOf('node scripts/supply-chain-integrity.mjs');
  const lintStagedIndex = hook.indexOf('pnpm lint-staged');

  assert.ok(scannerIndex >= 0, 'pre-commit must execute the supply-chain scanner');
  assert.ok(lintStagedIndex >= 0, 'pre-commit must retain lint-staged');
  assert.ok(scannerIndex < lintStagedIndex, 'scanner must run before lint-staged loads its config');
});
