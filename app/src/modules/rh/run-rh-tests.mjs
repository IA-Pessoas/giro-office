import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { getRhQuarterOptions } = await import("./utils/rhScoreUi.ts");

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

runTest("RH score periods include a relative history window and do not hard-code 2026", () => {
  const options = getRhQuarterOptions(new Date("2026-07-01T12:00:00"));
  const historySource = readFileSync("src/modules/rh/components/score/RhScoreHistoryPanel.tsx", "utf8");

  assert.equal(options.length, 20);
  assert.ok(options.some((option) => option.value === "2024-Q1"));
  assert.ok(options.some((option) => option.value === "2028-Q4"));
  assert.doesNotMatch(historySource, /startsWith\("2026-Q"\)/);
});
