import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { getRhQuarterOptions } = await import("./utils/rhScoreUi.ts");
const { formatRhDate } = await import("./utils/rhDate.ts");

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
  const source = readFileSync("src/modules/rh/components/RhRequestFormModal.tsx", "utf8");

  assert.match(source, /import \{ isAxiosError \} from "axios"/);
  assert.match(source, /isAxiosError\(error\) \? error\.response\?\.data\?\.error : undefined/);
  assert.match(source, /typeof responseMessage === "string"[\s\S]*?\? responseMessage/);
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
