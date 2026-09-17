import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { getRhQuarterOptions } = await import("./utils/rhScoreUi.ts");
const { formatRhDate } = await import("./utils/rhDate.ts");
const { resolveRhPermissionCapabilities } = await import("./utils/rhPermissions.ts");
const { getRhMessageTypeClassName } = await import("./utils/rhRequestUi.ts");
const { getRhErrorMessage } = await import("./utils/rhErrorMessage.ts");

const rhSources = {
  messageTimeline: readFileSync("src/modules/rh/components/RhRequestMessagesTimeline.tsx", "utf8"),
  requestDetailModal: readFileSync("src/modules/rh/components/RhRequestDetailModal.tsx", "utf8"),
  requestsSection: readFileSync("src/modules/rh/components/RhRequestsSection.tsx", "utf8"),
  requestFormModal: readFileSync("src/modules/rh/components/RhRequestFormModal.tsx", "utf8"),
  pointConfigRoute: readFileSync(
    "../services/rh-service/src/routes/pointConfig.routes.ts",
    "utf8",
  ),
  timeSheetRoute: readFileSync("../services/rh-service/src/routes/timeSheet.routes.ts", "utf8"),
  scoreQuarterRoute: readFileSync(
    "../services/rh-service/src/routes/scoreQuarter.routes.ts",
    "utf8",
  ),
  scoreQuarterService: readFileSync(
    "../services/rh-service/src/services/scoreQuarterService.ts",
    "utf8",
  ),
  timeBankReleaseRoute: readFileSync(
    "../services/rh-service/src/routes/timeBankRelease.routes.ts",
    "utf8",
  ),
  pointAdjustmentRoute: readFileSync(
    "../services/rh-service/src/routes/timeClockRequest.routes.ts",
    "utf8",
  ),
  pointAdjustmentService: readFileSync(
    "src/modules/rh/services/rhPointService.ts",
    "utf8",
  ),
  pointAdjustmentHook: readFileSync("src/modules/rh/hooks/useRhPoint.ts", "utf8"),
  pointAdjustmentPanel: readFileSync(
    "src/modules/rh/components/RhPointAdjustmentPanel.tsx",
    "utf8",
  ),
  dossierSection: readFileSync("src/modules/rh/components/RhDossierSection.tsx", "utf8"),
  dossierService: readFileSync("src/modules/rh/services/rhProfileService.ts", "utf8"),
  dossierHook: readFileSync("src/modules/rh/hooks/useRhProfile.ts", "utf8"),
  dossierRoute: readFileSync("../services/rh-service/src/routes/employeeDossier.routes.ts", "utf8"),
};

