import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const moduleUrl = new URL("./", import.meta.url);
const moduleRoot =
  moduleUrl.pathname.startsWith("/") && /^[A-Za-z]:/.test(moduleUrl.pathname.slice(1))
    ? moduleUrl.pathname.slice(1)
    : moduleUrl.pathname;
const appRoot = join(moduleRoot, "../../..");
const moduleRootRelative = "src/modules/regularize";

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function readModuleSource(relativePath) {
  return readFile(join(moduleRoot, relativePath), "utf8");
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(path)));
      continue;
    }

    if (entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

await runTest("regularize endpoints stay centralized in the frontend contract", async () => {
  const contractSource = await readModuleSource("services/regularizeService.contract.ts");

  for (const endpoint of [
    "/regularize/passwords",
    "/regularize/password",
    "/regularize/sites-pass",
    "/regularize/sites-pass-detail",
    "/regularize/pf",
    "/regularize/pfs",
    "/regularize/partners",
    "/regularize/partner",
    "/regularize/municipal-taxes",
    "/regularize/municipal-taxes-detail",
    "/regularize/processes",
    "/regularize/process",
    "/regularize/guidance/list",
    "/regularize/guidance/detail",
    "/regularize/guidance",
    "/regularize/guidance/activity/add",
    "/regularize/guidance/activity/remove",
    "/regularize/guidance/partner/add",
    "/regularize/guidance/partner/remove",
    "/regularize/licenses",
    "/regularize/license",
  ]) {
    assert.match(contractSource, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
});

await runTest("regularize service is the only module file importing the API client", async () => {
  const files = await collectSourceFiles(moduleRoot);
  const offenders = [];

  for (const file of files) {
    const relativePath = relative(appRoot, file).replaceAll("\\", "/");

    if (relativePath === `${moduleRootRelative}/services/regularizeService.ts`) {
      continue;
    }

    const source = await readFile(file, "utf8");

    if (source.includes("@shared/services/apiClient") || source.includes("@shared/services/api")) {
      offenders.push(relativePath);
    }
  }

  assert.deepEqual(offenders, []);
});

await runTest("regularize hooks use the domain query keys", async () => {
  for (const hookPath of [
    "hooks/useRegularizeCredentials.ts",
    "hooks/useRegularizePeople.ts",
    "hooks/useRegularizeOperations.ts",
  ]) {
    const source = await readModuleSource(hookPath);

    assert.match(source, /regularizeQueryKeys/);
    assert.match(source, /useFetch/);
  }
});

await runTest("regularize page uses the new module instead of the legacy mock screen", async () => {
  const pageSource = await readFile(join(appRoot, "src/pages/regularize.tsx"), "utf8");

  assert.match(pageSource, /@modules\/regularize/);
  assert.doesNotMatch(pageSource, /shared\/components\/newLayout\/Regularize/);
});

await runTest("RegularizePage does not define primary mock arrays", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.doesNotMatch(pageSource, /const\s+(processes|permits|clients|passwords|partners)\s*=/);
  assert.doesNotMatch(pageSource, /api\.(get|post|put|delete)/);
});
