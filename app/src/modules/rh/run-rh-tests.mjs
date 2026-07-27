import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
