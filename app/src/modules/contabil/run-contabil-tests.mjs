import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildContabilPortfolioParams,
  buildContabilControlParams,
  buildTriageItemPayload,
  CONTABIL_ENDPOINTS,
  executeNullableContabilRequest,
  isNotFoundError,
  unwrapContabilEnvelope,
} from "./services/contabilService.contract.ts";
import {
  contabilControlHistoryQueryKey,
  contabilRelationshipHistoryQueryKey,
  contabilControlQueryKey,
  contabilRelationshipQueryKey,
  contabilResponsibleQueryKey,
  CONTABIL_QUERY_KEY,
} from "./hooks/queryKeys.ts";
import { getContabilErrorMessage } from "./services/contabilError.ts";
import {
  describeTriageHistoryEntry,
  formatTriageHistoryField,
  formatTriageHistoryValue,
} from "./components/triageDocumentHistory.helpers.ts";
import {
  fiscalTriagePortfolioCsv,
  fiscalTriagePortfolioExportTable,
} from "./components/fiscalTriagePortfolioExport.ts";
import { resolveContabilPermissionAccess } from "./hooks/contabilPermissionAccess.ts";
import {
  resolveDepartmentModuleKey,
  resolveModuleAccess,
} from "../auth/utils/moduleAccess.ts";
import {
  CONTABIL_CONTROL_CHECKLIST_FIELDS,
  CONTABIL_CONTROL_FIELDS,
  CONTABIL_CONTROL_NOTES_FIELD,
  getContabilControlFieldLabel,
} from "./components/contabilControlFields.ts";
import {
  CONTABIL_RELATIONSHIP_FIELDS,
  getContabilRelationshipFieldLabel,
} from "./components/contabilRelationshipFields.ts";
import {
  formatContabilControlHistoryValue,
  getContabilHistoryPageCount,
} from "./components/contabilHistory.helpers.ts";
import {
  applyLocalContabilFieldValue,
  createContabilFieldStatusMap,
  filterContabilPortfolioRows,
  getContabilCompletionPercent,
  getCurrentContabilCompetence,
  rollbackContabilFieldValue,
  shouldSyncRemoteContabilControl,
  updateContabilControlFieldStatus,
  formatContabilCount,
  getContabilCompetenceYears,
  CONTABIL_MONTH_OPTIONS,
} from "./components/contabilControlSection.helpers.ts";
import {
  buildContabilRelationshipFormValues,
  buildContabilRelationshipPayload,
  buildContabilResponsibleFormValues,
  formatContabilBidding,
  formatContabilChartAccounts,
  formatContabilRelationshipHistoryValue,
  getContabilChartAccountsOptions,
  pickChangedContabilRelationshipFields,
  getContabilSelectLabel,
  isContabilTextValueFilled,
  mapAssignableUsersToContabilOptions,
} from "./components/contabilPartySection.helpers.ts";
import {
  getContabilCardState,
  shouldShowContabilNav,
} from "./hooks/contabilAccessUi.ts";

import {
  agendaDateToIso,
  agendaDay,
  AGENDA_ENDPOINT,
} from "../../shared/services/agendaService.contract.ts";

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function readWorkspaceSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const contabilServiceSources = {
  permissions: readWorkspaceSource(
    "../../../../services/contabil-service/src/constants/permissions.ts",
  ),
  authMiddleware: readWorkspaceSource(
    "../../../../services/contabil-service/src/middlewares/isAuthenticated.ts",
  ),
  controlRoute: readWorkspaceSource(
    "../../../../services/contabil-service/src/routes/control.routes.ts",
  ),
  responsibleRoute: readWorkspaceSource(
    "../../../../services/contabil-service/src/routes/responsible.routes.ts",
  ),
  relationshipRoute: readWorkspaceSource(
    "../../../../services/contabil-service/src/routes/relationship.routes.ts",
  ),
  controlRouteTest: readWorkspaceSource(
    "../../../../services/contabil-service/src/test/control.routes.test.ts",
  ),
  responsibleRouteTest: readWorkspaceSource(
    "../../../../services/contabil-service/src/test/responsible.routes.test.ts",
  ),
  relationshipRouteTest: readWorkspaceSource(
    "../../../../services/contabil-service/src/test/relationship.routes.test.ts",
  ),
  gatewayServiceRegistry: readWorkspaceSource(
    "../../../../services/gateway/src/config/serviceRegistry.ts",
  ),
};

