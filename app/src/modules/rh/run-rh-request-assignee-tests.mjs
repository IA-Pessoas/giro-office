import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { selectableRhRequestAssignees } = await import("./utils/rhRequestUi.ts");

function runTest(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const users = [
  { id: "owner", name: "Owner", status: "active", departmentName: null, photoUrl: null },
  { id: "rh-1", name: "RH 1", status: "active", departmentName: null, photoUrl: null },
];

runTest("assignee options exclude the requester, as rh-service rejects them", () => {
  assert.deepEqual(
    selectableRhRequestAssignees(users, "owner").map((user) => user.id),
    ["rh-1"],
  );
});

runTest("assignee options keep every catalog user when the requester is unknown", () => {
  assert.equal(selectableRhRequestAssignees(users, undefined).length, 2);
});

runTest("request assignee select is fed by the RH operational users catalog", () => {
  const section = readFileSync("src/modules/rh/components/RhRequestsSection.tsx", "utf8");
  assert.match(section, /useAssignableUsers\(\{[^}]*module: "rh"/);
  assert.match(section, /currentUserId=\{user\?\.id\}/);
});
