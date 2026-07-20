import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  PARCELAMENTO_DEFAULT_PAGE,
  PARCELAMENTO_DEFAULT_PAGE_SIZE,
  PARCELAMENTO_ENDPOINTS,
  PARCELAMENTO_MAX_PAGE_SIZE,
  PARCELAMENTO_TABS,
  buildParcelamentoListParams,
  buildParcelamentoPatchPayload,
  unwrapParcelamentoEnvelope,
  unwrapParcelamentoPage,
} from "./services/parcelamentoService.contract.ts";
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

runTest("parcelamento hooks use domain query keys and useFetch", () => {
  for (const file of ["useParcelamentoInstallments.ts", "useParcelamentoPanoramas.ts"]) {
    const source = readWorkspaceFile(`src/modules/parcelamento/hooks/${file}`);

    assert.match(source, /useFetch/);
    assert.match(source, /parcelamentoQueryKey/);
    assert.match(source, /placeholderData/);
  }
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
  assert.match(shell, /enabled: access\.canView/);
  assert.match(clientSelector, /useClients\(/);
  assert.match(clientSelector, /Dialog/);
  assert.match(clientSelector, /handleSelect\(null\)/);
  assert.match(dashboard, /overdue_installments_count/);
  assert.match(dashboard, /paid_installments_count/);
  assert.match(dashboard, /agreed_installments_count/);
  assert.doesNotMatch(dashboard, /const\s+(cards|metrics|installments|panoramas)\s*=\s*\[/);
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

console.log("parcelamento frontend tests passed");
