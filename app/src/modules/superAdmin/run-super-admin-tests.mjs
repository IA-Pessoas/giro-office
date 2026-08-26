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
  mutationsHookSource,
  managementUtilsSource,
  organizationDirectorySource,
  createOrganizationDialogSource,
  organizationOverviewSource,
  usersPanelSource,
  auditPanelSource,
  superAdminPageSource,
  pageSource,
  appShellSource,
  appSource,
  platformGuardSource,
  typesSource,
  dialogSource,
] = await Promise.all([
  source("./services/platformService.ts"),
  source("./hooks/usePlatformOrganizations.ts"),
  source("./hooks/usePlatformUsers.ts"),
  source("./hooks/usePlatformAudit.ts"),
  source("./hooks/usePlatformOrganizationMutations.ts"),
  source("./utils/platformManagement.ts"),
  source("./components/OrganizationDirectory.tsx"),
  source("./components/CreateOrganizationDialog.tsx"),
  source("./components/OrganizationOverviewPanel.tsx"),
  source("./components/PlatformUsersPanel.tsx"),
  source("./components/PlatformAuditPanel.tsx"),
  source("./components/SuperAdminPage.tsx"),
  source("../../pages/super-admin/index.tsx"),
  source("../../shared/components/newLayout/AppShell.tsx"),
  source("../../pages/_app.tsx"),
  source("../auth/utils/canSSRPlatformAdmin.ts"),
  source("./types.ts"),
  source("../../shared/components/ui/Dialog.tsx"),
]);

const allSuperAdminSources = [
  platformServiceSource,
  organizationsHookSource,
  usersHookSource,
  auditHookSource,
  mutationsHookSource,
  managementUtilsSource,
  organizationDirectorySource,
  createOrganizationDialogSource,
  organizationOverviewSource,
  usersPanelSource,
  auditPanelSource,
  superAdminPageSource,
  pageSource,
].join("\n");

