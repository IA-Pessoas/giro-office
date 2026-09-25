import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  PARCELAMENTO_DEFAULT_PAGE,
  PARCELAMENTO_DEFAULT_PAGE_SIZE,
  PARCELAMENTO_ENDPOINTS,
  PARCELAMENTO_MAX_PAGE_SIZE,
  PARCELAMENTO_TABS,
  buildCreateInstallmentCompetencyPayload,
  buildCreateInstallmentPayload,
  buildPatchInstallmentCompetencyPayload,
  buildPatchInstallmentPayload,
  buildParcelamentoListParams,
  buildParcelamentoPatchPayload,
  unwrapParcelamentoEnvelope,
  unwrapParcelamentoPage,
} from "./services/parcelamentoService.contract.ts";
import * as parcelamentoContract from "./services/parcelamentoService.contract.ts";
import { PARCELAMENTO_QUERY_KEY, parcelamentoQueryKey } from "./hooks/queryKeys.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function readWorkspaceFile(filePath) {
  return readFileSync(path.join(process.cwd(), filePath), "utf8");
}

function listSourceFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      return listSourceFiles(fullPath);
    }

    return /\.(ts|tsx)$/.test(entry) ? [fullPath] : [];
  });
}

const parcelamentoUserTextFiles = [
  "src/modules/parcelamento/services/parcelamentoService.contract.ts",
  "src/modules/parcelamento/components/ParcelamentoClientSelector.tsx",
  "src/modules/parcelamento/components/ParcelamentoCompetenciesSection.tsx",
  "src/modules/parcelamento/components/ParcelamentoCompetencyForm.tsx",
  "src/modules/parcelamento/components/ParcelamentoDashboard.tsx",
  "src/modules/parcelamento/components/ParcelamentoInstallmentForm.tsx",
  "src/modules/parcelamento/components/ParcelamentoInstallmentsSection.tsx",
  "src/modules/parcelamento/components/ParcelamentoPanoramaForm.tsx",
  "src/modules/parcelamento/components/ParcelamentoPanoramasSection.tsx",
  "src/modules/parcelamento/components/ParcelamentoShell.tsx",
];

const unaccentedPortugueseText = [
  { pattern: /\bAdesao\b/, replacement: "Adesão" },
  { pattern: /\balteracoes\b/, replacement: "alterações" },
  { pattern: /\bCompetencia\b/, replacement: "Competência" },
  { pattern: /\bcompetencias\b/, replacement: "competências" },
  { pattern: /\bCompetencias\b/, replacement: "Competências" },
  { pattern: /\bconclusao\b/, replacement: "conclusão" },
  { pattern: /\bDebito\b/, replacement: "Débito" },
  { pattern: /\bdisponivel\b/, replacement: "disponível" },
  { pattern: /\binformacoes\b/, replacement: "informações" },
  { pattern: /\bjuridica\b/, replacement: "jurídica" },
  { pattern: /\bjurisdicao\b/, replacement: "jurisdição" },
  { pattern: /\bJurisdicao\b/, replacement: "Jurisdição" },
  { pattern: /\bmedio\b/, replacement: "médio" },
  { pattern: /\bmodulo\b/, replacement: "módulo" },
  { pattern: /\bNao\b/, replacement: "Não" },
  { pattern: /\bnumero\b/, replacement: "número" },
  { pattern: /\bNumero\b/, replacement: "Número" },
  { pattern: /\bnumericos\b/, replacement: "numéricos" },
  { pattern: /\boperacao\b/, replacement: "operação" },
  { pattern: /\bPagina\b/, replacement: "Página" },
  { pattern: /\bpagina\b/, replacement: "página" },
  { pattern: /\bpermissoes\b/, replacement: "permissões" },
  { pattern: /\bpossivel\b/, replacement: "possível" },
  { pattern: /\bProxima\b/, replacement: "Próxima" },
  { pattern: /\brazao\b/, replacement: "razão" },
  { pattern: /\brapida\b/, replacement: "rápida" },
  { pattern: /\bsera\b/, replacement: "será" },
  { pattern: /\bSituacao\b/, replacement: "Situação" },
  { pattern: /\busuario\b/, replacement: "usuário" },
  { pattern: /\bvisualizacao\b/, replacement: "visualização" },
];

runTest("parcelamento endpoints match the gateway public contract", () => {
  assert.equal(PARCELAMENTO_ENDPOINTS.installments, "/parcelamento/installments");
  assert.equal(
    PARCELAMENTO_ENDPOINTS.installmentDetail("installment-1"),
    "/parcelamento/installments/installment-1",
  );
  assert.equal(
    PARCELAMENTO_ENDPOINTS.installmentCompetencies("installment-1"),
    "/parcelamento/installments/installment-1/competencies",
  );
  assert.equal(
    PARCELAMENTO_ENDPOINTS.installmentCompetencyDetail("competency-1"),
    "/parcelamento/installment-competencies/competency-1",
  );
  assert.equal(PARCELAMENTO_ENDPOINTS.panoramas, "/parcelamento/panoramas");
  assert.equal(
    PARCELAMENTO_ENDPOINTS.panoramaDetail("panorama-1"),
    "/parcelamento/panoramas/panorama-1",
  );
  assert.equal(
    PARCELAMENTO_ENDPOINTS.panoramaGenerate("2026-07"),
    "/parcelamento/panoramas/competences/2026-07/generate",
  );
});

