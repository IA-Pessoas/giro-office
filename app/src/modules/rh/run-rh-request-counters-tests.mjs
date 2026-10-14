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

const hook = readFileSync("src/modules/rh/hooks/useRhRequests.ts", "utf8");
const sharedRequests = readFileSync("../shared/src/rh/requests.ts", "utf8");
const sharedRequestsExport =
  'export { RH_PENDING_REQUEST_STATUSES } from "@workspace/shared/rh/requests";';
const dashboard = readFileSync("src/modules/rh/components/RhDashboardSection.tsx", "utf8");
const shell = readFileSync("src/shared/components/newLayout/RH.tsx", "utf8");

runTest("pending RH requests are New and In_Progress, counted from the backend total", () => {
  assert.match(sharedRequests, /RH_PENDING_REQUEST_STATUSES = \["New", "In_Progress"\] as const/);
  assert.ok(hook.includes(sharedRequestsExport));
  assert.match(hook, /first\.data\?\.total \?\? 0\) \+ \(second\.data\?\.total \?\? 0/);
});

runTest("dashboard and requests tab badge share the same pending rule", () => {
  for (const source of [dashboard, shell]) {
    assert.match(source, /useRhRequestsTotal\(RH_PENDING_REQUEST_STATUSES/);
    assert.doesNotMatch(source, /\.items\.length|items \?\? \[\]\)\.length/);
  }
  assert.doesNotMatch(dashboard, /request\.status === "New"/);
});