await runTest("consome contratos explícitos de gestão pela sessão HTTP-only", () => {
  assert.match(platformServiceSource, /api\.get\("\/platform\/organizations"/);
  assert.match(
    platformServiceSource,
    /api\.get\(`\/platform\/organizations\/\$\{organizationId\}`/,
  );
  assert.match(
    platformServiceSource,
    /api\.get\(`\/platform\/organizations\/\$\{organizationId\}\/users`/,
  );
  assert.match(platformServiceSource, /api\.get\("\/platform\/audit\/requests"/);
  assert.match(platformServiceSource, /api\.post\("\/platform\/organizations",\s*data\)/);
  assert.match(
    platformServiceSource,
    /api\.patch\(`\/platform\/organizations\/\$\{organizationId\}\/status`,\s*data\)/,
  );
  assert.match(
    platformServiceSource,
    /api\.patch\(\s*`\/platform\/organizations\/\$\{organizationId\}\/subscription-plan`,\s*data/,
  );
  assert.match(
    platformServiceSource,
    /api\.patch\(`\/platform\/organizations\/\$\{organizationId\}\/logo-url`,\s*data\)/,
  );
  assert.doesNotMatch(
    allSuperAdminSources,
    /cw\.token|jwtDecode|Authorization|Bearer|nookies|support_mode|support-sessions/,
  );
  assert.doesNotMatch(platformServiceSource, /api\.(put|delete)\(/);
  assert.doesNotMatch(platformServiceSource, /updateOrganization\s*\(/);
});

await runTest("usa React Query, detalhe condicionado e mutations sem retry automático", () => {
  assert.match(organizationsHookSource, /useQuery\(/);
  assert.match(usersHookSource, /useQuery\(/);
  assert.match(usersHookSource, /enabled: Boolean\(organizationId\)/);
  assert.doesNotMatch(usersHookSource, /placeholderData/);
  assert.match(
    superAdminPageSource,
    /<PlatformUsersPanel\s+key=\{selectedOrganization\.id\}\s+organization=\{selectedOrganization\}/,
  );
  assert.match(auditHookSource, /useQuery\(/);
  assert.match(organizationsHookSource, /usePlatformOrganizationDetail/);
  assert.match(organizationsHookSource, /enabled: Boolean\(organizationId\)/);
  assert.match(mutationsHookSource, /useMutation/);
  assert.match(mutationsHookSource, /retry: false/);
  assert.match(mutationsHookSource, /expected_updated_at/);
  assert.match(mutationsHookSource, /setQueryData/);
  assert.match(mutationsHookSource, /invalidateQueries/);
  assert.match(mutationsHookSource, /isPlatformConflict/);
});

await runTest("limita criação e mutações aos payloads aprovados", () => {
  assert.match(
    typesSource,
    /export type PlatformOrganizationStatus =\s*\| "trial"[\s\S]*\| "cancelled"/,
  );
  assert.match(
    typesSource,
    /export type PlatformOrganizationPlan = "trial" \| "pro" \| "enterprise"/,
  );
  assert.match(
    typesSource,
    /export interface CreatePlatformOrganizationPayload \{\s*name: string;\s*cnpj: string;\s*\}/,
  );
  assert.doesNotMatch(
    createOrganizationDialogSource,
    /owner|email_created_by|subscription_plan|logo_url/,
  );
  assert.match(mutationsHookSource, /updateStatus/);
  assert.match(mutationsHookSource, /updateSubscriptionPlan/);
  assert.match(mutationsHookSource, /updateLogoUrl/);
});

await runTest("trata conflito concorrente com refetch sem repetir mutação", () => {
  assert.match(managementUtilsSource, /response\?\.status === 409/);
  assert.match(managementUtilsSource, /Esta organização foi alterada por outra pessoa/);
  assert.match(mutationsHookSource, /invalidatePlatformOrganization/);
  assert.match(mutationsHookSource, /onError/);
  assert.doesNotMatch(mutationsHookSource, /retry:\s*[1-9]|retryDelay/);
  assert.match(managementUtilsSource, /export function getPlatformMutationErrorMessage/);
  assert.doesNotMatch(createOrganizationDialogSource, /getPlatformMutationErrorMessage/);
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

await runTest("oferece gestão explícita sem suporte ou CTA inerte", () => {
  assert.doesNotMatch(allSuperAdminSources, /Novo usuário|Modo suporte|Suporte assistido/);
  assert.doesNotMatch(allSuperAdminSources, /onClick=\{\(\) => \{\}\}/);
  assert.match(organizationDirectorySource, /Criar organização/);
  assert.match(createOrganizationDialogSource, /title="Criar organização"/);
  assert.match(createOrganizationDialogSource, /maxLength=\{18\}/);
  assert.match(createOrganizationDialogSource, /role="alert"/);
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

await runTest("mantém público o destino de login usado pelo guard da plataforma", () => {
  assert.match(platformGuardSource, /destination:\s*["']\/super-admin\/login["']/);
  assert.match(appSource, /router\.pathname === ["']\/super-admin\/login["']/);
});

await runTest("renderiza somente o contrato real de usuário da plataforma", () => {
  const userContract =
    typesSource.match(/export interface PlatformOrganizationUser \{[\s\S]*?\n\}/)?.[0] ?? "";

  for (const field of ["id", "name", "login", "status", "department_id", "photo_url", "type"]) {
    assert.match(userContract, new RegExp(`\\b${field}:`));
  }
  assert.match(userContract, /type: "owner" \| "admin" \| "user" \| null/);
  assert.doesNotMatch(
    userContract,
    /permission:|joined_at:|organization_id:|first_owner_flag:|permission_id:/,
  );
  assert.match(usersPanelSource, /return "Sem perfil"/);
  assert.doesNotMatch(usersPanelSource, /Nível|Entrada|joined_at|user\.permission/);
});

await runTest("usa três botões nativos simples para alternar painéis", () => {
  assert.doesNotMatch(superAdminPageSource, /role="tab(?:list|panel)?"/);
  assert.doesNotMatch(
    superAdminPageSource,
    /aria-controls=|aria-selected=|aria-labelledby="platform-(?:users|audit)-tab"/,
  );
  assert.match(superAdminPageSource, />\s*Visão geral\s*</);
  assert.match(superAdminPageSource, />\s*Usuários\s*</);
  assert.match(superAdminPageSource, />\s*Auditoria\s*</);
  assert.match(superAdminPageSource, /aria-pressed=\{activePanel === "overview"\}/);
});

await runTest("mantém seleção por id e detalhe independente da página do diretório", () => {
  assert.match(superAdminPageSource, /selectedOrganizationId/);
  assert.match(superAdminPageSource, /usePlatformOrganizationDetail\(selectedOrganizationId\)/);
  assert.doesNotMatch(superAdminPageSource, /setSelectedOrganization\(\(current\)/);
  assert.match(superAdminPageSource, /selectedId=\{selectedOrganizationId\}/);
});

await runTest("confirma todo status e exige nome exato para suspensão e cancelamento", () => {
  assert.match(organizationOverviewSource, /<Dialog/);
  assert.match(organizationOverviewSource, /confirmationName !== organization\.name/);
  assert.match(
    organizationOverviewSource,
    /statusToConfirm === "suspended" \|\| statusToConfirm === "cancelled"/,
  );
  assert.doesNotMatch(organizationOverviewSource, /void updateStatus\(statusDraft\)/);
  assert.match(managementUtilsSource, /past_due|suspended|cancelled/);
  assert.match(organizationOverviewSource, /Salvar status/);
  assert.match(organizationOverviewSource, /Salvar plano/);
  assert.match(organizationOverviewSource, /Salvar logo/);
  assert.match(organizationOverviewSource, /expectedUpdatedAt: organization\.updated_at/);
  assert.doesNotMatch(organizationOverviewSource, /<img|next\/image|backgroundImage/);
  assert.match(organizationOverviewSource, /rel="noreferrer noopener"/);
  assert.match(organizationOverviewSource, /!getLogoUrlError\(organization\.logo_url\)/);
});

await runTest("auditoria é contextual por padrão e global somente por controle explícito", () => {
  assert.match(auditHookSource, /organizationId\?: string/);
  assert.match(auditPanelSource, /organizationId: showGlobal \? undefined : organization\?\.id/);
  assert.match(auditPanelSource, /Mostrar auditoria global/);
  assert.match(auditPanelSource, /setPage\(1\)/);
  assert.match(auditPanelSource, /actorPlatformUserId/);
  assert.match(auditPanelSource, /formatAuditChanges/);
  assert.doesNotMatch(auditHookSource, /placeholderData/);
  assert.doesNotMatch(
    typesSource + auditPanelSource,
    /metadata_json|errorMessage\s*\??:|userAgent\s*\??:|\bip\s*\??:/,
  );
});

await runTest("preserva rascunhos de outras ações ao atualizar um campo", () => {
  assert.doesNotMatch(organizationOverviewSource, /\}, \[organization\]\)/);
  assert.match(
    superAdminPageSource,
    /<OrganizationOverviewPanel\s+key=\{selectedOrganization\.id\}/,
  );
});

await runTest("não cria segunda entrada de navegação para o Super Admin", () => {
  assert.equal((appShellSource.match(/name: "Super Admin"/g) ?? []).length, 1);
});

await runTest("devolve foco pelo lifecycle Radix opcional sem corrida de animation frame", () => {
  assert.match(
    dialogSource,
    /onCloseAutoFocus\?: ComponentProps<typeof DialogPrimitive\.Content>\["onCloseAutoFocus"\]/,
  );
  assert.match(dialogSource, /onCloseAutoFocus=\{onCloseAutoFocus\}/);
  assert.match(createOrganizationDialogSource, /onCloseAutoFocus=\{/);
  assert.match(organizationOverviewSource, /onCloseAutoFocus=\{/);
  assert.match(organizationDirectorySource, /<Button asChild size="sm">\s*<button onClick=\{onCreate\} ref=\{createButtonRef\}/);
  assert.doesNotMatch(superAdminPageSource + organizationOverviewSource, /requestAnimationFrame/);
});
