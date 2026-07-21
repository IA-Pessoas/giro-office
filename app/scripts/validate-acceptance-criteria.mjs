import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const criteriaPath = path.join(rootDir, "migration", "acceptance-criteria.json");

const requiredSections = [
  "visual",
  "interaction",
  "accessibility",
  "functional",
  "definitionOfDone"
];

function fail(message) {
  console.error(`Criteria validation failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(criteriaPath)) {
  fail("acceptance-criteria.json not found");
}

const criteria = JSON.parse(fs.readFileSync(criteriaPath, "utf8"));

for (const section of requiredSections) {
  if (!Array.isArray(criteria[section])) {
    fail(`missing array section: ${section}`);
  }
  if (criteria[section].length === 0) {
    fail(`empty section: ${section}`);
  }
}

console.log("Acceptance criteria validation passed.");
console.log(`Sections validated: ${requiredSections.length}`);