await (async () => {
  await runTest("carteira operacional usa o contrato mensal de leitura", () => {
    assert.equal(CONTABIL_ENDPOINTS.controlsList, "/contabil/controls/list");
    assert.deepEqual(buildContabilPortfolioParams("2026-09"), { competence: "2026-09" });
  });

  await runTest("carteira operacional mostra competência, resumo, ausência e recuperação", () => {
    const source = readWorkspaceSource("./components/ContabilPortfolioSection.tsx");

    assert.match(source, /<ContabilCompetenceSelect/);
    assert.doesNotMatch(source, /type="month"/);
    assert.match(source, /Carteira operacional/);
    assert.match(source, /sem controle mensal/i);
    assert.match(source, /Tentar novamente/);
    assert.match(source, /—/);
  });

  await runTest("dashboard contábil filtra por busca sem acento e por coluna", () => {
    const rows = [
      { id: 1, searchText: "ART TOLDO INDÚSTRIA 49.791.761/0003-80", values: { regime: "Lucro Real", depreciation: "done" } },
      { id: 2, searchText: "FARMANUTRI LTDA 20630454000153", values: { regime: "Lucro Real", depreciation: "pending" } },
      { id: 3, searchText: "AXISVIA LOGISTICA", values: { regime: "Simples Nacional", depreciation: "done" } },
    ];

    assert.deepEqual(filterContabilPortfolioRows(rows, " industria ", {}).map((row) => row.id), [1]);
    assert.deepEqual(filterContabilPortfolioRows(rows, "2063045", {}).map((row) => row.id), [2]);
    assert.deepEqual(
      filterContabilPortfolioRows(rows, "", { regime: "Lucro Real", depreciation: "done" }).map((row) => row.id),
      [1],
    );
    assert.equal(filterContabilPortfolioRows(rows, "", { regime: "" }).length, 3);
  });

  await runTest("checklist mensal expõe porcentagem de conclusão e grafia Regerar", () => {
    assert.equal(getContabilCompletionPercent(0, 17), 0);
    assert.equal(getContabilCompletionPercent(5, 17), 29);
    assert.equal(getContabilCompletionPercent(17, 17), 100);
    assert.equal(getContabilCompletionPercent(0, 0), 0);
    assert.equal(CONTABIL_CONTROL_FIELDS[0].label, "Regerar lançamentos contábeis");
    assert.match(readWorkspaceSource("./components/ContabilControlSection.tsx"), /% concluído/);
  });

  await runTest("carteira associa o fechamento e o controle às colunas corretas", () => {
    const source = readWorkspaceSource("./components/ContabilPortfolioSection.tsx");
    const closingStatus = source.indexOf('NOT_RECEIVED: "Não recebido"');
    const monthlyControl = source.indexOf('"Iniciado"');

    assert.ok(closingStatus >= 0);
    assert.ok(monthlyControl >= 0);
    assert.ok(
      closingStatus < monthlyControl,
      "o status do fechamento deve ser renderizado antes do estado do controle mensal",
    );
  });

  await runTest("carteira contábil exige seleção de empresas e checklist antes do dashboard", () => {
    const page = readFileSync(new URL("../../pages/contabil.tsx", import.meta.url), "utf8");
    const portfolio = readWorkspaceSource("./components/ContabilPortfolioSection.tsx");

    assert.doesNotMatch(page, /ClientPickerModal/);
    assert.match(page, /<ContabilShell canEdit=\{canEditContabil\} \/>/);
    assert.match(portfolio, /step === "companies"/);
    assert.match(portfolio, /step === "checklist"/);
    assert.match(portfolio, /step === "dashboard"/);
    assert.match(portfolio, /disabled=\{selectedClientIds\.length === 0\}/);
    assert.match(portfolio, /disabled=\{selectedFields\.length === 0\}/);
  });

  await runTest("contabil endpoints use the expected contract", () => {
    assert.equal(CONTABIL_ENDPOINTS.controls, "/contabil/controls");
    assert.equal(CONTABIL_ENDPOINTS.controlById("10"), "/contabil/controls/10");
    assert.equal(
      CONTABIL_ENDPOINTS.responsibleByClient("20"),
      "/contabil/responsibles/client/20",
    );
    assert.equal(
      CONTABIL_ENDPOINTS.relationshipByClient("30"),
      "/contabil/relationships/client/30",
    );
    assert.equal(CONTABIL_ENDPOINTS.triageMonthly, "/triagem/monthly");
    assert.equal(CONTABIL_ENDPOINTS.triageEditability, "/triagem/editability");
    assert.equal(CONTABIL_ENDPOINTS.triageStatements, "/triagem/statements");
    assert.equal(CONTABIL_ENDPOINTS.triageClosing, "/triagem/closing");
  });

  await runTest("triagem só mostra mutações após verificar a atribuição do cliente", () => {
    const pageSource = readFileSync(new URL("../../pages/triagem.tsx", import.meta.url), "utf8");

    assert.match(pageSource, /useTriageEditability/);
    assert.match(pageSource, /canEdit=\{editability\.data\?\.can_edit === true\}/);
    assert.match(pageSource, /canEditClosing=\{contabilAccess\.canEdit\}/);
    assert.doesNotMatch(pageSource, /canEdit\s*\/>/);
  });

  await runTest("ficha Contábil mostra a mesma nuvem do cliente que a Triagem (#1728)", () => {
    const relationship = readWorkspaceSource("./components/ContabilRelationshipSection.tsx");
    const triage = readWorkspaceSource("../triagem/components/TriageCompetenceSection.tsx");
    const usage = /<TriageClientCloudsSection clientId=\{clientId\} canEdit=\{canEdit\} \/>/;

    assert.match(relationship, /from "@modules\/triagem\/components\/TriageClientCloudsSection"/);
    assert.match(relationship, usage);
    assert.match(triage, usage);
  });

  await runTest("triagem apresenta competências com criação, listagem e arquivamento", () => {
    const pageSource = readFileSync(new URL("../../pages/triagem.tsx", import.meta.url), "utf8");
    const source = readWorkspaceSource("../triagem/components/TriageCompetenceSection.tsx");

    assert.match(pageSource, /TriageCompetenceSection/);
    assert.match(source, /type="month"/);
    assert.match(source, /Criar competência/);
    assert.match(source, /Arquivar/);
    assert.match(source, /Nenhuma competência para este cliente/);
    assert.match(source, /role="alert"/);
    assert.doesNotMatch(source, /window\.confirm/);
    assert.match(source, /<ConfirmationDialog/);
  });

  await runTest("triagem apresenta links externos por competência", () => {
    const source = readWorkspaceSource("../triagem/components/TriageExternalLinksSection.tsx");
    const competenceSource = readWorkspaceSource("../triagem/components/TriageCompetenceSection.tsx");

    assert.match(competenceSource, /TriageExternalLinksSection/);
    assert.match(source, /https:\/\//);
    assert.match(source, /useTriageCatalogs/);
    assert.match(source, /LINK_TYPE/);
    assert.doesNotMatch(source, /<option value="DRIVE">/);
    assert.doesNotMatch(source, /<option value="CLOUD">/);
    assert.match(source, /responsible_id/);
    assert.match(source, /Arquivar/);
    assert.doesNotMatch(source, /window\.confirm/);
    assert.match(source, /<ConfirmationDialog/);
  });

  await runTest("triagem apresenta solicitações urgentes por competência", () => {
    const source = readWorkspaceSource("../triagem/components/TriageUrgentRequestsSection.tsx");
    const competenceSource = readWorkspaceSource("../triagem/components/TriageCompetenceSection.tsx");

    assert.match(competenceSource, /TriageUrgentRequestsSection/);
    assert.match(source, /Solicitações urgentes/);
    assert.match(source, /urgency_code/);
    assert.match(source, /responsible_id/);
    assert.match(source, /resolution_note/);
    assert.match(source, /Reabrir/);
    assert.match(source, /Fechar/);
  });

  await runTest("triagem apresenta dez documentos com nota, justificativa e banco sem dados de conta", () => {
    const source = readWorkspaceSource("./components/TriageDocumentsSection.tsx");
    const labels = readWorkspaceSource("./components/triageDocumentLabels.ts");

    const contabilDocuments = labels.slice(
      labels.indexOf("const CONTABIL_DOCUMENTS"),
      labels.indexOf("const FISCAL_DOCUMENTS"),
    );
    assert.equal((contabilDocuments.match(/\["[a-z0-9_]+", "/g) ?? []).length, 10);
    assert.match(labels, /triaged_transactions/);
    assert.match(source, /Nota/);
    assert.match(source, /Justificativa/);
    assert.match(source, /Salvar observações de \$\{label\}/);
    assert.match(source, /não entram no\s+indicador/i);
    assert.match(source, /Marcar todos os itens abertos/);
    assert.match(source, /Identificador do banco/);
    assert.match(source, /dados de\s+conta não são solicitados/i);
    assert.match(source, /useTriageStatements/);
    assert.match(source, /Status do banco/);
    assert.match(source, /Arquivar marcador do banco/);
    assert.doesNotMatch(source, /window\.confirm/);
    assert.match(source, /<ConfirmationDialog/);
    assert.match(source, /Nenhum marcador registrado/);
    assert.match(source, /Carregando marcadores/);
    assert.match(source, /useTriageClosing/);
    assert.match(source, /Fechamento recebido/);
    assert.match(source, /NOT_RECEIVED/);
  });

  await runTest("triagem contábil configura movimento padrão e atribui o movimento do mês (#1691)", () => {
    const source = readWorkspaceSource("./components/TriageDocumentsSection.tsx");
    const panel = readWorkspaceSource("./components/TriageMovementPanel.tsx");
    const labels = readWorkspaceSource("./components/triageDocumentLabels.ts");

    assert.equal(CONTABIL_ENDPOINTS.triageConfig, "/triagem/config");
    assert.equal(CONTABIL_ENDPOINTS.triageMonthlyById("m1"), "/triagem/monthly/m1");
    assert.match(labels, /\["NOT_PRESENT", "Não possui"\]/);
    assert.match(source, /<TriageMovementPanel/);
    assert.match(source, /Desativado no movimento padrão/);
    assert.match(source, /canEdit && !isDisabled\(field\)/);
    for (const text of [
      "Movimento padrão do cliente",
      "Movimento enviado",
      "Responsável",
      "Justificativa",
      "Data de download",
      "Data de baixa",
      "Observação",
    ])
      assert.ok(panel.includes(text), text);
    assert.match(panel, /saveMovementConfig/);
    assert.match(panel, /updateMonthly/);
  });

  await runTest("triagem fiscal configura documentos especiais e faturamento do shared (#1693)", () => {
    const labels = readWorkspaceSource("./components/triageDocumentLabels.ts");
    const section = readWorkspaceSource("./components/TriageDocumentsSection.tsx");
    assert.match(labels, /from "@workspace\/shared\/triagem\/documents"/);
    assert.match(labels, /TRIAGE_FISCAL_CONFIGURABLE_FIELDS\.map/);
    assert.match(section, /<FiscalSpecialDocumentsPanel/);
    assert.match(section, /Faturamento não se aplica a este cliente/);
    assert.equal(CONTABIL_ENDPOINTS.triageConfig, "/triagem/config");
  });

  await runTest("triagem fiscal apresenta os 14 campos e controla revisão e entrega", () => {
    const source = readWorkspaceSource("./components/TriageDocumentsSection.tsx");
    const pageSource = readWorkspaceSource("../../pages/triagem.tsx");
    const labels = readWorkspaceSource("./components/triageDocumentLabels.ts");
    const fiscalDocuments = labels.slice(
      labels.indexOf("const FISCAL_DOCUMENTS"),
      labels.indexOf("const STATUSES"),
    );

    assert.equal((fiscalDocuments.match(/\["[a-z0-9_]+", "/g) ?? []).length, 13);
    assert.match(source, /billing_amount/);
    assert.match(pageSource, /documentType="FISCAL"/);
    assert.match(source, /UNDER_REVIEW/);
    assert.match(source, /Método de entrega/);
    assert.match(source, /DELIVERY_METHOD/);
    assert.match(source, /Site estadual/);
    assert.match(source, /STATE_SITE/);
    assert.doesNotMatch(source, /<option value="EMAIL">/);
    assert.doesNotMatch(source, /<option value="PORTAL">/);
    assert.doesNotMatch(source, /<option value="WHATSAPP">/);
    assert.doesNotMatch(source, /<textarea\s+aria-label=\{`\$\{label\} Justificativa`\}/);
    assert.match(source, /Obrigatório/);
    assert.match(source, /prioridade/);
    assert.match(source, /const mutationError/);
    assert.match(source, /role="alert"/);
  });

  await runTest("triagem bancária integra o smoke de navegador à suíte do app", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
    assert.match(packageJson.scripts.test, /test:triagem-bank-statements-browser/);
  });

  await runTest("triagem de links externos integra o smoke de navegador à suíte do app", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
    assert.match(packageJson.scripts.test, /test:triagem-external-links-browser/);
  });

  await runTest("triagem de solicitações urgentes integra o smoke de navegador à suíte do app", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
    assert.match(packageJson.scripts.test, /test:triagem-urgent-requests-browser/);
  });

  await runTest("contabil-service blocks viewer writes and allows editor writes", () => {
    assert.match(contabilServiceSources.permissions, /const CONTABIL_WRITE_PERMISSION = 2;/);
    assert.match(contabilServiceSources.authMiddleware, /import \{ CONTABIL_WRITE_PERMISSION \} from "\.\.\/constants\/permissions\.js"/);
    assert.match(contabilServiceSources.authMiddleware, /requireContabilWritePermission/);

    assert.equal(
      contabilServiceSources.controlRoute.match(/requireContabilWritePermission/g)?.length,
      7,
    );
    assert.equal(
      contabilServiceSources.responsibleRoute.match(/requireContabilWritePermission/g)?.length,
      4,
    );
    assert.equal(
      contabilServiceSources.relationshipRoute.match(/requireContabilWritePermission/g)?.length,
      4,
    );

    for (const source of [
      contabilServiceSources.controlRouteTest,
      contabilServiceSources.responsibleRouteTest,
      contabilServiceSources.relationshipRouteTest,
    ]) {
      assert.match(source, /function gatewayHeaders\(permission = 2\)/);
      assert.match(source, /gatewayHeaders\(1\)/);
    }

    assert.match(
      contabilServiceSources.gatewayServiceRegistry,
      /key:\s*"contabil-service",[\s\S]*internalServiceToken:\s*env\.auditServiceToken,[\s\S]*permissionModule:\s*"contabil"/,
    );
  });

  await runTest("buildContabilControlParams maps clientId and competence to API params", () => {
    assert.deepEqual(
      buildContabilControlParams({
        clientId: "client-1",
        competence: "2026-05",
      }),
      {
        client_id: "client-1",
        competence: "2026-05",
      },
    );
  });

  await runTest("control section reads existing control via GET for viewer and editor", () => {
    const componentSource = readFileSync(
      new URL("./components/ContabilControlSection.tsx", import.meta.url),
      "utf8",
    );
    const hookSource = readFileSync(
      new URL("./hooks/useContabilControl.ts", import.meta.url),
      "utf8",
    );

    assert.match(hookSource, /useContabilControlDetail/);
    assert.match(componentSource, /useContabilControlDetail\(\{ clientId, competence \}\)/);
    assert.match(componentSource, /const remoteControl = detailQuery\.data;/);
    assert.match(hookSource, /contabilControlService\.getControl/);
  });

  await runTest("unwrapContabilEnvelope extracts data directly from the backend response", () => {
    const payload = {
      id: "control-1",
      client_id: "client-1",
      competence: "2026-05",
      notes: null,
    };

    assert.deepEqual(unwrapContabilEnvelope({ data: payload }), payload);
    assert.deepEqual(unwrapContabilEnvelope(payload), payload);
  });

  await runTest("control field registry matches the backend-updatable fields", () => {
    assert.equal(CONTABIL_CONTROL_FIELDS.length, 18);
    assert.equal(CONTABIL_CONTROL_CHECKLIST_FIELDS.length, 17);
    assert.equal(CONTABIL_CONTROL_NOTES_FIELD?.field, "notes");
    assert.deepEqual(
      CONTABIL_CONTROL_CHECKLIST_FIELDS.map((field) => field.field),
      [
        "regenerate_accounting_entries",
        "check_summary_by_accumulator",
        "post_accounting_transaction",
        "import_bank_statements",
        "reconcile_bank_statements",
        "reconcile_vendors",
        "integrate_taxes",
        "settle_federal_taxes_via_ecac",
        "settle_state_taxes_via_sefaz_ba",
        "integrate_payroll",
        "suspense_accounts",
        "check_overdrawn_accounts",
        "general_account_reconciliation",
        "check_loan_and_interest_accounts",
        "monthly_closing",
        "reconcile_icms_pis_cofins",
        "depreciation",
      ],
    );
  });

  await runTest("getCurrentContabilCompetence formats the current month as YYYY-MM", () => {
    assert.equal(getCurrentContabilCompetence(new Date("2026-05-20T12:00:00.000Z")), "2026-05");
    assert.equal(getCurrentContabilCompetence(new Date(2026, 10, 1, 12, 0, 0)), "2026-11");
  });

  await runTest("field status helpers start idle and update individual fields", () => {
    const initialStatusMap = createContabilFieldStatusMap(CONTABIL_CONTROL_FIELDS);

    assert.equal(initialStatusMap.notes, "idle");
    assert.equal(initialStatusMap.regenerate_accounting_entries, "idle");

    const updatedStatusMap = updateContabilControlFieldStatus(
      initialStatusMap,
      "regenerate_accounting_entries",
      "saving",
    );

    assert.equal(updatedStatusMap.regenerate_accounting_entries, "saving");
    assert.equal(updatedStatusMap.notes, "idle");
  });

  await runTest("control field helpers apply local updates and rollback checklist values", () => {
    const baseControl = {
      id: "control-1",
      client_id: "client-1",
      competence: "2026-05",
      regenerate_accounting_entries: false,
      check_summary_by_accumulator: false,
      post_accounting_transaction: false,
      import_bank_statements: false,
      reconcile_bank_statements: false,
      reconcile_vendors: false,
      integrate_taxes: false,
      settle_federal_taxes_via_ecac: false,
      settle_state_taxes_via_sefaz_ba: false,
      integrate_payroll: false,
      suspense_accounts: false,
      check_overdrawn_accounts: false,
      general_account_reconciliation: false,
      check_loan_and_interest_accounts: false,
      monthly_closing: false,
      reconcile_icms_pis_cofins: false,
      depreciation: false,
      notes: "",
    };

    const locallyUpdated = applyLocalContabilFieldValue(
      baseControl,
      "regenerate_accounting_entries",
      true,
    );
    assert.equal(locallyUpdated.regenerate_accounting_entries, true);

    const notesUpdated = applyLocalContabilFieldValue(baseControl, "notes", "Fechamento iniciado");
    assert.equal(notesUpdated.notes, "Fechamento iniciado");

    const rolledBack = rollbackContabilFieldValue(
      locallyUpdated,
      baseControl,
      "regenerate_accounting_entries",
    );
    assert.equal(rolledBack.regenerate_accounting_entries, false);
  });

  await runTest("executeNullableContabilRequest returns null on 404 responses", async () => {
    const result = await executeNullableContabilRequest(() =>
      Promise.reject({
        isAxiosError: true,
        response: {
          status: 404,
        },
      }),
    );

    assert.equal(result, null);
  });

  await runTest("executeNullableContabilRequest rethrows non-404 errors", async () => {
    const failure = {
      isAxiosError: true,
      response: {
        status: 500,
      },
    };

    await assert.rejects(() => executeNullableContabilRequest(() => Promise.reject(failure)));
  });

  await runTest("isNotFoundError only recognizes axios 404 responses", () => {
    assert.equal(
      isNotFoundError({
        isAxiosError: true,
        response: {
          status: 404,
        },
      }),
      true,
    );
    assert.equal(
      isNotFoundError({
        isAxiosError: true,
        response: {
          status: 400,
        },
      }),
      false,
    );
    assert.equal(isNotFoundError(new Error("boom")), false);
  });

  await runTest("contabil query keys vary by client and competence", () => {
    assert.deepEqual(CONTABIL_QUERY_KEY, ["contabil"]);
    assert.deepEqual(contabilControlQueryKey("client-1", "2026-05"), [
      "contabil",
      "control",
      "client-1",
      "2026-05",
    ]);
    assert.deepEqual(contabilResponsibleQueryKey("client-1"), [
      "contabil",
      "responsible",
      "client-1",
    ]);
    assert.deepEqual(contabilRelationshipQueryKey("client-1"), [
      "contabil",
      "relationship",
      "client-1",
    ]);
  });

  await runTest("relationship history labels fields and legacy states (#1723)", () => {
    assert.equal(getContabilRelationshipFieldLabel("bidding"), "Participa de licitação");
    assert.equal(getContabilRelationshipFieldLabel("chart_accounts"), "Plano de contas");
    assert.equal(formatContabilRelationshipHistoryValue("bidding", null), "Não selecionado");
    assert.equal(formatContabilRelationshipHistoryValue("bidding", true), "Sim");
    assert.equal(formatContabilRelationshipHistoryValue("chart_accounts", "Sim — Jonrick"), "Sim — Jonrick");
    assert.equal(
      formatContabilRelationshipHistoryValue("chart_accounts", "Plano próprio"),
      "Plano próprio (texto legado)",
    );
    assert.equal(formatContabilRelationshipHistoryValue("chart_accounts", null), "Não selecionado");
    assert.equal(formatContabilRelationshipHistoryValue("tool", ""), "(vazio)");
    assert.deepEqual(contabilRelationshipHistoryQueryKey("client-1", 1), [
      "contabil",
      "relationship-history",
      "client-1",
      1,
    ]);
  });

  await runTest("control history labels fields and values and paginates (#1722)", () => {
    assert.equal(getContabilControlFieldLabel("depreciation"), "Depreciação");
    assert.equal(getContabilControlFieldLabel("desconhecido"), "desconhecido");
    assert.equal(formatContabilControlHistoryValue("depreciation", true), "Concluído");
    assert.equal(formatContabilControlHistoryValue("depreciation", false), "Pendente");
    assert.equal(formatContabilControlHistoryValue("depreciation", null), "—");
    assert.equal(formatContabilControlHistoryValue("notes", ""), "(vazio)");
    assert.equal(formatContabilControlHistoryValue("notes", "Conferir"), "Conferir");
    assert.equal(getContabilHistoryPageCount(0, 20), 1);
    assert.equal(getContabilHistoryPageCount(41, 20), 3);
    assert.deepEqual(contabilControlHistoryQueryKey("client-1", "2026-09", 2), [
      "contabil",
      "control-history",
      "client-1",
      "2026-09",
      2,
    ]);
  });

  await runTest("relationship field registry keeps bidding beside system in the UI order", () => {
    assert.deepEqual(
      CONTABIL_RELATIONSHIP_FIELDS.map((field) => field.field),
      ["chart_accounts", "tool", "system", "bidding", "note"],
    );
    assert.equal(CONTABIL_RELATIONSHIP_FIELDS[3]?.kind, "state");
    assert.equal(CONTABIL_RELATIONSHIP_FIELDS[3]?.requiredOnCreate, false);
    assert.equal(CONTABIL_RELATIONSHIP_FIELDS[0]?.requiredOnCreate, false);
  });

  await runTest("relationship states render every legacy option, including no answer (#1721)", () => {
    assert.equal(formatContabilBidding(null), "Não selecionado");
    assert.equal(formatContabilBidding(true), "Sim");
    assert.equal(formatContabilBidding(false), "Não");
    assert.equal(formatContabilChartAccounts(null), "Não selecionado");
    assert.equal(formatContabilChartAccounts(""), "Não selecionado");
    assert.equal(formatContabilChartAccounts("Não — Jonrick"), "Não — Jonrick");
    assert.equal(formatContabilChartAccounts("Plano próprio"), "Plano próprio (texto legado)");
    assert.deepEqual(getContabilChartAccountsOptions(null), [
      { value: "", label: "Não selecionado" },
      { value: "Sim", label: "Sim" },
      { value: "Não", label: "Não" },
      { value: "Sim — Jonrick", label: "Sim — Jonrick" },
      { value: "Não — Jonrick", label: "Não — Jonrick" },
    ]);
    assert.deepEqual(getContabilChartAccountsOptions("Plano próprio").at(-1), {
      value: "Plano próprio",
      label: "Plano próprio (texto legado)",
    });
  });

  await runTest("responsible and relationship form helpers normalize nullable backend values", () => {
    assert.deepEqual(buildContabilResponsibleFormValues(null), {
      person_responsible_id: "",
      posted_by_id: "",
      customer_with_movement: false,
    });

    assert.deepEqual(buildContabilRelationshipFormValues(null), {
      bidding: "",
      chart_accounts: "",
      tool: "",
      system: "",
      note: "",
    });
    const legacy = buildContabilRelationshipFormValues({
      id: "rel-1",
      client_id: "client-1",
      bidding: false,
      chart_accounts: "Plano próprio",
      tool: "ERP",
      system: "Sistema",
      note: "",
    });
    assert.equal(legacy.bidding, "false");
    assert.deepEqual(buildContabilRelationshipPayload(legacy), {
      bidding: false,
      chart_accounts: "Plano próprio",
      tool: "ERP",
      system: "Sistema",
      note: "",
    });
    const emptyLegacy = {
      id: "rel-1",
      client_id: "client-1",
      bidding: null,
      chart_accounts: "",
      tool: "ERP",
      system: "Sistema",
      note: "",
    };
    assert.deepEqual(
      pickChangedContabilRelationshipFields(
        {
          ...buildContabilRelationshipPayload(buildContabilRelationshipFormValues(emptyLegacy)),
          note: "nova",
        },
        emptyLegacy,
      ),
      { note: "nova" },
    );
    assert.deepEqual(buildContabilRelationshipPayload(buildContabilRelationshipFormValues(null)), {
      bidding: null,
      chart_accounts: null,
      tool: "",
      system: "",
      note: "",
    });
  });

  await runTest("assignable user helper limits selector options to accounting users", () => {
    const options = mapAssignableUsersToContabilOptions([
      {
        id: "user-1",
        name: "Ana",
        status: "active",
        departmentName: "Contábil",
        photoUrl: null,
      },
      {
        id: "user-2",
        name: "Bruno",
        status: "active",
        departmentName: "RH",
        photoUrl: null,
      },
      {
        id: "user-3",
        name: "Carla",
        status: "active",
        departmentName: "Contabil Fiscal",
        photoUrl: null,
      },
      {
        id: "user-4",
        name: "Diego",
        status: "active",
        departmentName: null,
        photoUrl: null,
      },
    ]);

    assert.deepEqual(options, [
      {
        value: "user-1",
        label: "Ana - Contábil",
      },
      { value: "user-3", label: "Carla - Contabil Fiscal" },
    ]);
    assert.equal(getContabilSelectLabel("user-1", options), "Ana - Contábil");
    assert.equal(getContabilSelectLabel(null, options), "Não informado");
    assert.equal(getContabilSelectLabel("missing-user", options), "Usuário não encontrado");
    assert.deepEqual(
      mapAssignableUsersToContabilOptions([
        {
          id: "user-2",
          name: "Bruno",
          status: "active",
          departmentName: "RH",
          photoUrl: null,
        },
      ], ["user-2"]),
      [{ value: "user-2", label: "Bruno - RH" }],
    );
  });

  await runTest("responsible display loads user labels without exposing IDs", () => {
    const source = readFileSync(
      new URL("./components/ContabilResponsibleSection.tsx", import.meta.url),
      "utf8",
    );

    assert.match(source, /enabled:\s*Boolean\([\s\S]*responsible\?\./);
    assert.doesNotMatch(source, /return options\.find\(\(option\) => option\.value === value\)\?\.label \?\? value/);
  });

  await runTest("client accounting page shows unavailable service before opening the shell", () => {
    const source = readFileSync(
      new URL("../../pages/clients/[id]/contabil.tsx", import.meta.url),
      "utf8",
    );
    const unavailableIndex = source.indexOf("client.contabil === false");
    const shellIndex = source.indexOf("<ContabilShell");

    assert.ok(unavailableIndex >= 0);
    assert.ok(shellIndex >= 0);
    assert.ok(unavailableIndex < shellIndex);
  });

  await runTest("text helper distinguishes filled and blank values", () => {
    assert.equal(isContabilTextValueFilled(" ERP X "), true);
    assert.equal(isContabilTextValueFilled("   "), false);
  });

  await runTest("resolveModuleAccess blocks normal users without department or additional access", () => {
    assert.deepEqual(resolveModuleAccess({ module: "contabil", userPermission: 1 }), {
      level: "none",
      canView: false,
      canEdit: false,
      isAdmin: false,
      source: "none",
    });
  });

  await runTest("resolveModuleAccess ignores the current department without a module grant", () => {
    assert.deepEqual(
      resolveModuleAccess({
        module: "contabil",
        userPermission: 0,
        departmentModule: "contabil",
      }),
      {
        level: "none",
        canView: false,
        canEdit: false,
        isAdmin: false,
        source: "none",
      },
    );
  });

  await runTest("resolveModuleAccess ignores legacy user permission levels", () => {
    assert.deepEqual(
      resolveModuleAccess({
        module: "contabil",
        userPermission: 1,
        departmentModule: "contabil",
      }),
      {
        level: "none",
        canView: false,
        canEdit: false,
        isAdmin: false,
        source: "none",
      },
    );
  });

  await runTest("resolveModuleAccess uses persisted module permissions", () => {
    assert.deepEqual(
      resolveModuleAccess({
        module: "contabil",
        userPermission: 1,
        departmentModule: "rh",
        additionalModulePermissions: { contabil: 1 },
      }),
      {
        level: "view",
        canView: true,
        canEdit: false,
        isAdmin: false,
        source: "additional-module",
      },
    );
  });

  await runTest("resolveModuleAccess does not restore department access when module permission is absent", () => {
    assert.deepEqual(
      resolveModuleAccess({
        module: "contabil",
        userPermission: 1,
        departmentModule: "contabil",
        additionalModulePermissions: { contabil: null },
      }),
      {
        level: "none",
        canView: false,
        canEdit: false,
        isAdmin: false,
        source: "none",
      },
    );
  });

  await runTest("resolveModuleAccess unlocks global admins only when owner scope is explicit", () => {
    assert.deepEqual(resolveModuleAccess({ module: "contabil", isGlobalAdmin: true }), {
      level: "admin",
      canView: true,
      canEdit: true,
      isAdmin: true,
      source: "admin",
    });
  });

  await runTest("resolveDepartmentModuleKey maps known department names to shared module keys", () => {
    assert.equal(resolveDepartmentModuleKey("Contábil"), "contabil");
    assert.equal(resolveDepartmentModuleKey("Recursos Humanos"), "rh");
    assert.equal(resolveDepartmentModuleKey("Tecnologia"), "ti");
    assert.equal(resolveDepartmentModuleKey("Juridico"), null);
  });

  await runTest("resolveContabilPermissionAccess adapts shared module access to accounting flags", () => {
    assert.deepEqual(
      resolveContabilPermissionAccess({
        canView: false,
        canEdit: false,
      }),
      {
        canViewContabil: false,
        canEditContabil: false,
        isReadOnlyContabil: false,
      },
    );

    assert.deepEqual(
      resolveContabilPermissionAccess({
        canView: true,
        canEdit: false,
      }),
      {
        canViewContabil: true,
        canEditContabil: false,
        isReadOnlyContabil: true,
      },
    );

    assert.deepEqual(
      resolveContabilPermissionAccess({
        canView: true,
        canEdit: true,
      }),
      {
        canViewContabil: true,
        canEditContabil: true,
        isReadOnlyContabil: false,
      },
    );
  });

  await runTest("shouldShowContabilNav mirrors view permission", () => {
    assert.equal(shouldShowContabilNav(true), true);
    assert.equal(shouldShowContabilNav(false), false);
  });

  await runTest("getContabilCardState hides, disables and enables the client card correctly", () => {
    assert.equal(getContabilCardState(true, false), "hidden");
    assert.equal(getContabilCardState(false, true), "disabled");
    assert.equal(getContabilCardState(true, true), "enabled");
    assert.equal(getContabilCardState(undefined, true), "enabled");
  });

  await runTest("getContabilErrorMessage prefers backend error strings and falls back otherwise", () => {
    assert.equal(
      getContabilErrorMessage({
        isAxiosError: true,
        response: {
          data: {
            error: "Mensagem do backend",
          },
        },
      }),
      "Mensagem do backend",
    );

    assert.equal(
      getContabilErrorMessage({
        isAxiosError: true,
        response: {
          data: {
            message: "Já está cadastrado para esta organização.",
          },
        },
      }),
      "Já está cadastrado para esta organização.",
    );

    assert.equal(
      getContabilErrorMessage(new Error("boom")),
      "boom",
    );
  });
  await runTest("controle contábil carregado por GET só sobrescreve o editor ao trocar de registro (#1324)", () => {
    const control = { id: "control-1" };
    assert.equal(shouldSyncRemoteContabilControl(false, "control-1", control), true);
    assert.equal(shouldSyncRemoteContabilControl(true, null, control), true);
    assert.equal(shouldSyncRemoteContabilControl(true, "control-1", null), true);
    assert.equal(shouldSyncRemoteContabilControl(true, "control-1", control), false);
    assert.equal(shouldSyncRemoteContabilControl(true, null, null), false);
  });

  await runTest("abrir a aba Contábil não cria controle: POST só no botão Iniciar controle (#1324)", () => {
    const source = readWorkspaceSource("./components/ContabilControlSection.tsx");
    const effects = source.split("useEffect(").slice(1).map((chunk) => chunk.split("}, [")[0]);
    assert.ok(effects.every((effect) => !effect.includes("bootstrapControl(")));
    assert.match(source, /Iniciar controle/);
  });
  await runTest("criar ano e arquivar competência confirmam em diálogo (#1368)", () => {
    const source = readWorkspaceSource("./components/ContabilControlSection.tsx");
    assert.equal((source.match(/<ConfirmationDialog/g) ?? []).length, 2);
    assert.match(source, /variant="neutral"/);
    assert.doesNotMatch(source, /Confirmar criação do ano|Confirmar arquivamento/);
  });
  await runTest("pluraliza a contagem da carteira (#1325)", () => {
    assert.equal(formatContabilCount(1, "cliente", "clientes"), "1 cliente");
    assert.equal(formatContabilCount(0, "cliente", "clientes"), "0 clientes");
    assert.equal(formatContabilCount(2, "controle iniciado", "controles iniciados"), "2 controles iniciados");
  });

  await runTest("seletor de competência lista meses em português (#1325)", () => {
    assert.equal(CONTABIL_MONTH_OPTIONS.length, 12);
    assert.deepEqual(CONTABIL_MONTH_OPTIONS[0], { value: "01", label: "Janeiro" });
    assert.deepEqual(CONTABIL_MONTH_OPTIONS[8], { value: "09", label: "Setembro" });
    const years = getContabilCompetenceYears("2019-03", new Date(2026, 8, 1));
    assert.equal(years[0], 2019);
    assert.equal(years.at(-1), 2027);
  });


  await runTest("payload do item da Triagem omite chaves fiscais na rotina contábil", () => {
    const notes = {
      note: "Aguardando extrato",
      justification: null,
      delivery_method: null,
      state_site: null,
    };
    assert.deepEqual(
      buildTriageItemPayload("financial_transactions", "PENDING", notes, "CONTABIL"),
      {
        field: "financial_transactions",
        status: "PENDING",
        note: "Aguardando extrato",
        justification: null,
      },
    );
    assert.deepEqual(
      buildTriageItemPayload("nfe_entrada", "PENDING", { ...notes, state_site: "SP" }, "FISCAL"),
      {
        field: "nfe_entrada",
        status: "PENDING",
        type: "FISCAL",
        note: "Aguardando extrato",
        justification: null,
        delivery_method: null,
        state_site: "SP",
      },
    );
    assert.deepEqual(
      buildTriageItemPayload("billing_amount", undefined, undefined, "FISCAL", "10,00"),
      { field: "billing_amount", type: "FISCAL", value: "10,00" },
    );
  });

  await runTest("carteira fiscal: CSV e impressão levam as linhas filtradas e o total delas (#1705)", () => {
    const row = (overrides) => ({
      client_id: "c1",
      legal_name: "Alfa Ltda",
      cpf_cnpj: "11222333000181",
      regime: "Simples Nacional",
      responsible_id: "u1",
      responsible_name: "Ana Souza",
      priority: true,
      delivery_method: "EMAIL",
      can_edit: true,
      has_competence: true,
      planned_checklist: null,
      monthly: {
        id: "m1",
        checklist: { inbound_report: "COMPLETED", sped_fiscal: "NOT_PRESENT" },
        item_notes: {},
        billing_amount: "12500,00",
        justification: "SEM_MOVIMENTO",
        notes: "Aguardando XML de setembro",
      },
      ...overrides,
    });
    const deliveryLabel = {
      delivery: (code) => (code === "EMAIL" ? "E-mail" : "Não informado"),
      justification: (code) => (code === "SEM_MOVIMENTO" ? "Sem movimento no mês" : ""),
    };
    const rows = [
      row({}),
      // Rotina ainda não iniciada: sem faturamento, justificativa nem observação.
      row({
        client_id: "c2",
        legal_name: '=Beta "SA"',
        priority: false,
        delivery_method: null,
        monthly: null,
      }),
    ];

    const table = fiscalTriagePortfolioExportTable(rows, deliveryLabel);
    assert.deepEqual(table.columns.slice(0, 7), [
      "Empresa",
      "CNPJ",
      "Regime",
      "Responsável",
      "Prioridade",
      "Meio de envio",
      "Relatório de entradas",
    ]);
    // Colunas do CSV/PDF do legado que a carteira não exportava.
    assert.deepEqual(table.columns.slice(-3), ["Faturamento", "Justificativa", "Observação"]);
    assert.deepEqual(table.body[0].slice(-3), [
      "12500,00",
      "Sem movimento no mês",
      "Aguardando XML de setembro",
    ]);
    assert.deepEqual(table.body[1].slice(-3), ["", "", ""]);
    assert.ok(table.body.every((line) => line.length === table.columns.length));
    assert.deepEqual(table.body[0].slice(0, 7), [
      "Alfa Ltda",
      "11222333000181",
      "Simples Nacional",
      "Ana Souza",
      "Sim",
      "E-mail",
      "Concluído",
    ]);
    assert.equal(table.body[0][table.columns.indexOf("SPED Fiscal")], "Não possui");
    assert.equal(table.total, "2 empresas");

    const lines = fiscalTriagePortfolioCsv(rows, deliveryLabel).split("\r\n");
    assert.equal(lines.length, 4);
    // Fórmula neutralizada e aspas escapadas.
    assert.ok(lines[2].startsWith(`"'=Beta ""SA"""`));
    assert.equal(lines[3], '"Total","2 empresas"');
    // Seleção vazia segue com cabeçalho e total zerado.
    assert.equal(
      fiscalTriagePortfolioCsv([], deliveryLabel).split("\r\n").at(-1),
      '"Total","0 empresas"',
    );
    assert.equal(fiscalTriagePortfolioExportTable([rows[0]], deliveryLabel).total, "1 empresa");
  });

  await runTest("histórico documental: campo, valor e objeto legíveis (#1706)", () => {
    assert.equal(formatTriageHistoryField("checklist.sped_fiscal"), "SPED Fiscal");
    assert.equal(
      formatTriageHistoryField("item_notes.bank_reconciliation.justification"),
      "Conciliação bancária · justificativa",
    );
    assert.equal(formatTriageHistoryField("triad_moviment"), "Movimento enviado");
    assert.equal(formatTriageHistoryField("campo_novo"), "campo_novo");

    assert.equal(formatTriageHistoryValue("checklist.sped_fiscal", "NOT_PRESENT"), "Não possui");
    assert.equal(formatTriageHistoryValue("status", "COMPLETED"), "Concluído");
    assert.equal(formatTriageHistoryValue("triad_moviment", true), "Sim");
    assert.equal(formatTriageHistoryValue("notes", null), "(vazio)");
    assert.equal(formatTriageHistoryValue("link", "https://drive.test/a"), "https://drive.test/a");
    // Itens configurados chegam como JSON da auditoria e saem pelos rótulos.
    assert.equal(
      formatTriageHistoryValue(
        "active_items",
        '["sped_fiscal",{"field":"nfce_documents","required":true},{"field":"billing_amount","required":false}]',
      ),
      "SPED Fiscal, Documentos NFCe",
    );
    assert.equal(formatTriageHistoryValue("active_items", "[]"), "(vazio)");
    assert.equal(formatTriageHistoryValue("active_items", "texto solto"), "texto solto");
    assert.equal(formatTriageHistoryField("monthly"), "Rotinas");
    // Datas em ISO saem no formato brasileiro; o arquivamento, na hora de Brasília.
    assert.match(
      formatTriageHistoryValue("archived_at", "2026-09-12T15:00:00.000Z"),
      /^12\/09\/2026,? 12:00$/,
    );
    assert.equal(formatTriageHistoryValue("download_date", "2026-09-30T00:00:00.000Z"), "30/09/2026");
    assert.equal(formatTriageHistoryValue("download_date", "sem data"), "sem data");

    const entry = (object, action = "Atualizar pendência documental") => ({
      id: "e1",
      at: "2026-09-11T10:00:00.000Z",
      actor: null,
      action,
      changes: [],
      object: { client_id: "c1", client_name: "Alfa Ltda", ...object },
    });
    assert.equal(
      describeTriageHistoryEntry(
        entry({ kind: "triagem.monthly", competence: "2026-09", routine_type: "FISCAL" }),
      ),
      "Alfa Ltda · 2026-09 · Rotina Fiscal · Atualizar pendência documental",
    );
    assert.equal(
      describeTriageHistoryEntry(
        entry(
          { kind: "clientes.clouds", competence: null, routine_type: null },
          "Cadastrar nuvem do cliente",
        ),
      ),
      "Alfa Ltda · Cloud do cliente · Cadastrar nuvem do cliente",
    );
    assert.equal(
      describeTriageHistoryEntry(
        entry(
          { kind: "triagem.bank_statements", competence: "2026-09", routine_type: null },
          "Arquivar marcador de extrato bancário",
        ),
      ),
      "Alfa Ltda · 2026-09 · Extrato bancário · Arquivar marcador de extrato bancário",
    );
    assert.equal(
      describeTriageHistoryEntry(
        entry(
          { kind: "triagem.configs", competence: null, routine_type: null },
          "Configurar documentos fiscais especiais",
        ),
      ),
      "Alfa Ltda · Configuração da Triagem · Configurar documentos fiscais especiais",
    );
  });

  await runTest("histórico documental e da competência alcançam todas as páginas (#1706)", () => {
    const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
    const section = read("./components/TriageDocumentHistorySection.tsx");
    assert.match(section, /useTriageDocumentHistory\(\{/);
    assert.match(section, /onPageChange=\{setPage\}/);
    const page = read("../../pages/triagem.tsx");
    // Com cliente, qualquer leitor da Triagem vê; sem cliente, só administrador.
    assert.match(page, /<TriageDocumentHistorySection\s+key=\{client\.id\}/);
    assert.match(
      page,
      /access\.isAdmin \|\| contabilAccess\.isAdmin \? <TriageDocumentHistorySection \/> : null/,
    );
    const timeline = read("../triagem/components/TriageAuditTimeline.tsx");
    assert.match(timeline, /useTriageAudit\(competenceId, open, page\)/);
    assert.match(timeline, /aria-label="Paginação do histórico da competência"/);
    assert.match(read("../triagem/hooks/useTriageAudit.ts"), /listTimeline\(competenceId, page\)/);
    // Resposta sem `items` vira erro visível, sem derrubar a tela que hospeda o painel.
    const panel = read("./components/ContabilHistoryPanel.tsx");
    assert.match(panel, /query\.data !== undefined && !Array\.isArray\(query\.data\?\.items\)/);
    assert.match(panel, /O servidor devolveu uma resposta inesperada\./);
  });

  await runTest("agenda compartilhada: a data não muda de dia com o fuso (#1727)", () => {
    assert.equal(AGENDA_ENDPOINT, "/task/agenda");
    // Meio-dia UTC: o dia escolhido é o mesmo em qualquer fuso do Brasil.
    assert.equal(agendaDateToIso("2026-12-31"), "2026-12-31T12:00:00.000Z");
    assert.equal(agendaDay("2026-12-31T12:00:00.000Z"), "2026-12-31");
  });

  await runTest("agenda compartilhada: a aba do Contábil usa a agenda canônica (#1727)", () => {
    const shell = readFileSync(new URL("./components/ContabilShell.tsx", import.meta.url), "utf8");
    assert.match(shell, /<DepartmentAgendaSection module="contabil" canEdit=\{canEdit\} \/>/);
    const section = readFileSync(
      new URL("./components/DepartmentAgendaSection.tsx", import.meta.url),
      "utf8",
    );
    assert.match(section, /agendaService\.list\(module, month\)/);
  });
})();

// Testes da Triagem rodam junto (sem script próprio no package.json).
await import("../triagem/run-triagem-tests.mjs");