runTest("parcelamento pagination defaults stay aligned with backend", () => {
  assert.equal(PARCELAMENTO_DEFAULT_PAGE, 1);
  assert.equal(PARCELAMENTO_DEFAULT_PAGE_SIZE, 50);
  assert.equal(PARCELAMENTO_MAX_PAGE_SIZE, 100);
});

runTest("parcelamento tabs stay stable", () => {
  assert.deepEqual(
    PARCELAMENTO_TABS.map((tab) => tab.id),
    ["dashboard", "installments", "competencies", "panoramas"],
  );
});

runTest("unwrap helpers extract success envelopes and normalize pages", () => {
  const rawItem = { id: "item-1" };

  assert.deepEqual(unwrapParcelamentoEnvelope({ success: true, data: rawItem }), rawItem);
  assert.deepEqual(unwrapParcelamentoEnvelope(rawItem), rawItem);

  assert.deepEqual(
    unwrapParcelamentoPage({
      success: true,
      data: {
        items: [rawItem],
        total: 1,
        page: 2,
        page_size: 10,
        has_more: false,
      },
    }),
    {
      items: [rawItem],
      data: [rawItem],
      total: 1,
      page: 2,
      page_size: 10,
      pageSize: 10,
      has_more: false,
      hasMore: false,
    },
  );
});

runTest("list params keep backend names and remove empty filters", () => {
  assert.deepEqual(
    buildParcelamentoListParams({
      client_id: "client-1",
      status: "",
      search: " pgfn ",
      page: 0,
      page_size: 150,
    }),
    {
      client_id: "client-1",
      search: "pgfn",
      page: 1,
      page_size: 100,
    },
  );
});

runTest("patch payload removes empty values and rejects empty patch", () => {
  assert.deepEqual(
    buildParcelamentoPatchPayload({
      status: "Ativo",
      document_url: "",
      completion_date: null,
    }),
    {
      status: "Ativo",
      completion_date: null,
    },
  );

  assert.throws(() => buildParcelamentoPatchPayload({ document_url: "" }), /ao menos um campo/i);
});

runTest("installment payload builders keep backend field names", () => {
  assert.deepEqual(
    buildCreateInstallmentPayload({
      client_id: "client-1",
      agreement_number: "",
      type: "PGFN",
      legal_nature: "Federal",
      jurisdiction: "Federal",
      is_automatic_debit: false,
      first_installment_amount: 100,
      current_month_installment_amount: 120,
      agreed_installments_count: 10,
      enrollment_date: "",
    }),
    {
      client_id: "client-1",
      agreement_number: null,
      type: "PGFN",
      legal_nature: "Federal",
      jurisdiction: "Federal",
      is_automatic_debit: false,
      first_installment_amount: 100,
      current_month_installment_amount: 120,
      agreed_installments_count: 10,
      enrollment_date: null,
    },
  );

  assert.deepEqual(buildPatchInstallmentPayload({ status: "Ativo", document_url: "" }), {
    status: "Ativo",
  });
});

runTest("competency payload builders keep backend field names", () => {
  assert.deepEqual(
    buildCreateInstallmentCompetencyPayload({
      competence: "2026-07",
      how_many_paid: 1,
      how_many_overdue: 0,
      download: true,
      download_notes: "",
      upload_file: null,
      is_sent: false,
      submission_type: "",
      notes: "",
      installment_amount: 250,
    }),
    {
      competence: "2026-07",
      how_many_paid: 1,
      how_many_overdue: 0,
      download: true,
      download_notes: null,
      upload_file: null,
      is_sent: false,
      submission_type: null,
      notes: null,
      installment_amount: 250,
    },
  );

  assert.deepEqual(buildPatchInstallmentCompetencyPayload({ how_many_paid: 2, notes: "" }), {
    how_many_paid: 2,
    notes: null,
  });
});

runTest("panorama payload builders keep backend field names", () => {
  assert.equal(typeof parcelamentoContract.buildCreatePanoramaPayload, "function");
  assert.equal(typeof parcelamentoContract.buildPatchPanoramaPayload, "function");

  assert.deepEqual(
    parcelamentoContract.buildCreatePanoramaPayload({
      client_id: "client-1",
      competence: "2026-07",
      cnd_municipal: true,
      cnd_state: false,
      cnd_federal: false,
      cnd_fgts: false,
      cnd_labor: false,
      protests: false,
      state_tax_situation: false,
      federal_tax_situation: false,
      responsavel_id: "",
    }),
    {
      client_id: "client-1",
      competence: "2026-07",
      cnd_municipal: true,
      cnd_state: false,
      cnd_federal: false,
      cnd_fgts: false,
      cnd_labor: false,
      protests: false,
      state_tax_situation: false,
      federal_tax_situation: false,
      responsavel_id: null,
    },
  );

  assert.deepEqual(
    parcelamentoContract.buildPatchPanoramaPayload({ cnd_fgts: true, responsavel_id: "" }),
    {
      cnd_fgts: true,
      responsavel_id: null,
    },
  );
});

