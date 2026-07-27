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

runTest("RH request form preserves validation errors returned by the API", () => {
  const source = readFileSync("src/modules/rh/components/RhRequestFormModal.tsx", "utf8");

  assert.match(source, /import \{ isAxiosError \} from "axios"/);
  assert.match(source, /isAxiosError\(error\) \? error\.response\?\.data\?\.error : undefined/);
  assert.match(source, /typeof responseMessage === "string"[\s\S]*?\? responseMessage/);
});
