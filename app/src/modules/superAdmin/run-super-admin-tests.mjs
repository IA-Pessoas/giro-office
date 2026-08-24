import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(relativePath) {
  try {
    return await readFile(new URL(relativePath, import.meta.url), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

async function runTest(name, test) {
  try {
    await test();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const [
  platformServiceSource,
  organizationsHookSource,
  usersHookSource,
  auditHookSource,
  organizationDirectorySource,
  usersPanelSource,
  auditPanelSource,
  superAdminPageSource,
  pageSource,
  appShellSource,
] = await Promise.all([
  source("./services/platformService.ts"),
  source("./hooks/usePlatformOrganizations.ts"),
  source("./hooks/usePlatformUsers.ts"),
  source("./hooks/usePlatformAudit.ts"),
  source("./components/OrganizationDirectory.tsx"),
  source("./components/PlatformUsersPanel.tsx"),
  source("./components/PlatformAuditPanel.tsx"),
  source("./components/SuperAdminPage.tsx"),
  source("../../pages/super-admin/index.tsx"),
  source("../../shared/components/newLayout/AppShell.tsx"),
]);

const allSuperAdminSources = [
  platformServiceSource,
  organizationsHookSource,
  usersHookSource,
  auditHookSource,
  organizationDirectorySource,
  usersPanelSource,
  auditPanelSource,
  superAdminPageSource,
  pageSource,
].join("\n");

await runTest("consome somente os contratos HTTP-only de leitura da plataforma", () => {
  assert.match(platformServiceSource, /api\.get\("\/platform\/organizations"/);
  assert.match(
    platformServiceSource,
    /api\.get\(`\/platform\/organizations\/\$\{organizationId\}\/users`/,
  );
  assert.match(platformServiceSource, /api\.get\("\/platform\/audit\/requests"/);
  assert.doesNotMatch(
    allSuperAdminSources,
    /cw\.token|jwtDecode|Authorization|Bearer|nookies|support_mode|support-sessions/,
  );
  assert.doesNotMatch(platformServiceSource, /api\.(post|put|patch|delete)\(/);
});

await runTest("usa React Query e condiciona usuários à organização selecionada", () => {
  assert.match(organizationsHookSource, /useQuery\(/);
  assert.match(usersHookSource, /useQuery\(/);
  assert.match(usersHookSource, /enabled: Boolean\(organizationId\)/);
  assert.doesNotMatch(usersHookSource, /placeholderData/);
  assert.match(
    superAdminPageSource,
    /<PlatformUsersPanel\s+key=\{selectedOrganization\.id\}\s+organization=\{selectedOrganization\}/,
  );
  assert.match(auditHookSource, /useQuery\(/);
});

await runTest("expõe estados reais de carregamento, erro, vazio e sucesso", () => {
  const panels = [organizationDirectorySource, usersPanelSource, auditPanelSource].join("\n");
  assert.match(panels, /isLoading/);
  assert.match(panels, /isError/);
  assert.match(panels, /Nenhuma organização encontrada/);
  assert.match(panels, /Nenhum usuário encontrado/);
  assert.match(panels, /Nenhum registro de auditoria encontrado/);
  assert.match(usersPanelSource, /users\.map/);
  assert.match(auditPanelSource, /items\.map/);
});

await runTest("mantém pesquisa e paginação acessíveis e responsivas", () => {
  assert.match(organizationDirectorySource, /htmlFor="platform-organization-search"/);
  assert.match(organizationDirectorySource, /id="platform-organization-search"/);
  assert.match(usersPanelSource, /htmlFor="platform-user-search"/);
  assert.match(usersPanelSource, /id="platform-user-search"/);
  assert.match(auditPanelSource, /htmlFor="platform-audit-search"/);
  assert.match(auditPanelSource, /id="platform-audit-search"/);
  assert.match(organizationDirectorySource, /PaginationControls/);
  assert.match(usersPanelSource, /PaginationControls/);
  assert.match(auditPanelSource, /PaginationControls/);
  assert.match(superAdminPageSource, /lg:grid-cols/);
});

await runTest("não oferece mutação, suporte ou CTA inerte", () => {
  assert.doesNotMatch(allSuperAdminSources, /Novo usuário|Modo suporte|Suporte assistido/);
  assert.doesNotMatch(allSuperAdminSources, /onClick=\{\(\) => \{\}\}/);
});

await runTest("protege a rota pelo servidor e separa a navegação por identidade", () => {
  assert.match(pageSource, /canSSRPlatformAdmin\(async \(\) => \(\{ props: \{\} \}\)\)/);
  assert.match(appShellSource, /user\?\.auth_kind === "platform"/);
  assert.match(appShellSource, /enabled: !isPlatformSuperAdmin/);
  assert.match(appShellSource, /platformOnly\?: boolean/);
  assert.match(appShellSource, /module\.platformOnly === true/);
  assert.match(
    appShellSource,
    /\{ path: "\/super-admin", name: "Super Admin", icon: ShieldCheck, platformOnly: true \}/,
  );
});
