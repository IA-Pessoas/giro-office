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

await runTest("regularize core service exposes create and update endpoints", async () => {
  const serviceSource = await readModuleSource("services/regularizeService.ts");

  for (const endpoint of ["passwords", "sitesPass", "pf", "partners"]) {
    assert.match(
      serviceSource,
      new RegExp(`api\\.post\\(REGULARIZE_ENDPOINTS\\.${endpoint}`),
    );
    assert.match(
      serviceSource,
      new RegExp(`api\\.put\\(REGULARIZE_ENDPOINTS\\.${endpoint}`),
    );
  }
});

await runTest("regularize core mutations stay in hooks and invalidate cache", async () => {
  for (const hookPath of [
    "hooks/useRegularizeCredentials.ts",
    "hooks/useRegularizePeople.ts",
  ]) {
    const source = await readModuleSource(hookPath);

    assert.match(source, /useMutation/);
    assert.match(source, /useQueryClient/);
    assert.match(source, /invalidateQueries\(\{\s*queryKey: regularizeQueryKeys/);
  }
});

await runTest("regularize components do not own API calls or mutations", async () => {
  const files = await collectSourceFiles(join(moduleRoot, "components"));
  const offenders = [];

  for (const file of files) {
    const relativePath = relative(appRoot, file).replaceAll("\\", "/");
    const source = await readFile(file, "utf8");

    if (
      source.includes("api.") ||
      source.includes("setupAPIClient") ||
      source.includes("useMutation(")
    ) {
      offenders.push(relativePath);
    }
  }

  assert.deepEqual(offenders, []);
});

await runTest("regularize core forms are wired in the page", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  for (const formName of [
    "RegularizeClientPfForm",
    "RegularizePartnerForm",
    "RegularizePasswordForm",
    "RegularizeSitePasswordForm",
  ]) {
    assert.match(pageSource, new RegExp(`<${formName}`));
  }
});

await runTest("regularize password creation opens the form before required field validation", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const passwordLabelIndex = pageSource.indexOf('label="Nova senha"');
  const passwordActionStart = pageSource.lastIndexOf("<PrimaryActionButton", passwordLabelIndex);
  const passwordActionEnd = pageSource.indexOf("/>", passwordLabelIndex);
  const passwordActionSource = pageSource.slice(passwordActionStart, passwordActionEnd);

  assert.notEqual(passwordLabelIndex, -1);
  assert.notEqual(passwordActionStart, -1);
  assert.notEqual(passwordActionEnd, -1);
  assert.doesNotMatch(passwordActionSource, /disabled=\{/);
});

await runTest("regularize process empty state is centered across the process view", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(pageSource, /emptyClassName="[^"]*xl:col-span-2[^"]*"/);
  assert.match(pageSource, /emptyClassName="[^"]*items-center[^"]*justify-center[^"]*"/);
});

await runTest("regularize required field errors render as sticky alerts", async () => {
  const controlsSource = await readModuleSource("components/regularizeFormControls.tsx");

  assert.match(controlsSource, /role="alert"/);
  assert.match(controlsSource, /sticky top-0/);
});

await runTest("regularize tab actions align with the lower edge of tab headers", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(pageSource, /sm:items-end/);
  assert.doesNotMatch(pageSource, /sm:items-start sm:justify-between/);
});

await runTest("regularize credential detail panels stretch with their grids", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const detailPanelStart = pageSource.indexOf("function DetailPanel");
  const detailPanelEnd = pageSource.indexOf("function FieldLine", detailPanelStart);
  const detailPanelSource = pageSource.slice(detailPanelStart, detailPanelEnd);
  const credentialGridMatches = pageSource.match(
    /grid gap-4 xl:grid-cols-\[minmax\(0,1\.4fr\)_minmax\(320px,0\.8fr\)\] xl:items-stretch/g,
  );

  assert.match(detailPanelSource, /className="[^"]*h-full[^"]*flex-col[^"]*"/);
  assert.match(detailPanelSource, /bg-white/);
  assert.match(detailPanelSource, /dark:bg-slate-900/);
  assert.doesNotMatch(detailPanelSource, /bg-gray-50/);
  assert.doesNotMatch(detailPanelSource, /dark:bg-slate-950/);
  assert.ok((credentialGridMatches?.length ?? 0) >= 2);
});

await runTest("regularize credential empty detail states are centered", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const emptyStateMatches = pageSource.match(/<DetailEmptyState message="Sem revelação ativa\." \/>/g);

  assert.match(pageSource, /function DetailEmptyState/);
  assert.match(pageSource, /items-center justify-center text-center/);
  assert.ok((emptyStateMatches?.length ?? 0) >= 2);
  assert.doesNotMatch(pageSource, /<FieldLine label="Status" value="Sem revelação ativa\." \/>/);
});

await runTest("regularize empty credential lists do not render orphan detail cards", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(pageSource, /const hasCredentialRows = \(credentialQuery\.data\?\.length \?\? 0\) > 0;/);
  assert.match(pageSource, /const hasSiteRows = \(siteQuery\.data\?\.length \?\? 0\) > 0;/);
  assert.match(pageSource, /hasCredentialRows \? \(\s*<DetailPanel title="Senha selecionada">/);
  assert.match(pageSource, /hasSiteRows \? \(\s*<DetailPanel title="Site selecionado">/);
  assert.match(pageSource, /<QueryStatePanel\s+query=\{siteQuery\}\s+emptyTitle="Nenhum site encontrado\."\s+emptyClassName="[^"]*xl:col-span-2[^"]*"/);
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
