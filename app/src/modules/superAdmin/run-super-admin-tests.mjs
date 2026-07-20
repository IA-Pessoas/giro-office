import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const platformServiceSource = await readFile(
  new URL("./services/platformService.ts", import.meta.url),
  "utf8",
);
const usePlatformOrganizationsSource = await readFile(
  new URL("./hooks/usePlatformOrganizations.ts", import.meta.url),
  "utf8",
);
const superAdminPageSource = await readFile(
  new URL("./components/SuperAdminPage.tsx", import.meta.url),
  "utf8",
);
const organizationDirectorySource = await readFile(
  new URL("./components/OrganizationDirectory.tsx", import.meta.url),
  "utf8",
);
const platformUsersPanelSource = await readFile(
  new URL("./components/PlatformUsersPanel.tsx", import.meta.url),
  "utf8",
);

await runTest("platformService exposes organization user operations", () => {
  assert.match(platformServiceSource, /async listUsers\(/);
  assert.match(platformServiceSource, /async createUser\(/);
  assert.match(platformServiceSource, /async updateUser\(/);
  assert.match(platformServiceSource, /async deleteUser\(/);
  assert.match(platformServiceSource, /Promise<PlatformUserDeleteResponse>/);
});

await runTest(
  "platformService listUsers calls the platform organization users route with pagination",
  () => {
    assert.match(
      platformServiceSource,
      /api\.get\(`\/platform\/organizations\/\$\{organizationId\}\/users`, \{ params \}\)/,
    );
    assert.match(platformServiceSource, /params: \{ skip: number; take: number \}/);
  },
);

await runTest(
  "platformService deleteUser matches the platform user-service response envelope",
  () => {
    assert.match(
      platformServiceSource,
      /api\.delete\(`\/platform\/organizations\/\$\{organizationId\}\/users\/\$\{userId\}`\)/,
    );
    assert.match(platformServiceSource, /unwrapData<PlatformUserDeleteResponse>/);
  },
);

await runTest("organization filters use platform organization enum values", () => {
  assert.match(organizationDirectorySource, /value: "trial"/);
  assert.match(organizationDirectorySource, /value: "past_due"/);
  assert.match(organizationDirectorySource, /value: "active"/);
  assert.match(organizationDirectorySource, /value: "suspended"/);
  assert.match(organizationDirectorySource, /value: "cancelled"/);
  assert.doesNotMatch(organizationDirectorySource, /value: "inactive"/);
});

await runTest("organization query keeps previous data while refetching", () => {
  assert.match(usePlatformOrganizationsSource, /placeholderData: \(previousData\) => previousData/);
  assert.match(superAdminPageSource, /organizationsQuery\.isPlaceholderData/);
});

await runTest("super admin lists expose pagination controls", () => {
  assert.match(superAdminPageSource, /setOrganizationPage/);
  assert.match(organizationDirectorySource, /Pagina \{page\} de \{totalPages\}/);
  assert.match(platformUsersPanelSource, /setUserPage/);
  assert.match(platformUsersPanelSource, /skip: \(userPage - 1\) \* USERS_PAGE_SIZE/);
});

await runTest("users panel does not render missing department relation", () => {
  assert.match(platformUsersPanelSource, /getUserProfileLabel/);
  assert.doesNotMatch(platformUsersPanelSource, /departamento/i);
  assert.doesNotMatch(platformUsersPanelSource, /department\?\.name/);
});