function runTest(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

runTest("assignable RH users are loaded from rh-service, not user-service", () => {
  const contractSource = readFileSync("src/modules/rh/services/rhService.contract.ts", "utf8");
  const hookSource = readFileSync("src/modules/rh/hooks/useAssignableUsers.ts", "utf8");

  assert.match(contractSource, /operationalUsers:\s*"\/rh\/operational-users"/);
  assert.match(hookSource, /RH_ENDPOINTS\.operationalUsers/);
  assert.doesNotMatch(hookSource, /@modules\/users/);
  assert.doesNotMatch(hookSource, /listAdminUsers/);
});

runTest("assignable RH users keep context in cache keys and request params", () => {
  const hookSource = readFileSync("src/modules/rh/hooks/useAssignableUsers.ts", "utf8");

  assert.match(hookSource, /options\.module/);
  assert.match(hookSource, /options\.departmentId/);
  assert.match(hookSource, /options\.departmentName/);
  assert.match(hookSource, /params:\s*\{/);
  assert.match(hookSource, /department_id:\s*options\?\.departmentId/);
  assert.match(hookSource, /department_name:\s*options\?\.departmentName/);
});

runTest("RH dossiê mantém contrato, estados e autorização de superfície", () => {
  const contractSource = readFileSync("src/modules/rh/services/rhService.contract.ts", "utf8");
  const shellSource = readFileSync("src/shared/components/newLayout/RH.tsx", "utf8");

  assert.match(contractSource, /dossier:\s*"\/rh\/profile\/colaborator"/);
  assert.match(contractSource, /dossierList:\s*"\/rh\/profile\/colaborator\/list"/);
  assert.match(rhSources.dossierService, /RH_ENDPOINTS\.contact/);
  assert.match(rhSources.dossierHook, /invalidateQueries\(\{ queryKey: RH_PROFILE_QUERY_KEY \}\)/);
  assert.match(rhSources.dossierRoute, /requireRhPermission\(RH_SELF_SERVICE_PERMISSION\)/);
  assert.match(rhSources.dossierSection, /Carregando dossiê/);
  assert.match(rhSources.dossierSection, /Não foi possível carregar/);
  assert.match(rhSources.dossierSection, /Nenhum colaborador/);
  assert.match(shellSource, /activeTab === "dossier"/);
  assert.match(shellSource, /label="Dossiê"/);
  assert.match(shellSource, /<RhDossierSection \/>/);
});

runTest("task assignment selectors use the contextual RH source", () => {
  const taskFormSource = readFileSync(
    "src/modules/integracao/components/TaskFormModal.tsx",
    "utf8",
  );
  const taskModelSource = readFileSync(
    "src/modules/integracao/components/TaskModelModal.tsx",
    "utf8",
  );

  for (const source of [taskFormSource, taskModelSource]) {
    assert.match(source, /useAssignableUsers/);
    assert.doesNotMatch(source, /listAdminUsers/);
    assert.match(source, /departmentId:/);
  }
});

runTest("RH modal fields disclose required inputs before submission", () => {
  const sources = [
    "components/RhRequestFormModal.tsx",
    "components/RhHolidayFormPanel.tsx",
    "components/RhTimeBankFormPanel.tsx",
    "components/RhPointAdjustmentRequestModal.tsx",
    "components/score/RhScoreQuestionEditor.tsx",
  ].map((path) => readFileSync(`src/modules/rh/${path}`, "utf8"));

  for (const source of sources) {
    assert.match(source, /RequiredFieldLabel/);
    assert.match(source, /aria-required/);
  }
});

runTest("RH managers can filter requests by requester without changing non-manager scope", () => {
  const sectionSource = readFileSync("src/modules/rh/components/RhRequestsSection.tsx", "utf8");
  const filtersSource = readFileSync("src/modules/rh/components/RhRequestsFilters.tsx", "utf8");

  assert.match(
    sectionSource,
    /requester_user_id:\s*canManageRhRequests\s*\?\s*requesterFilter\s*\|\|\s*undefined\s*:\s*user\?\.id/,
  );
  assert.match(sectionSource, /requesters=\{canManageRhRequests \? assignableUsers : undefined\}/);
  assert.match(filtersSource, /selectedRequesterId\?: string/);
  assert.match(filtersSource, /<span>Solicitante<\/span>/);
});

runTest("RH requests consume the paginated list contract", () => {
  const contractSource = readFileSync("src/modules/rh/services/rhService.contract.ts", "utf8");
  const serviceSource = readFileSync("src/modules/rh/services/rhRequestsService.ts", "utf8");
  const hookSource = readFileSync("src/modules/rh/hooks/useRhRequests.ts", "utf8");
  const sectionSource = readFileSync("src/modules/rh/components/RhRequestsSection.tsx", "utf8");
  const shellSource = readFileSync("src/shared/components/newLayout/RH.tsx", "utf8");
  const dashboardSource = readFileSync("src/modules/rh/components/RhDashboardSection.tsx", "utf8");

  assert.match(contractSource, /page:\s*filters\.page/);
  assert.match(contractSource, /limit:\s*filters\.limit/);
  assert.match(serviceSource, /Promise<RhRequestListPage>/);
  assert.match(serviceSource, /unwrapRhEnvelope<RhRequestListPage>/);
  assert.match(hookSource, /filters\.page\s*\?\?\s*""/);
  assert.match(hookSource, /filters\.limit\s*\?\?\s*""/);
  assert.match(hookSource, /UseQueryResult<RhRequestListPage, Error>/);
  assert.match(sectionSource, /DEFAULT_PAGE_SIZE/);
  assert.match(sectionSource, /PaginationControls/);
  assert.match(sectionSource, /page,\s*limit:\s*DEFAULT_PAGE_SIZE/);
  assert.match(sectionSource, /requestsPage\.items/);
  assert.match(sectionSource, /total=\{requestsPage\.total\}/);
  assert.match(sectionSource, /page=\{requestsPage\.page\}/);
  assert.match(sectionSource, /limit=\{requestsPage\.pageSize\}/);
  assert.match(sectionSource, /hasMore=\{requestsPage\.hasMore\}/);
  assert.equal((sectionSource.match(/setPage\(1\)/g) ?? []).length, 3);
  assert.match(shellSource, /newRequestsQuery\.data\?\.items\s*\?\?\s*\[\]/);
  assert.match(shellSource, /inProgressRequestsQuery\.data\?\.items\s*\?\?\s*\[\]/);
  assert.match(dashboardSource, /requestsQuery\.data\?\.items\s*\?\?\s*\[\]/);
});

runTest("RH request form preserves validation errors returned by the API", () => {
  const source = rhSources.requestFormModal;

  assert.match(source, /import \{ isAxiosError \} from "axios"/);
  assert.match(source, /isAxiosError\(error\) \? error\.response\?\.data\?\.error : undefined/);
  assert.match(source, /typeof responseMessage === "string"[\s\S]*?\? responseMessage/);
});

runTest("RH viewer self-service flow stays enabled and scoped", () => {
  assert.doesNotMatch(rhSources.requestFormModal, /isSelfServiceCreateBlocked/);
  assert.match(rhSources.requestFormModal, /assigned_to_user_id:\s*formState\.assigned_to_user_id/);
  assert.match(rhSources.requestFormModal, /if \(canManageRequests && formState\.assigned_to_user_id\)/);

  assert.match(
    rhSources.pointConfigRoute,
    /router\.put\([\s\S]*requireRhPermission\(RH_MANAGEMENT_PERMISSION\)/,
  );
  assert.match(
    rhSources.timeSheetRoute,
    /router\.get\([\s\S]*"\/:id"[\s\S]*requireRhPermission\(RH_SELF_SERVICE_PERMISSION\)[\s\S]*result\.user_id !== requesterId/,
  );
  assert.match(
    rhSources.scoreQuarterRoute,
    /router\.get\([\s\S]*"\/:id"[\s\S]*requireRhPermission\(RH_SELF_SERVICE_PERMISSION\)[\s\S]*user_id:\s*userId[\s\S]*can_manage:\s*canManageRh\(req\)/,
  );
  assert.match(
    rhSources.scoreQuarterService,
    /if \(!input\.can_manage && score\.user_id !== userId\)/,
  );
  assert.match(
    rhSources.timeBankReleaseRoute,
    /"\/list"[\s\S]*requireRhPermission\(RH_SELF_SERVICE_PERMISSION\)[\s\S]*user_id:\s*canManageTimeBankReleases\s*\?\s*getSingleTrimmedQueryValue\(req\.query\.user_id\)\s*:\s*user_id[\s\S]*canManageTimeBankReleases \? parsed\.user_id : user_id/,
  );
});

runTest("RH point adjustments expose guarded approve and reject decisions", () => {
  assert.match(
    rhSources.pointAdjustmentRoute,
    /"\/adjustment\/reject"[\s\S]*requireRhPermission\(RH_MANAGEMENT_PERMISSION\)/,
  );
  assert.match(rhSources.pointAdjustmentService, /put\(RH_ENDPOINTS\.rejectPointAdjustment/);
  assert.match(rhSources.pointAdjustmentHook, /useRejectRhPointAdjustmentMutation/);
  assert.match(
    rhSources.pointAdjustmentHook,
    /invalidateQueries\(\{ queryKey: RH_POINT_QUERY_KEY \}\)/,
  );
  assert.match(
    rhSources.pointAdjustmentPanel,
    /canManagePoint[\s\S]*adjustment\.status === "Pendente"[\s\S]*adjustment\.user_id !== currentUserId/,
  );
  assert.match(rhSources.pointAdjustmentPanel, /adjustment\.status === "Rejeitado"/);
  assert.match(rhSources.pointAdjustmentPanel, /obs_approver: rejectionReason\.trim\(\) \|\| null/);
});

runTest("RH point adjustments preserve API conflict messages", () => {
  const conflictMessage =
    "O dia esta bloqueado por uma folha assinada; reabra a folha antes de altera-lo.";

  assert.equal(
    getRhErrorMessage({ response: { data: { error: conflictMessage } } }, "fallback"),
    conflictMessage,
  );
  assert.equal(
    getRhErrorMessage(new Error("Request failed with status code 409"), "fallback"),
    "fallback",
  );
  assert.equal(
    getRhErrorMessage(
      { response: { status: 500, data: { error: "detalhe interno do banco" } } },
      "fallback",
    ),
    "fallback",
  );
  assert.match(
    rhSources.pointAdjustmentPanel,
    /resetDecision\(\);\s*toast\.error\(getRhErrorMessage\(error/,
  );
});

runTest("RH Usuario mantem autosservico e nao recebe gestao", () => {
  const capabilities = resolveRhPermissionCapabilities(2, false);

  assert.equal(capabilities.canAccessRhPortal, true);
  assert.equal(capabilities.canManageRhRequests, false);
  assert.equal(capabilities.canManageRhScore, false);
  assert.equal(capabilities.canManageRhTimeBank, false);
  assert.equal(capabilities.canManageRhTimesheets, false);
  assert.equal(capabilities.canManageRhWorkday, false);
});

runTest("RH Visualizador usa somente mensagem e preserva workflow para Usuario e Administrador", () => {
  const viewerCapabilities = resolveRhPermissionCapabilities(1, false);
  const userCapabilities = resolveRhPermissionCapabilities(2, false);
  const adminCapabilities = resolveRhPermissionCapabilities(3, false);

  assert.equal(viewerCapabilities.canUseRhWorkflowMessages, false);
  assert.equal(userCapabilities.canUseRhWorkflowMessages, true);
  assert.equal(adminCapabilities.canUseRhWorkflowMessages, true);
  assert.match(rhSources.requestsSection, /canUseRhWorkflowMessages/);
  assert.match(rhSources.requestDetailModal, /canUseRhWorkflowMessages/);
  assert.match(
    rhSources.messageTimeline,
    /canUseRhWorkflowMessages \?[\s\S]*<option value="Solution">/,
  );
});

runTest("RH sem acesso nao e tratado como usuario autorizado", () => {
  const capabilities = resolveRhPermissionCapabilities(0, false);

  assert.equal(capabilities.canAccessRhPortal, false);
  assert.equal(capabilities.canManageRhRequests, false);
});

runTest("RH shell distingue erro de permissao de ausencia de acesso", () => {
  const shellSource = readFileSync("src/shared/components/newLayout/RH.tsx", "utf8");

  assert.match(
    shellSource,
    /if \(!permissionQuery\.isLoading && permissionQuery\.error\) \{/,
  );
  assert.match(
    shellSource,
    /validar o acesso ao RH agora\./,
  );
  assert.match(
    shellSource,
    /if \(!permissionQuery\.isLoading && !permissionQuery\.error && !canAccessRhPortal\) \{/,
  );
});

runTest("RH score periods include a relative history window and do not hard-code 2026", () => {
  const options = getRhQuarterOptions(new Date("2026-07-01T12:00:00"));
  const historySource = readFileSync("src/modules/rh/components/score/RhScoreHistoryPanel.tsx", "utf8");

  assert.equal(options.length, 20);
  assert.ok(options.some((option) => option.value === "2024-Q1"));
  assert.ok(options.some((option) => option.value === "2028-Q4"));
  assert.doesNotMatch(historySource, /startsWith\("2026-Q"\)/);
});

runTest("RH civil dates do not move when an API value is UTC midnight", () => {
  assert.equal(formatRhDate("2026-07-23T00:00:00.000Z"), "23/07/2026");
  assert.equal(formatRhDate("2026-01-01"), "01/01/2026");
});

runTest("RH request timeline uses distinct semantic message type badges", () => {
  const timelineSource = readFileSync(
    "src/modules/rh/components/RhRequestMessagesTimeline.tsx",
    "utf8",
  );
  const classNames = ["Message", "Solution", "Rejection", "Acceptance"].map(
    getRhMessageTypeClassName,
  );

  assert.equal(new Set(classNames).size, 4);
  assert.match(getRhMessageTypeClassName("Message"), /blue|slate|gray/);
  assert.match(getRhMessageTypeClassName("Solution"), /amber|yellow/);
  assert.match(getRhMessageTypeClassName("Rejection"), /red|rose/);
  assert.match(getRhMessageTypeClassName("Acceptance"), /green|emerald/);
  assert.match(timelineSource, /getRhMessageTypeClassName\(item\.type\)/);
});

runTest("RH ponto nao invalida queries fora do dominio", () => {
  const pointSource = readFileSync("src/modules/rh/hooks/useRhPoint.ts", "utf8");

  assert.equal(
    (pointSource.match(/invalidateQueries\(\{ queryKey: RH_POINT_QUERY_KEY \}\)/g) ?? []).length,
    6,
  );
  assert.doesNotMatch(pointSource, /invalidateQueries\(\{ queryKey: RH_QUERY_KEY \}\)/);
});

runTest("contador de solicitacoes so fica ativo na aba de solicitacoes", () => {
  const shellSource = readFileSync("src/shared/components/newLayout/RH.tsx", "utf8");

  assert.equal(
    (shellSource.match(/enabled: canManageRhRequests && activeTab === "requests"/g) ?? []).length,
    2,
  );
});
