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
const superAdminTypesSource = await readFile(new URL("./types.ts", import.meta.url), "utf8");
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
const organizationDetailPanelSource = await readFile(
  new URL("./components/OrganizationDetailPanel.tsx", import.meta.url),
  "utf8",
);
const platformUsersPanelSource = await readFile(
  new URL("./components/PlatformUsersPanel.tsx", import.meta.url),
  "utf8",
);
const appShellSource = await readFile(
  new URL("../../shared/components/newLayout/AppShell.tsx", import.meta.url),
  "utf8",
);

function getInterfaceBlock(source, name) {
  const match = source.match(new RegExp(`export interface ${name} \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} interface not found`);
  return match[0];
}

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

await runTest("platform organization user DTO keeps selected response keys required", () => {
  const userBlock = getInterfaceBlock(superAdminTypesSource, "PlatformOrganizationUser");
  const listBlock = getInterfaceBlock(superAdminTypesSource, "PlatformUsersListResponse");

  assert.doesNotMatch(userBlock, /\?:/);
  assert.doesNotMatch(userBlock, /\bemail\b/);
  assert.doesNotMatch(userBlock, /\bcreated_at\b/);
  assert.doesNotMatch(userBlock, /\bupdated_at\b/);
  assert.match(userBlock, /login: string;/);
  assert.match(userBlock, /department_id: string;/);
  assert.match(userBlock, /permission: number;/);
  assert.match(userBlock, /type: "owner" \| "admin" \| "user" \| null;/);
  assert.match(userBlock, /status: string;/);
  assert.match(userBlock, /photo_url: string \| null;/);
  assert.match(userBlock, /joined_at: string \| null;/);
  assert.match(userBlock, /organization_id: string;/);
  assert.match(userBlock, /first_owner_flag: boolean \| null;/);
  assert.match(userBlock, /permission_id: string \| null;/);
  assert.match(listBlock, /skip: number;/);
  assert.match(listBlock, /take: number;/);
  assert.doesNotMatch(listBlock, /skip\?:|take\?:/);
});

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

await runTest("organization search is requested globally before pagination", () => {
  assert.match(platformServiceSource, /search\?: string/);
  assert.match(usePlatformOrganizationsSource, /search\?: string/);
  assert.match(superAdminPageSource, /const organizationSearchTerm = searchTerm\.trim\(\)/);
  assert.match(superAdminPageSource, /search: organizationSearchTerm/);
  assert.match(superAdminPageSource, /function handleSearchTermChange\(value: string\)/);
  assert.match(superAdminPageSource, /onSearchTermChange=\{handleSearchTermChange\}/);
  assert.doesNotMatch(superAdminPageSource, /filterOrganizations\(organizations, searchTerm\)/);
});

await runTest("super admin lists expose pagination controls", () => {
  assert.match(superAdminPageSource, /setOrganizationPage/);
  assert.match(organizationDirectorySource, /Página \{page\} de \{totalPages\}/);
  assert.match(platformUsersPanelSource, /setUserPage/);
  assert.match(platformUsersPanelSource, /skip: \(userPage - 1\) \* USERS_PAGE_SIZE/);
});

await runTest("super admin pagination exposes first and last page shortcuts", () => {
  assert.match(organizationDirectorySource, /ChevronsLeft/);
  assert.match(organizationDirectorySource, /ChevronsRight/);
  assert.match(organizationDirectorySource, /onFirstPage: \(\) => void/);
  assert.match(organizationDirectorySource, /onLastPage: \(\) => void/);
  assert.match(organizationDirectorySource, /aria-label="Primeira página de organizações"/);
  assert.match(organizationDirectorySource, /aria-label="Última página de organizações"/);
  assert.match(superAdminPageSource, /onFirstPage=\{\(\) => setOrganizationPage\(1\)\}/);
  assert.match(
    superAdminPageSource,
    /onLastPage=\{\(\) => setOrganizationPage\(totalOrganizationPages\)\}/,
  );
  assert.match(platformUsersPanelSource, /ChevronsLeft/);
  assert.match(platformUsersPanelSource, /ChevronsRight/);
  assert.match(platformUsersPanelSource, /aria-label="Primeira página de usuários"/);
  assert.match(platformUsersPanelSource, /aria-label="Última página de usuários"/);
  assert.match(platformUsersPanelSource, /setUserPage\(totalPages\)/);
});

await runTest("super admin visible copy keeps Portuguese accents", () => {
  const visibleCopySource = [
    superAdminPageSource,
    organizationDirectorySource,
    organizationDetailPanelSource,
    platformUsersPanelSource,
  ].join("\n");

  assert.doesNotMatch(visibleCopySource, /\bOrganizacoes\b/);
  assert.doesNotMatch(visibleCopySource, /\borganizacao\b/);
  assert.doesNotMatch(visibleCopySource, /\borganizacoes\b/);
  assert.doesNotMatch(visibleCopySource, /\bUsuarios\b/);
  assert.doesNotMatch(visibleCopySource, /\busuario\b/);
  assert.doesNotMatch(visibleCopySource, /\busuarios\b/);
  assert.doesNotMatch(visibleCopySource, /\bPagina\b/);
  assert.doesNotMatch(visibleCopySource, /\bProxima\b/);
  assert.doesNotMatch(visibleCopySource, /\bproxima\b/);
  assert.doesNotMatch(visibleCopySource, /\bNao\b/);
  assert.doesNotMatch(visibleCopySource, /\bnao\b/);
  assert.doesNotMatch(visibleCopySource, /\bpossivel\b/);
  assert.doesNotMatch(visibleCopySource, /\bdiretorio\b/);
  assert.doesNotMatch(visibleCopySource, /\bVisao\b/);
  assert.doesNotMatch(visibleCopySource, /\bIdentificacao\b/);
  assert.doesNotMatch(visibleCopySource, /\bOperacao\b/);
  assert.doesNotMatch(visibleCopySource, /\bPermissao\b/);
  assert.doesNotMatch(visibleCopySource, /\bProprietario\b/);
});

await runTest("users panel does not render missing department relation", () => {
  assert.match(platformUsersPanelSource, /getUserProfileLabel/);
  assert.doesNotMatch(platformUsersPanelSource, /departamento/i);
  assert.doesNotMatch(platformUsersPanelSource, /department\?\.name/);
});

await runTest("app shell exposes super admin navigation only for platform super admins", () => {
  assert.match(appShellSource, /platformOnly\?: boolean/);
  assert.match(
    appShellSource,
    /\{ path: "\/super-admin", name: "Super Admin", icon: ShieldCheck, platformOnly: true \}/,
  );
  assert.match(
    appShellSource,
    /user\?\.auth_kind === "platform" && user\.platform_role === "super_admin"/,
  );
});

await runTest("app shell does not request organization profile for platform super admins", () => {
  assert.match(appShellSource, /const meQuery = useMe\(\{\s*enabled: !isPlatformSuperAdmin\s*\}\)/);
  assert.match(appShellSource, /isPlatformSuperAdmin \? null : meQuery\.data\?\.photo_url/);
  assert.match(appShellSource, /const accessUser = isPlatformSuperAdmin \? user : meQuery\.data \?\? user/);
});
