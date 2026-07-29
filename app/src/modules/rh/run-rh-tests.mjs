import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { getRhQuarterOptions } = await import("./utils/rhScoreUi.ts");
const { formatRhDate } = await import("./utils/rhDate.ts");
const { resolveRhPermissionCapabilities } = await import("./utils/rhPermissions.ts");
const { getRhMessageTypeClassName } = await import("./utils/rhRequestUi.ts");

const rhSources = {
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

runTest("RH Usuario mantem autosservico e nao recebe gestao", () => {
  const capabilities = resolveRhPermissionCapabilities(2, false);

  assert.equal(capabilities.canAccessRhPortal, true);
  assert.equal(capabilities.canManageRhRequests, false);
  assert.equal(capabilities.canManageRhScore, false);
  assert.equal(capabilities.canManageRhTimeBank, false);
  assert.equal(capabilities.canManageRhTimesheets, false);
  assert.equal(capabilities.canManageRhWorkday, false);
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
  assert.match(getRhMessageTypeClassName("Solution"), /green|emerald/);
  assert.match(getRhMessageTypeClassName("Rejection"), /red|rose/);
  assert.match(getRhMessageTypeClassName("Acceptance"), /green|emerald/);
  assert.match(timelineSource, /getRhMessageTypeClassName\(item\.type\)/);
});