runTest("parcelamento query keys include domain and optional params", () => {
  assert.deepEqual(PARCELAMENTO_QUERY_KEY, ["parcelamento"]);
  assert.deepEqual(parcelamentoQueryKey("installments"), ["parcelamento", "installments"]);
  assert.deepEqual(
    parcelamentoQueryKey("installments", { page: 1, client_id: "client-1" }),
    ["parcelamento", "installments", { page: 1, client_id: "client-1" }],
  );
});

runTest("parcelamento package script is wired into app tests", () => {
  const packageJson = JSON.parse(readWorkspaceFile("package.json"));

  assert.equal(
    packageJson.scripts["test:parcelamento"],
    "node --experimental-strip-types src/modules/parcelamento/run-parcelamento-tests.mjs",
  );
  assert.match(packageJson.scripts.test, /pnpm run test:parcelamento/);
});

runTest("parcelamento user-facing Portuguese text keeps accents", () => {
  for (const file of parcelamentoUserTextFiles) {
    const source = readWorkspaceFile(file);

    for (const { pattern, replacement } of unaccentedPortugueseText) {
      assert.doesNotMatch(source, pattern, `${file} should use ${replacement}`);
    }
  }
});

runTest("parcelamento page uses the new module", () => {
  const page = readWorkspaceFile("src/pages/parcelamento/index.tsx");

  assert.match(page, /@modules\/parcelamento/);
  assert.doesNotMatch(page, /shared\/components\/newLayout\/Parcelamento/);
});

runTest("parcelamento shell gates access and stays free of primary mock arrays", () => {
  const shell = readWorkspaceFile("src/modules/parcelamento/components/ParcelamentoShell.tsx");

  assert.match(shell, /useModuleAccess\("parcelamento"\)/);
  assert.doesNotMatch(shell, /const\s+(certificates|debts|installments|reminders)\s*=\s*\[/);
});

runTest("parcelamento panorama completion badge uses named check fields", () => {
  const section = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoPanoramasSection.tsx",
  );

  for (const field of [
    "cnd_municipal",
    "cnd_state",
    "cnd_federal",
    "cnd_fgts",
    "cnd_labor",
    "protests",
    "state_tax_situation",
    "federal_tax_situation",
  ]) {
    assert.match(section, new RegExp(field));
  }

  assert.match(section, /panoramaCheckFields\.length/);
  assert.doesNotMatch(section, /\/8 itens/);
});

