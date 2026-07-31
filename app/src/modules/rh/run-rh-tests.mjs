import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { getRhQuarterOptions } = await import("./utils/rhScoreUi.ts");
const { formatRhDate } = await import("./utils/rhDate.ts");

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

runTest("RH point adjustments expose guarded approve and reject decisions", () => {
  assert.match(
    rhSources.pointAdjustmentRoute,
    /"\/adjustment\/reject"[\s\S]*requireRhPermission\(RH_MANAGEMENT_PERMISSION\)/,
  );
  assert.match(rhSources.pointAdjustmentService, /put\(RH_ENDPOINTS\.rejectPointAdjustment/);
  assert.match(rhSources.pointAdjustmentHook, /useRejectRhPointAdjustmentMutation/);
  assert.match(
    rhSources.pointAdjustmentHook,
    /invalidateQueries\(\{ queryKey: RH_QUERY_KEY \}\)/,
  );
  assert.match(
    rhSources.pointAdjustmentPanel,
    /canManagePoint[\s\S]*adjustment\.status === "Pendente"[\s\S]*adjustment\.user_id !== currentUserId/,
  );
  assert.match(rhSources.pointAdjustmentPanel, /adjustment\.status === "Rejeitado"/);
  assert.match(rhSources.pointAdjustmentPanel, /obs_approver: rejectionReason\.trim\(\) \|\| null/);
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
