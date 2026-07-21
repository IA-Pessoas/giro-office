import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const statusBadgeSource = readSource("./StatusBadge.tsx");
const organizationUiSource = readSource("../../modules/organizations/utils/organizationUi.ts");
const organizationInfoPanelSource = readSource(
  "../../modules/organizations/ui/OrganizationInfoPanel.tsx",
);

function readSource(relativePath) {
  const sourceUrl = new URL(relativePath, import.meta.url);

  if (!existsSync(sourceUrl)) {
    return "";
  }

  return readFileSync(sourceUrl, "utf8");
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("StatusBadge centralizes semantic variants", () => {
  assert.match(statusBadgeSource, /export type StatusBadgeVariant/);
  assert.match(statusBadgeSource, /export type StatusBadgeConfig/);
  assert.match(statusBadgeSource, /success:/);
  assert.match(statusBadgeSource, /warning:/);
  assert.match(statusBadgeSource, /danger:/);
  assert.match(statusBadgeSource, /info:/);
  assert.match(statusBadgeSource, /neutral:/);
  assert.match(statusBadgeSource, /purple:/);
  assert.match(statusBadgeSource, /orange:/);
  assert.match(statusBadgeSource, /statusBadgeVariantClassNames/);
});

runTest("StatusBadge keeps icon-only mode accessible", () => {
  assert.match(statusBadgeSource, /showLabel = true/);
  assert.match(statusBadgeSource, /<span className="sr-only">\{config\.label\}<\/span>/);
  assert.match(statusBadgeSource, /aria-hidden="true"/);
});

runTest("Organization status helper returns semantic variants", () => {
  assert.match(organizationUiSource, /import type \{ StatusBadgeConfig \}/);
  assert.match(organizationUiSource, /variant: "success"/);
  assert.match(organizationUiSource, /variant: "neutral"/);
  assert.equal(organizationUiSource.includes("className:"), false);
  assert.equal(organizationUiSource.includes("bg-green-100"), false);
});

runTest("OrganizationInfoPanel renders the shared StatusBadge", () => {
  assert.match(organizationInfoPanelSource, /import \{ StatusBadge \}/);
  assert.match(organizationInfoPanelSource, /<StatusBadge config=\{statusBadge\}/);
  assert.equal(organizationInfoPanelSource.includes("statusBadge.className"), false);
});