runTest("parcelamento api calls stay inside the domain service", () => {
  const moduleFiles = listSourceFiles(path.join(process.cwd(), "src/modules/parcelamento"));
  const apiCallPattern = /api\.(get|post|patch|put|delete)\(/;

  for (const filePath of moduleFiles) {
    const normalizedPath = filePath.replaceAll("\\", "/");
    const source = readFileSync(filePath, "utf8");

    if (normalizedPath.endsWith("/services/parcelamentoService.ts")) {
      continue;
    }

    assert.doesNotMatch(source, apiCallPattern, `${normalizedPath} should not call api directly`);
  }
});

runTest("parcelamento service exposes real read endpoints", () => {
  const service = readWorkspaceFile("src/modules/parcelamento/services/parcelamentoService.ts");

  assert.match(service, /async listInstallments/);
  assert.match(service, /api\.get\(PARCELAMENTO_ENDPOINTS\.installments/);
  assert.match(service, /async detailInstallment/);
  assert.match(service, /api\.get\(PARCELAMENTO_ENDPOINTS\.installmentDetail\(id\)\)/);
  assert.match(service, /async listPanoramas/);
  assert.match(service, /api\.get\(PARCELAMENTO_ENDPOINTS\.panoramas/);
  assert.match(service, /async detailPanorama/);
  assert.match(service, /api\.get\(PARCELAMENTO_ENDPOINTS\.panoramaDetail\(id\)\)/);
});

runTest("parcelamento service exposes installment write endpoints", () => {
  const service = readWorkspaceFile("src/modules/parcelamento/services/parcelamentoService.ts");

  assert.match(service, /async createInstallment/);
  assert.match(service, /api\.post\(\s*PARCELAMENTO_ENDPOINTS\.installments/);
  assert.match(service, /buildCreateInstallmentPayload\(payload\)/);
  assert.match(service, /async updateInstallment/);
  assert.match(service, /api\.patch\(\s*PARCELAMENTO_ENDPOINTS\.installmentDetail\(id\)/);
  assert.match(service, /buildPatchInstallmentPayload\(payload\)/);
});

runTest("parcelamento service exposes competency write endpoints", () => {
  const service = readWorkspaceFile("src/modules/parcelamento/services/parcelamentoService.ts");

  assert.match(service, /async listInstallmentCompetencies/);
  assert.match(service, /api\.get\(PARCELAMENTO_ENDPOINTS\.installmentCompetencies\(installmentId\)/);
  assert.match(service, /async createInstallmentCompetency/);
  assert.match(service, /buildCreateInstallmentCompetencyPayload\(payload\)/);
  assert.match(service, /async updateInstallmentCompetency/);
  assert.match(service, /buildPatchInstallmentCompetencyPayload\(payload\)/);
});

runTest("parcelamento service exposes panorama write endpoints", () => {
  const service = readWorkspaceFile("src/modules/parcelamento/services/parcelamentoService.ts");

  assert.match(service, /async createPanorama/);
  assert.match(service, /api\.post\(\s*PARCELAMENTO_ENDPOINTS\.panoramas/);
  assert.match(service, /buildCreatePanoramaPayload\(payload\)/);
  assert.match(service, /async updatePanorama/);
  assert.match(service, /api\.patch\(\s*PARCELAMENTO_ENDPOINTS\.panoramaDetail\(id\)/);
  assert.match(service, /buildPatchPanoramaPayload\(payload\)/);
  assert.match(service, /async generatePanoramas/);
  assert.match(service, /PARCELAMENTO_ENDPOINTS\.panoramaGenerate\(competence\)/);
});

runTest("parcelamento hooks use domain query keys and useFetch", () => {
  for (const file of [
    "useParcelamentoCompetencies.ts",
    "useParcelamentoInstallments.ts",
    "useParcelamentoPanoramas.ts",
  ]) {
    const source = readWorkspaceFile(`src/modules/parcelamento/hooks/${file}`);

    assert.match(source, /useFetch/);
    assert.match(source, /parcelamentoQueryKey/);
    assert.doesNotMatch(source, /placeholderData/);
  }
});

runTest("parcelamento installment hooks expose mutations", () => {
  const hooks = readWorkspaceFile("src/modules/parcelamento/hooks/useParcelamentoInstallments.ts");

  assert.match(hooks, /useMutation/);
  assert.match(hooks, /useQueryClient/);
  assert.match(hooks, /useCreateParcelamentoInstallmentMutation/);
  assert.match(hooks, /parcelamentoService\.createInstallment/);
  assert.match(hooks, /useUpdateParcelamentoInstallmentMutation/);
  assert.match(hooks, /parcelamentoService\.updateInstallment/);
  assert.match(hooks, /invalidateQueries\(\{\s*queryKey: parcelamentoQueryKey\("installments"\)/);
});

runTest("parcelamento panorama hooks expose mutations", () => {
  const hooks = readWorkspaceFile("src/modules/parcelamento/hooks/useParcelamentoPanoramas.ts");

  assert.match(hooks, /useMutation/);
  assert.match(hooks, /useQueryClient/);
  assert.match(hooks, /useCreateParcelamentoPanoramaMutation/);
  assert.match(hooks, /parcelamentoService\.createPanorama/);
  assert.match(hooks, /useUpdateParcelamentoPanoramaMutation/);
  assert.match(hooks, /parcelamentoService\.updatePanorama/);
  assert.match(hooks, /useGenerateParcelamentoPanoramasMutation/);
  assert.match(hooks, /parcelamentoService\.generatePanoramas/);
  assert.match(hooks, /invalidateQueries\(\{\s*queryKey: parcelamentoQueryKey\("panoramas"\)/);
});

runTest("parcelamento shell wires access, client selector and dashboard", () => {
  const shell = readWorkspaceFile("src/modules/parcelamento/components/ParcelamentoShell.tsx");
  const clientSelector = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoClientSelector.tsx",
  );
  const dashboard = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoDashboard.tsx",
  );

  assert.match(shell, /useModuleAccess\("parcelamento"\)/);
  assert.match(shell, /ParcelamentoClientSelector/);
  assert.match(shell, /ParcelamentoDashboard/);
  assert.match(shell, /role="tablist"/);
  assert.match(shell, /role="tab"/);
  assert.match(shell, /access\.canView && activeTab === "dashboard"/);
  assert.match(clientSelector, /useClients\(/);
  assert.match(clientSelector, /Dialog/);
  assert.match(clientSelector, /contentClassName="w-\[min\(92vw,520px\)\]"/);
  assert.match(clientSelector, /bodyClassName="max-h-\[72vh\] overflow-y-auto space-y-4"/);
  assert.match(clientSelector, /handleSelect\(null\)/);
  assert.match(dashboard, /installmentsPage\?\.summary/);
  assert.doesNotMatch(dashboard, /const\s+(cards|metrics|installments|panoramas)\s*=\s*\[/);
});

runTest("parcelamento shell mounts real installments section", () => {
  const shell = readWorkspaceFile("src/modules/parcelamento/components/ParcelamentoShell.tsx");
  const section = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoInstallmentsSection.tsx",
  );
  const form = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoInstallmentForm.tsx",
  );

  assert.match(shell, /ParcelamentoInstallmentsSection/);
  assert.match(shell, /ParcelamentoCompetenciesSection/);
  assert.match(shell, /selectedClient=\{selectedClient\}/);
  assert.match(shell, /onSelectClientId=\{selectClientById\}/);
  assert.match(shell, /canEdit=\{access\.canEdit\}/);
  assert.match(section, /useParcelamentoInstallments/);
  assert.match(section, /useCreateParcelamentoInstallmentMutation/);
  assert.match(section, /useUpdateParcelamentoInstallmentMutation/);
  assert.match(form, /Altere ao menos um campo para salvar\./);
  assert.doesNotMatch(section, /api\.(get|post|patch|put|delete)\(/);
  assert.doesNotMatch(form, /api\.(get|post|patch|put|delete)\(/);
});

runTest("parcelamento installments use shared pagination controls", () => {
  const section = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoInstallmentsSection.tsx",
  );

  assert.match(section, /import \{ Dialog, PaginationControls \} from "@shared\/components";/);
  assert.match(section, /<PaginationControls/);
  assert.match(section, /page=\{page\}/);
  assert.match(section, /limit=\{pageSize\}/);
  assert.match(section, /total=\{total\}/);
  assert.match(section, /count=\{installments\.length\}/);
  assert.match(section, /hasMore=\{hasNextPage\}/);
  assert.match(section, /isFetching=\{installmentsQuery\.isFetching\}/);
  assert.match(section, /totalPages=\{totalPages\}/);
  assert.match(section, /onPrevious=\{\(\) => setSafePage\(page - 1\)\}/);
  assert.match(section, /onNext=\{\(\) => setSafePage\(page \+ 1\)\}/);
  assert.match(section, /onFirst=\{\(\) => setPage\(FIRST_PAGE\)\}/);
  assert.match(section, /onLast=\{\(\) => setPage\(totalPages\)\}/);
  assert.match(section, /onPageChange=\{setSafePage\}/);
  assert.doesNotMatch(section, /paginationButtonClassName/);
  assert.doesNotMatch(section, /function handlePageChange/);
  assert.doesNotMatch(section, /aria-label="Página atual"/);
  assert.doesNotMatch(section, /aria-label="Última página"/);
});

runTest("parcelamento competencies use shared editable pagination controls", () => {
  const section = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoCompetenciesSection.tsx",
  );

  assert.match(section, /import \{ Dialog, PaginationControls \} from "@shared\/components";/);
  assert.match(section, /<PaginationControls/);
  assert.match(section, /page=\{page\}/);
  assert.match(section, /limit=\{PAGE_SIZE\}/);
  assert.match(section, /total=\{total\}/);
  assert.match(section, /count=\{competencies\.length\}/);
  assert.match(section, /hasMore=\{hasNextPage\}/);
  assert.match(section, /isFetching=\{competenciesQuery\.isFetching\}/);
  assert.match(section, /totalPages=\{totalPages\}/);
  assert.match(section, /onPrevious=\{\(\) => setSafePage\(page - 1\)\}/);
  assert.match(section, /onNext=\{\(\) => setSafePage\(page \+ 1\)\}/);
  assert.match(section, /onFirst=\{\(\) => setPage\(FIRST_PAGE\)\}/);
  assert.match(section, /onLast=\{\(\) => setPage\(totalPages\)\}/);
  assert.match(section, /onPageChange=\{setSafePage\}/);
  assert.doesNotMatch(section, /paginationButtonClassName/);
  assert.doesNotMatch(section, /aria-label="Primeira página"/);
  assert.doesNotMatch(section, /aria-label="Última página"/);
});

runTest("parcelamento panoramas use shared editable pagination controls", () => {
  const section = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoPanoramasSection.tsx",
  );

  assert.match(section, /import \{ Dialog, PaginationControls \} from "@shared\/components";/);
  assert.match(section, /<PaginationControls/);
  assert.match(section, /page=\{page\}/);
  assert.match(section, /page_size: PAGE_SIZE/);
  assert.match(section, /limit=\{PAGE_SIZE\}/);
  assert.match(section, /total=\{total\}/);
  assert.match(section, /count=\{panoramas\.length\}/);
  assert.match(section, /hasMore=\{hasNextPage\}/);
  assert.match(section, /isFetching=\{panoramasQuery\.isFetching\}/);
  assert.match(section, /totalPages=\{totalPages\}/);
  assert.match(section, /onPrevious=\{\(\) => setSafePage\(page - 1\)\}/);
  assert.match(section, /onNext=\{\(\) => setSafePage\(page \+ 1\)\}/);
  assert.match(section, /onFirst=\{\(\) => setPage\(FIRST_PAGE\)\}/);
  assert.match(section, /onLast=\{\(\) => setPage\(totalPages\)\}/);
  assert.match(section, /onPageChange=\{setSafePage\}/);
  assert.doesNotMatch(section, /paginationButtonClassName/);
  assert.doesNotMatch(section, /aria-label="Primeira página"/);
  assert.doesNotMatch(section, /aria-label="Última página"/);
});

runTest("parcelamento installments supports general list and client selection on edit", () => {
  const shell = readWorkspaceFile("src/modules/parcelamento/components/ParcelamentoShell.tsx");
  const section = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoInstallmentsSection.tsx",
  );

  assert.match(shell, /clientService\s*\.\s*getById\(clientId\)/);
  assert.match(section, /onSelectClientId: \(clientId: string\) => void/);
  assert.match(
    section,
    /useParcelamentoInstallments\(\s*listFilters,\s*\{\s*enabled: true,\s*\}\s*\)/,
  );
  assert.match(section, /disabled=\{installmentsQuery\.isFetching\}/);
  assert.match(section, /onSelectClientId\(installment\.client_id\)/);
  assert.doesNotMatch(section, /!selectedClient \? \(\s*<ParcelamentoStateBox/);
});

runTest("parcelamento competencies keep general selection independent of client filter", () => {
  const section = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoCompetenciesSection.tsx",
  );

  assert.doesNotMatch(section, /onSelectClientId: \(clientId: string\) => void/);
  assert.doesNotMatch(section, /onSelectClientId\(installment\.client_id\)/);
});

runTest("parcelamento installments filters and form use compact controls", () => {
  const section = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoInstallmentsSection.tsx",
  );
  const form = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoInstallmentForm.tsx",
  );
  const nativeSelect = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoNativeSelect.tsx",
  );

  assert.match(section, /<SelectFilter\s+label="Status"/);
  assert.match(section, /<SelectFilter\s+label="Tipo"/);
  assert.match(section, /<SelectFilter\s+label="Jurisdição"/);
  assert.match(section, /<ParcelamentoNativeSelect/);
  assert.match(section, /<Dialog[\s\S]*open=\{formMode !== null\}/);
  assert.match(section, /title=\{formMode === "edit" \? "Editar parcelamento" : "Novo parcelamento"\}/);
  assert.match(section, /isClientRequiredDialogOpen/);
  assert.match(section, /function handleCreateButtonClick/);
  assert.match(section, /setIsClientRequiredDialogOpen\(true\)/);
  assert.match(section, /aria-disabled=\{!selectedClient \|\| isSubmitting\}/);
  assert.match(section, /title="Selecione um cliente"/);
  assert.match(section, /Selecione um cliente antes de criar um parcelamento\./);
  assert.match(section, /disabled=\{isSubmitting\}/);
  assert.doesNotMatch(section, /\n\s+disabled=\{!selectedClient \|\| isSubmitting\}/);
  assert.match(section, /className="mt-3 flex flex-wrap justify-between gap-2"/);
  assert.match(section, /sm:w-72/);
  assert.match(section, /className=\{`\$\{parcelamentoTextFieldClassName\} !h-8 !py-1 !pl-8 shadow-none`\}/);
  assert.match(section, /sm:w-40/);
  assert.match(section, /selectClassName="!h-8 !py-1 !pl-2 !pr-8 shadow-none"/);
  assert.match(section, /className="flex w-24 flex-col gap-1 text-sm text-gray-700 dark:text-gray-300"/);
  assert.match(section, /wrapperClassName="w-full"/);
  assert.match(section, /rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700/);
  assert.match(
    section,
    /className="grid gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700 sm:grid-cols-\[minmax\(0,1fr\)_auto\] sm:items-end"/,
  );
  assert.match(
    section,
    /<dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-\[minmax\(6rem,1fr\)_minmax\(4rem,0\.7fr\)_minmax\(5rem,0\.8fr\)_minmax\(7rem,1fr\)_minmax\(5rem,0\.75fr\)_minmax\(5rem,0\.75fr\)\]">/,
  );
  assert.match(section, /<DataPoint label="Adesão" value=\{formatDate\(installment\.enrollment_date\)\} \/>/);
  assert.match(section, /<DataPoint label="Adesão"[\s\S]*>Status<\/dt>[\s\S]*<\/dl>/);
  assert.match(section, /<div className="text-center">\s*<dt/);
  assert.match(section, /<dd className="mt-0\.5 flex justify-center">/);
  assert.match(section, /className="flex justify-start sm:min-w-24 sm:justify-end"/);
  assert.match(section, /className="inline-flex h-8 items-center justify-center gap-1\.5 rounded-lg border/);
  assert.match(form, /export const INSTALLMENT_STATUS_OPTIONS/);
  assert.match(form, /<ParcelamentoNativeSelect/);
  assert.match(form, /<form onSubmit=\{handleSubmit\} noValidate className="space-y-4"/);
  assert.doesNotMatch(form, /border-blue-100 bg-blue-50/);
  assert.match(nativeSelect, /ChevronDown/);
  assert.match(nativeSelect, /appearance-none pr-9/);
});

runTest("parcelamento dashboard follows the module dashboard layout pattern", () => {
  const dashboard = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoDashboard.tsx",
  );

  assert.match(dashboard, /DashboardHeroCard/);
  assert.match(dashboard, /MetricTile/);
  assert.match(dashboard, /DashboardSectionCard/);
  assert.match(dashboard, /DashboardSummaryRow/);
  assert.doesNotMatch(dashboard, /DashboardKpi/);
});

runTest("parcelamento competencies match installments modal and density patterns", () => {
  const section = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoCompetenciesSection.tsx",
  );
  const form = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoCompetencyForm.tsx",
  );
  const nativeSelect = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoNativeSelect.tsx",
  );

  assert.match(section, /Dialog/);
  assert.match(section, /contentClassName="w-\[min\(94vw,960px\)\]"/);
  assert.match(section, /bodyClassName="py-3"/);
  assert.doesNotMatch(section, /bodyClassName="max-h-\[72vh\] overflow-y-auto"/);
  assert.match(section, /sm:grid-cols-\[minmax\(0,1fr\)_auto\] sm:items-stretch/);
  assert.match(section, /function handleCreateButtonClick/);
  assert.match(section, /isInstallmentRequiredDialogOpen/);
  assert.match(section, /setIsInstallmentRequiredDialogOpen\(true\)/);
  assert.match(section, /handleInstallmentChange\(installment\)/);
  assert.match(section, /Nenhum parcelamento dispon/);
  assert.match(section, /aria-disabled=\{isSubmitting\}/);
  assert.match(section, /disabled=\{isSubmitting\}/);
  assert.doesNotMatch(section, /disabled=\{!selectedInstallmentId\}/);
  assert.doesNotMatch(section, /!selectedInstallmentId \? "cursor-not-allowed opacity-60" : ""/);
  assert.match(section, /Selecione um parcelamento antes de criar uma competência\./);
  assert.match(section, /mt-3 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between/);
  assert.match(section, /sm:w-80 lg:w-96/);
  assert.match(section, /role="listbox"/);
  assert.match(section, /max-h-56[^"]*overflow-y-auto/);
  assert.match(section, /aria-haspopup="listbox"/);
  assert.doesNotMatch(section, /ParcelamentoNativeSelect/);
  assert.doesNotMatch(section, /<select/);
  assert.doesNotMatch(section, /lg:w-\[min\(100%,42rem\)\]/);
  assert.doesNotMatch(section, /min-w-44/);
  assert.doesNotMatch(section, />\s*Cliente\s*</);
  assert.match(section, /<dt className="text-sm text-gray-500 dark:text-gray-400">/);
  assert.match(section, /<dd className="text-base font-semibold text-gray-900 dark:text-white">/);
  assert.match(section, /<h4 className="text-base font-semibold text-gray-900 dark:text-white">/);
  assert.match(
    section,
    /<div className="flex flex-col items-start gap-2 sm:min-w-32 sm:items-end sm:justify-between">[\s\S]*Valor \{formatCurrency\(competency\.installment_amount\)\}[\s\S]*\{canEdit \? \(/,
  );
  assert.match(
    section,
    /className=\{`\$\{parcelamentoSecondaryButtonClassName\} min-h-10 min-w-28`\}/,
  );
  assert.doesNotMatch(
    section,
    /<p className="mt-0\.5 text-sm text-gray-500 dark:text-gray-400">\s*Valor/,
  );
  assert.match(section, /sm:grid-cols-\[repeat\(5,minmax\(5rem,7rem\)\)\] sm:justify-start/);
  assert.match(section, /const competencyNote = competency\.notes \|\| competency\.download_notes/);
  assert.doesNotMatch(section, /competency\.notes \|\| competency\.download_notes \|\| competency\.submission_type/);
  assert.doesNotMatch(section, /competency\.notes \?\?[\s\S]*competency\.submission_type/);
  assert.doesNotMatch(form, /<select/);
  assert.match(form, /ParcelamentoNativeSelect/);
  assert.match(form, /<form onSubmit=\{handleSubmit\} className="space-y-3">/);
  assert.match(form, /<div className="grid gap-3 md:grid-cols-3">/);
  assert.match(form, /rows=\{2\}/);
  assert.doesNotMatch(form, /className="space-y-4"/);
  assert.match(
    form,
    /<Field label="Tipo de envio">[\s\S]*<Field label="Observação do download">[\s\S]*<label className=\{`\$\{parcelamentoCheckboxCardClassName\} self-end w-fit`\}>[\s\S]*Arquivo baixado[\s\S]*<\/div>\s*<Field label="Notas">/,
  );
  assert.doesNotMatch(
    form,
    /<\/div>\s*<label className=\{`\$\{parcelamentoCheckboxCardClassName\} w-fit`\}>[\s\S]*Arquivo baixado/,
  );
  assert.match(nativeSelect, /ChevronDown/);
  assert.match(nativeSelect, /appearance-none/);
});

runTest("parcelamento panoramas mount final flow with generation and edit", () => {
  const shell = readWorkspaceFile("src/modules/parcelamento/components/ParcelamentoShell.tsx");
  const section = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoPanoramasSection.tsx",
  );
  const form = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoPanoramaForm.tsx",
  );

  assert.match(shell, /ParcelamentoPanoramasSection/);
  assert.doesNotMatch(shell, /ParcelamentoReadPanel/);
  assert.match(section, /useParcelamentoPanoramas/);
  assert.match(section, /useCreateParcelamentoPanoramaMutation/);
  assert.match(section, /useUpdateParcelamentoPanoramaMutation/);
  assert.match(section, /useGenerateParcelamentoPanoramasMutation/);
  assert.match(section, /Gerar panoramas/);
  assert.match(section, /created/);
  assert.match(section, /existing/);
  assert.match(section, /totalActiveClients/);
  assert.match(section, /aria-label="Competência"/);
  assert.match(form, /type="month"/);
  assert.match(form, /cnd_municipal/);
  assert.match(form, /responsavel_id/);
  assert.doesNotMatch(section, /api\.(get|post|patch|put|delete)\(/);
  assert.doesNotMatch(form, /api\.(get|post|patch|put|delete)\(/);
});

runTest("parcelamento panorama form keeps responsible select without create helper text", () => {
  const section = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoPanoramasSection.tsx",
  );
  const form = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoPanoramaForm.tsx",
  );
  const hook = readWorkspaceFile(
    "src/modules/parcelamento/hooks/useParcelamentoResponsibleUsers.ts",
  );
  const hooksIndex = readWorkspaceFile("src/modules/parcelamento/hooks/index.ts");

  // Catálogo enxuto do RH em vez de paginar a tabela inteira de usuários (#1349).
  assert.match(hook, /useAssignableUsers\(\{\s*module: "parcelamento"/);
  assert.doesNotMatch(hook, /listAdminUsers/);
  assert.match(hooksIndex, /useParcelamentoResponsibleUsers/);
  assert.match(section, /useParcelamentoResponsibleUsers/);
  assert.match(section, /useParcelamentoResponsibleUsers\(\{\s*enabled: canEdit && Boolean\(selectedClient\),\s*\}\)/);
  assert.match(section, /responsibleUsers=\{responsibleUsersQuery\.data \?\? \[\]\}/);
  assert.match(form, /responsibleUsers/);
  assert.match(form, /<ParcelamentoNativeSelect/);
  assert.match(form, /<option value="">Sem responsável<\/option>/);
  assert.match(form, /Responsável atual/);
  assert.doesNotMatch(form, /Responsável ID/);
  assert.doesNotMatch(form, /O panorama será criado para o cliente selecionado\./);
  assert.doesNotMatch(form, /type="text"[\s\S]{0,240}formState\.responsavel_id/);
});

runTest("parcelamento date defaults avoid timezone drift", () => {
  const installmentsSection = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoInstallmentsSection.tsx",
  );
  const competencyForm = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoCompetencyForm.tsx",
  );
  const panoramaForm = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoPanoramaForm.tsx",
  );
  const panoramasSection = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoPanoramasSection.tsx",
  );
  const monthUtils = readWorkspaceFile("src/modules/parcelamento/utils/parcelamentoMonth.ts");

  assert.doesNotMatch(installmentsSection, /new Date\(value\)/);
  assert.match(installmentsSection, /value\.slice\(0, 10\)/);
  assert.match(installmentsSection, /\$\{day\}\/\$\{month\}\/\$\{year\}/);
  assert.match(monthUtils, /getFullYear\(\)/);
  assert.match(monthUtils, /getMonth\(\) \+ 1/);
  assert.doesNotMatch(competencyForm, /toISOString\(\)\.slice\(0, 7\)/);
  assert.doesNotMatch(panoramaForm, /toISOString\(\)\.slice\(0, 7\)/);
  assert.doesNotMatch(panoramasSection, /toISOString\(\)\.slice\(0, 7\)/);
  assert.match(competencyForm, /getCurrentParcelamentoMonth\(\)/);
  assert.match(panoramaForm, /getCurrentParcelamentoMonth\(\)/);
  assert.match(panoramasSection, /getCurrentParcelamentoMonth\(\)/);
});

runTest("parcelamento dashboard KPIs come from the backend summary, not the page (#1348)", () => {
  const dashboard = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoDashboard.tsx",
  );

  assert.match(dashboard, /installmentsPage\?\.summary/);
  assert.match(dashboard, /summary\?\.active/);
  assert.match(dashboard, /summary\?\.overdue/);
  assert.match(dashboard, /summary\?\.progress_percent/);
  assert.doesNotMatch(dashboard, /na página|nesta página/);
  assert.doesNotMatch(dashboard, /getAverageProgress|installmentItems\.filter/);
});

runTest("parcelamento installment cards show the client name and document (#1348)", () => {
  const section = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoInstallmentsSection.tsx",
  );

  assert.match(section, /installment\.client\?\.name/);
  assert.match(section, /formatCPF_CNPJ\(installment\.client\.cpf_cnpj\)/);
});

