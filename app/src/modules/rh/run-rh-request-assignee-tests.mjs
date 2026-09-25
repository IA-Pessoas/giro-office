import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { formatRhCategoryLabel, selectableRhRequestAssignees } = await import(
  "./utils/rhRequestUi.ts"
);

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

runTest("category label is shown exactly as typed, only trimmed", () => {
  assert.equal(formatRhCategoryLabel(" QA_Categoria "), "QA_Categoria");
  assert.equal(formatRhCategoryLabel("Feedback com o RH"), "Feedback com o RH");
  assert.equal(formatRhCategoryLabel(""), "-");
});

runTest("categories manager can delete a category", () => {
  const manager = readFileSync("src/modules/rh/components/RhCategoriesManager.tsx", "utf8");
  assert.match(manager, /useDeleteRhCategoryMutation\(\)/);
  assert.match(manager, /aria-label="Excluir categoria"/);
});

runTest("point schedule inputs are 24h text fields, not locale-dependent time inputs", () => {
  const card = readFileSync("src/modules/rh/components/RhPointConfigCard.tsx", "utf8");
  assert.doesNotMatch(card, /type="time"/);
  assert.match(card, /formatTimeInput\(/);
});
