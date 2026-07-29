import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("department edit page removes color editing copy and field", () => {
  const page = readFileSync("src/pages/departments/[id].tsx", "utf8");

  assert.doesNotMatch(page, /DepartmentColorField/);
  assert.doesNotMatch(page, /handleColorChange/);
  assert.doesNotMatch(page, /cor do departamento/i);
  assert.match(page, /Atualize nome e status do departamento\./);
});

runTest("department edit form does not treat color as an editable update field", () => {
  const hook = readFileSync("src/modules/departments/hooks/useDepForm.ts", "utf8");

  assert.doesNotMatch(hook, /formData\.color\.toLowerCase\(\)/);
  assert.doesNotMatch(hook, /color: formData\.color/);
});