runTest("parcelamento installment form marks required fields and uses filter selects (#1349)", () => {
  const form = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoInstallmentForm.tsx",
  );
  const section = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoInstallmentsSection.tsx",
  );

  assert.match(form, /<form[^>]*noValidate/);
  assert.match(form, /aria-hidden="true">\*/);
  assert.match(form, /label="Valor total do parcelamento"/);
  assert.match(form, /label="Valor da 1ª parcela"/);
  assert.match(form, /label="Valor da parcela atual"/);
  assert.doesNotMatch(form, /label="Primeira parcela"|label="Parcela atual"/);
  assert.match(form, /consolidated_total_amount/);
  for (const source of [form, section]) {
    assert.match(source, /INSTALLMENT_TYPE_OPTIONS/);
    assert.match(source, /INSTALLMENT_JURISDICTION_OPTIONS/);
  }
  assert.doesNotMatch(section, /const INSTALLMENT_TYPE_OPTIONS =/);
});

runTest("parcelamento client selector focuses search and lists every active client (#1349)", () => {
  const selector = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoClientSelector.tsx",
  );

  assert.match(selector, /legacyIntegrationStatusFilter: false/);
  assert.match(selector, /autoFocus/);
  assert.match(selector, /Só clientes ativos aparecem aqui\./);
});

runTest("parcelamento installment mutations refetch the list once (#1349)", () => {
  const hooks = readWorkspaceFile("src/modules/parcelamento/hooks/useParcelamentoInstallments.ts");

  assert.equal((hooks.match(/invalidateQueries/g) ?? []).length, 2);
});

runTest("parcelamento review fixes: named missing fields, no raw ids, dashboard-only queries (#1349)", () => {
  const form = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoInstallmentForm.tsx",
  );
  const panoramas = readWorkspaceFile(
    "src/modules/parcelamento/components/ParcelamentoPanoramasSection.tsx",
  );
  const shell = readWorkspaceFile("src/modules/parcelamento/components/ParcelamentoShell.tsx");

  assert.equal((form.match(/getMissingRequiredFields\(formState\)/g) ?? []).length, 2);
  assert.match(form, /Preencha os campos obrigatórios: \$\{missingFields\.join/);
  assert.doesNotMatch(panoramas, /responsibleUserNames\.get\(value\) \?\? value/);
  assert.match(shell, /activeTab === "dashboard"/);
  assert.match(shell, /useParcelamentoInstallments\(filters, \{ enabled: isDashboardActive \}\)/);
});

console.log("parcelamento frontend tests passed");
