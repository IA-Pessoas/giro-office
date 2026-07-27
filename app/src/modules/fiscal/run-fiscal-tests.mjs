import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const moduleRoot = fileURLToPath(new URL("./", import.meta.url));

async function readModuleSource(relativePath) {
  return readFile(new URL(relativePath, `file://${moduleRoot}/`), "utf8");
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await runTest("fiscal derives write access from the fiscal module", async () => {
  const shellSource = await readModuleSource("components/FiscalShell.tsx");

  assert.match(shellSource, /import \{ useModuleAccess \} from "@modules\/auth";/);
  assert.match(shellSource, /const \{ access: fiscalAccess \} = useModuleAccess\("fiscal"\);/);
  assert.match(shellSource, /<FiscalNcmTab canEdit=\{canEdit\} \/>/);
  assert.match(shellSource, /<FiscalIcmsTab canEdit=\{canEdit\} \/>/);
  assert.match(shellSource, /<FiscalIpiTab canEdit=\{canEdit\} \/>/);
  assert.match(shellSource, /<FiscalNcmSection canEdit=\{canEdit\} \/>/);
  assert.match(shellSource, /<FiscalIcmsSection canEdit=\{canEdit\} \/>/);
  assert.match(shellSource, /<FiscalIpiSection canEdit=\{canEdit\} \/>/);
});

await runTest("fiscal viewer keeps NCM, ICMS and IPI sections read-only", async () => {
  for (const sectionName of ["FiscalNcmSection", "FiscalIcmsSection", "FiscalIpiSection"]) {
    const source = await readModuleSource(`components/${sectionName}.tsx`);

    assert.match(source, new RegExp(`export function ${sectionName}\\(\\{ canEdit \\}`));
    assert.match(source, /if \(panelIntent && canEdit\)/);
    assert.match(source, /canEdit \? \(/);
    assert.match(source, /onEdit=\{canEdit \? \(item\) => setPanelIntent/);
  }
});
