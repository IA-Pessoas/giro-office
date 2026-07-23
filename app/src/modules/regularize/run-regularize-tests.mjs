import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = fileURLToPath(new URL("./", import.meta.url));
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

await runTest("regularize operations service exposes create and update endpoints", async () => {
  const serviceSource = await readModuleSource("services/regularizeService.ts");

  for (const endpoint of ["municipalTaxes", "process", "guidance", "license"]) {
    assert.match(
      serviceSource,
      new RegExp(`api\\.post\\(REGULARIZE_ENDPOINTS\\.${endpoint}`),
    );
    assert.match(
      serviceSource,
      new RegExp(`api\\.put\\(REGULARIZE_ENDPOINTS\\.${endpoint}`),
    );
  }

  for (const endpoint of [
    "guidanceActivityAdd",
    "guidanceActivityRemove",
    "guidancePartnerAdd",
    "guidancePartnerRemove",
  ]) {
    assert.match(
      serviceSource,
      new RegExp(`api\\.post\\(REGULARIZE_ENDPOINTS\\.${endpoint}`),
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

await runTest("regularize operations mutations stay in hooks and invalidate cache", async () => {
  const source = await readModuleSource("hooks/useRegularizeOperations.ts");

  for (const mutationName of [
    "useCreateRegularizeMunicipalTaxMutation",
    "useUpdateRegularizeMunicipalTaxMutation",
    "useCreateRegularizeProcessMutation",
    "useUpdateRegularizeProcessMutation",
    "useCreateRegularizeGuidanceMutation",
    "useUpdateRegularizeGuidanceMutation",
    "useAddRegularizeGuidanceActivityMutation",
    "useRemoveRegularizeGuidanceActivityMutation",
    "useAddRegularizeGuidancePartnerMutation",
    "useRemoveRegularizeGuidancePartnerMutation",
    "useCreateRegularizeLicenseMutation",
    "useUpdateRegularizeLicenseMutation",
  ]) {
    assert.match(source, new RegExp(`export function ${mutationName}`));
  }

  assert.match(source, /useMutation/);
  assert.match(source, /useQueryClient/);
  assert.match(source, /invalidateQueries\(\{\s*queryKey: regularizeQueryKeys/);
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

await runTest("regularize operations forms are wired in the page", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  for (const formName of [
    "RegularizeMunicipalTaxesForm",
    "RegularizeProcessForm",
    "RegularizeGuidanceForm",
    "RegularizeGuidanceActivityForm",
    "RegularizeGuidancePartnerForm",
    "RegularizeLicenseForm",
  ]) {
    assert.match(pageSource, new RegExp(`<${formName}`));
  }
});

await runTest("regularize operational tabs expose write actions", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  for (const label of [
    "Novo processo",
    "Nova licença",
    "Novo tributo",
    "Nova orientação",
    "Adicionar atividade",
    "Adicionar sócio",
  ]) {
    assert.match(pageSource, new RegExp(`label="${label}"`));
  }
});

await runTest("regularize municipal tax keeps row actions visible and centered", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const taxTableStart = pageSource.indexOf(
    'DataTable headers={["Cliente", "Documento", "Cidade", "Ano", "Registro"',
  );
  const taxTableEnd = pageSource.indexOf("</DataTable>", taxTableStart);
  const taxTableSource = pageSource.slice(taxTableStart, taxTableEnd);

  assert.match(pageSource, /headers\.map\(\(header\) =>/);
  assert.match(pageSource, /header === "" \|\| header === "Ação"/);
  assert.match(
    pageSource,
    /DataTable headers=\{\["Cliente", "Documento", "Cidade", "Ano", "Registro", "Ação"\]\}/,
  );
  assert.match(pageSource, /label="Novo tributo"/);
  assert.match(taxTableSource, /TableTextActionButton/);
  assert.match(taxTableSource, /title="Editar tributo"/);
  assert.match(taxTableSource, /label="Editar"/);
  assert.match(taxTableSource, /mode: "edit"/);
  assert.match(taxTableSource, /mode: "create"/);
  assert.match(taxTableSource, /<td className="px-4 py-3 text-center">/);
  assert.match(taxTableSource, /<div className="flex justify-center">/);
  assert.doesNotMatch(taxTableSource, /<span className="text-sm text-gray-400 dark:text-slate-500">-<\/span>/);
  assert.doesNotMatch(taxTableSource, /Cadastrar/);
  assert.doesNotMatch(taxTableSource, /Criar tributo/);
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

await runTest("regularize password creation requires a selected client", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const passwordLabelIndex = pageSource.indexOf('label="Nova senha"');
  const passwordActionStart = pageSource.lastIndexOf("<PrimaryActionButton", passwordLabelIndex);
  const passwordActionEnd = pageSource.indexOf("/>", passwordLabelIndex);
  const passwordActionSource = pageSource.slice(passwordActionStart, passwordActionEnd);

  assert.notEqual(passwordLabelIndex, -1);
  assert.notEqual(passwordActionStart, -1);
  assert.notEqual(passwordActionEnd, -1);
  assert.match(passwordActionSource, /disabled=\{!currentCredentialClientId\}/);
});

await runTest("regularize process empty state is centered across the process view", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(pageSource, /emptyClassName="[^"]*xl:col-span-2[^"]*"/);
  assert.match(pageSource, /emptyClassName="[^"]*items-center[^"]*justify-center[^"]*"/);
});

await runTest("regularize client documents are consistently formatted", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const rawDocumentMatches = pageSource.match(/formatText\(item\.cpf_cnpj\)/g) ?? [];
  const formattedDocumentMatches = pageSource.match(/formatDocument\(item\.cpf_cnpj\)/g) ?? [];

  assert.match(pageSource, /import \{ formatCPF_CNPJ \} from "@shared\/utils\/formatters";/);
  assert.match(pageSource, /function formatDocument/);
  assert.deepEqual(rawDocumentMatches, []);
  assert.ok(formattedDocumentMatches.length >= 3);
  assert.doesNotMatch(pageSource, /description: client\.cpf_cnpj/);
  assert.doesNotMatch(pageSource, /description: clientPf\.cpf/);
  assert.match(pageSource, /description: formatDocumentDescription\(clientPf\.cpf\)/);
  assert.match(
    pageSource,
    /return item\.clientPJ\?\.name \?\? item\.clientPF\?\.name \?\? formatDocument\(item\.cpf_cnpj\);/,
  );
  assert.doesNotMatch(pageSource, /formatText\(partner\.cpf \?\? partner\.document\)/);
  assert.doesNotMatch(pageSource, /formatText\(item\.cpf\)/);
  assert.doesNotMatch(pageSource, /formatText\(clientPfDetailQuery\.data\.cpf\)/);
  assert.match(pageSource, /formatDocument\(partner\.cpf \?\? partner\.document\)/);
  assert.match(pageSource, /formatDocument\(item\.cpf\)/);
  assert.match(pageSource, /formatDocument\(clientPfDetailQuery\.data\.cpf\)/);
});

await runTest("regularize required field errors render as sticky alerts", async () => {
  const controlsSource = await readModuleSource("components/regularizeFormControls.tsx");

  assert.match(controlsSource, /role="alert"/);
  assert.match(controlsSource, /sticky top-0/);
});

await runTest("regularize required field markers keep label punctuation spacing clean", async () => {
  const controlsSource = await readModuleSource("components/regularizeFormControls.tsx");

  assert.match(controlsSource, /inline-flex items-center gap-1/);
  assert.match(controlsSource, /<span>\{label\}<\/span>/);
  assert.match(controlsSource, /<span className="text-red-500">\*<\/span>/);
  assert.doesNotMatch(controlsSource, /> \*<\/span>/);
});

await runTest("regularize form action footers stay unseparated", async () => {
  const controlsSource = await readModuleSource("components/regularizeFormControls.tsx");
  const actionsStart = controlsSource.indexOf("export function RegularizeFormActions");
  const actionsSource = controlsSource.slice(actionsStart);

  assert.match(actionsSource, /className="flex justify-end gap-2 pt-2"/);
  assert.doesNotMatch(actionsSource, /border-t/);
  assert.doesNotMatch(actionsSource, /dark:border/);
});

await runTest("regularize selects use the shared native select arrow", async () => {
  const files = await collectSourceFiles(join(moduleRoot, "components"));
  const rawSelectOffenders = [];

  for (const file of files) {
    const relativePath = relative(appRoot, file).replaceAll("\\", "/");

    if (relativePath === `${moduleRootRelative}/components/RegularizeNativeSelect.tsx`) {
      continue;
    }

    const source = await readFile(file, "utf8");

    if (source.includes("<select")) {
      rawSelectOffenders.push(relativePath);
    }
  }

  const controlsSource = await readModuleSource("components/regularizeFormControls.tsx");
  const nativeSelectSource = await readModuleSource("components/RegularizeNativeSelect.tsx");

  assert.deepEqual(rawSelectOffenders, []);
  assert.match(controlsSource, /appearance-none/);
  assert.match(controlsSource, /bg-\[position:right_0\.95rem_center\]/);
  assert.match(nativeSelectSource, /regularizeSelectArrowStyle/);
  assert.match(nativeSelectSource, /backgroundImage/);
});

await runTest("regularize finite status and urgency fields use native selects", async () => {
  const controlsSource = await readModuleSource("components/regularizeFormControls.tsx");
  const clientPfSource = await readModuleSource("components/RegularizeClientPfForm.tsx");
  const processSource = await readModuleSource("components/RegularizeProcessForm.tsx");
  const guidanceSource = await readModuleSource("components/RegularizeGuidanceForm.tsx");
  const licenseSource = await readModuleSource("components/RegularizeLicenseForm.tsx");

  for (const optionExport of [
    "regularizeClientStatusOptions",
    "regularizeProcessStatusOptions",
    "regularizeGuidanceStatusOptions",
    "regularizeLicenseStatusOptions",
    "regularizeUrgencyOptions",
    "getRegularizePresetOptions",
  ]) {
    assert.match(controlsSource, new RegExp(`export .*${optionExport}`));
  }

  assert.match(clientPfSource, /regularizeClientStatusOptions/);
  assert.match(clientPfSource, /<RegularizeNativeSelect\s+value=\{formState\.status\}/);
  assert.match(processSource, /regularizeProcessStatusOptions/);
  assert.match(processSource, /regularizeUrgencyOptions/);
  assert.match(processSource, /<RegularizeNativeSelect\s+value=\{formState\.status\}/);
  assert.match(processSource, /<RegularizeNativeSelect\s+value=\{formState\.urgency\}/);
  assert.match(guidanceSource, /regularizeGuidanceStatusOptions/);
  assert.match(guidanceSource, /<RegularizeNativeSelect\s+value=\{formState\.status\}/);
  assert.match(licenseSource, /regularizeLicenseStatusOptions/);
  assert.match(licenseSource, /regularizeUrgencyOptions/);
  assert.match(licenseSource, /<RegularizeNativeSelect\s+value=\{formState\.status\}/);
  assert.match(licenseSource, /<RegularizeNativeSelect\s+value=\{formState\.urgency\}/);
});

await runTest("regularize municipal tax year uses the shared native select", async () => {
  const municipalTaxSource = await readModuleSource("components/RegularizeMunicipalTaxesForm.tsx");
  const yearFieldStart = municipalTaxSource.indexOf('<RegularizeFormField label="Ano" required>');
  const yearFieldEnd = municipalTaxSource.indexOf("</RegularizeFormField>", yearFieldStart);
  const yearFieldSource = municipalTaxSource.slice(yearFieldStart, yearFieldEnd);

  assert.match(municipalTaxSource, /function getRegularizeMunicipalTaxYearOptions/);
  assert.match(yearFieldSource, /<RegularizeNativeSelect\s+value=\{formState\.year\}/);
  assert.match(yearFieldSource, /handleChange\("year", event\.target\.value\)/);
  assert.match(yearFieldSource, /yearOptions\.map/);
  assert.doesNotMatch(yearFieldSource, /type="number"/);
  assert.doesNotMatch(yearFieldSource, /regularizeTextFieldClassName/);
});

await runTest("regularize tab actions align with the lower edge of tab headers", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(pageSource, /sm:items-end/);
  assert.doesNotMatch(pageSource, /sm:items-start sm:justify-between/);
});

await runTest("regularize primary CRUD action buttons center icon and label", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const controlsSource = await readModuleSource("components/regularizeFormControls.tsx");
  const actionButtonStart = pageSource.indexOf("function PrimaryActionButton");
  const actionButtonEnd = pageSource.indexOf("function TabActionHeader", actionButtonStart);
  const actionButtonSource = pageSource.slice(actionButtonStart, actionButtonEnd);

  assert.match(controlsSource, /inline-flex items-center justify-center gap-2/);
  assert.match(controlsSource, /px-4 py-2 text-sm font-medium/);
  assert.doesNotMatch(controlsSource, /leading-none/);
  assert.match(actionButtonSource, /<Icon className="h-4 w-4 shrink-0" \/>/);
  assert.match(actionButtonSource, /<span>\{label\}<\/span>/);
  assert.doesNotMatch(actionButtonSource, /<span className="inline-flex items-center gap-2">/);
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

await runTest("regularize credential empty layouts keep intentional detail behavior", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const passwordsStart = pageSource.indexOf('{activeTab === "passwords"');
  const sitesStart = pageSource.indexOf('{activeTab === "sites"', passwordsStart);
  const passwordsSource = pageSource.slice(passwordsStart, sitesStart);

  assert.match(pageSource, /const hasSiteRows = \(siteQuery\.data\?\.length \?\? 0\) > 0;/);
  assert.notEqual(passwordsStart, -1);
  assert.notEqual(sitesStart, -1);
  assert.match(passwordsSource, /<div className="space-y-3">/);
  assert.match(passwordsSource, /<label className="flex w-full flex-col/);
  assert.doesNotMatch(passwordsSource, /<label className="[^"]*max-w-/);
  assert.match(
    passwordsSource,
    /<QueryStatePanel\s+query=\{credentialQuery\}\s+emptyTitle="Nenhuma senha encontrada\."\s+emptyClassName="min-h-24 py-5"\s*>/,
  );
  assert.match(passwordsSource, /<DetailPanel title="Senha selecionada">/);
  assert.doesNotMatch(passwordsSource, /hasCredentialRows \? \(/);
  assert.doesNotMatch(passwordsSource, /emptyClassName="[^"]*xl:col-span-2[^"]*"/);
  assert.match(pageSource, /hasSiteRows \? \(\s*<DetailPanel title="Site selecionado">/);
  assert.match(pageSource, /<QueryStatePanel\s+query=\{siteQuery\}\s+emptyTitle="Nenhum site encontrado\."\s+emptyClassName="[^"]*xl:col-span-2[^"]*"/);
});

await runTest("regularize page uses the new module instead of the legacy mock screen", async () => {
  const pageSource = await readFile(join(appRoot, "src/pages/regularize.tsx"), "utf8");

  assert.match(pageSource, /@modules\/regularize/);
  assert.doesNotMatch(pageSource, /shared\/components\/newLayout\/Regularize/);
});

await runTest("regularize page derives write and reveal permissions from module access", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const typesSource = await readModuleSource("types.ts");

  assert.match(pageSource, /import \{ useModuleAccess \} from "@modules\/auth";/);
  assert.match(pageSource, /const \{ access: regularizeAccess \} = useModuleAccess\("regularize"\);/);
  assert.match(pageSource, /const canRevealCredentials = regularizeAccess\.canEdit;/);
  assert.match(pageSource, /const canManageRegularizeCore = regularizeAccess\.canEdit;/);
  assert.match(pageSource, /enabled: canRevealCredentials && isPasswordRevealContextActive/);
  assert.match(pageSource, /enabled: canRevealCredentials && isSitePasswordRevealContextActive/);
  assert.doesNotMatch(pageSource, /REGULARIZE_CAPABILITIES/);
  assert.doesNotMatch(pageSource, /hasCredentialRevealCapability/);
  assert.doesNotMatch(pageSource, /hasCoreWriteCapability/);
  assert.doesNotMatch(typesSource, /RegularizeCapability/);
});

await runTest("regularize boolean status labels stay user-facing", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(pageSource, /if \(typeof status === "boolean"\) \{/);
  assert.match(pageSource, /label: status \? "Ativo" : "Inativo"/);
  assert.doesNotMatch(pageSource, /label: status \? String\(status\) : "Ativo"/);
  assert.doesNotMatch(pageSource, /label: status \? String\(status\) : "Inativo"/);
});

await runTest("regularize municipal tax yes-no values normalize booleans", async () => {
  const municipalTaxSource = await readModuleSource(
    "components/RegularizeMunicipalTaxesForm.tsx",
  );

  assert.match(municipalTaxSource, /function toRegularizeYesNo/);
  assert.match(municipalTaxSource, /tlp_is_sent: toRegularizeYesNo\(municipalTax\.tlp_is_sent\)/);
  assert.match(municipalTaxSource, /tll_is_sent: toRegularizeYesNo\(municipalTax\.tll_is_sent\)/);
  assert.match(municipalTaxSource, /return normalized === "sim" \|\| normalized === "true" \? "Sim" : "Não";/);
});

await runTest("regularize mutations invalidate subdomain roots to avoid stale filtered lists", async () => {
  const credentialsSource = await readModuleSource("hooks/useRegularizeCredentials.ts");
  const peopleSource = await readModuleSource("hooks/useRegularizePeople.ts");
  const operationsSource = await readModuleSource("hooks/useRegularizeOperations.ts");

  assert.match(credentialsSource, /queryKey: regularizeQueryKeys\.credentials\(\)/);
  assert.match(peopleSource, /queryKey: regularizeQueryKeys\.people\(\)/);
  assert.match(operationsSource, /queryKey: regularizeQueryKeys\.operations\(\)/);
  assert.doesNotMatch(peopleSource, /regularizeQueryKeys\.clientPfs\(\{ status: payload\.status \}\)/);
  assert.doesNotMatch(operationsSource, /regularizeQueryKeys\.processes\(\{ status: payload\.status \}\)/);
  assert.doesNotMatch(operationsSource, /regularizeQueryKeys\.licenses\(\{ status: payload\.status \}\)/);
});

await runTest("regularize guardrail runs in the app aggregate test script", async () => {
  const packageSource = await readFile(join(appRoot, "package.json"), "utf8");
  const packageJson = JSON.parse(packageSource);

  assert.match(packageJson.scripts.test, /pnpm run test:regularize/);
});

await runTest("RegularizePage does not define primary mock arrays", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.doesNotMatch(pageSource, /const\s+(processes|permits|clients|passwords|partners)\s*=/);
  assert.doesNotMatch(pageSource, /api\.(get|post|put|delete)/);
});

await runTest("regularize selects clients in the header and shows the bound client in forms", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");
  const formSources = await Promise.all(
    [
      "RegularizeLicenseForm.tsx",
      "RegularizeMunicipalTaxesForm.tsx",
      "RegularizePartnerForm.tsx",
      "RegularizePasswordForm.tsx",
      "RegularizeProcessForm.tsx",
    ].map((fileName) => readModuleSource(`components/${fileName}`)),
  );

  assert.match(pageSource, /ClientPickerModal/);
  assert.match(pageSource, /function openClientScopedForm/);
  assert.match(pageSource, /Selecione um cliente no cabeçalho antes de iniciar este cadastro\./);
  assert.equal((pageSource.match(/disabled=\{!currentCredentialClientId\}/g) ?? []).length, 7);
  assert.doesNotMatch(pageSource, /RegularizeClientPickerField/);
  assert.doesNotMatch(pageSource, /useClients\(/);
  formSources.forEach((formSource) => {
    assert.match(formSource, /ClientSelectionField/);
    assert.doesNotMatch(formSource, /RegularizeClientPickerField/);
  });
});
