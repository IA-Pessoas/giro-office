import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@shared/services/api") {
      return nextResolve(new URL("../../shared/services/api.ts", import.meta.url).href, context);
    }
    if (
      (context.parentURL?.includes("/modules/superAdmin/") &&
        ["../services/platformService", "../utils/platformManagement", "./usePlatformOrganizations"].includes(specifier)) ||
      (context.parentURL?.endsWith("/shared/services/api.ts") &&
        ["./errors/AuthTokenError", "./serverErrorToast"].includes(specifier))
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

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

await runTest("GET de detalhe antigo não sobrescreve PATCH confirmado no QueryClient real", async () => {
  const hooks = await import("./hooks/usePlatformOrganizationMutations.ts");
  const { platformOrganizationKeys } = await import("./hooks/usePlatformOrganizations.ts");
  const { platformService } = await import("./services/platformService.ts");
  const { platformApi } = await import("../../shared/services/api.ts");
  const originalAdapter = platformApi.defaults.adapter;
  const old = {
    id: "org-1", name: "Organização", cnpj: "11222333000181", slug: "organizacao",
    status: "trial", subscription_plan: "trial", logo_url: null,
    created_at: "2026-08-25T10:00:00.000Z", updated_at: "2026-08-25T10:00:00.000Z",
  };
  try {
    for (const [hook, variables, changed] of [
      [hooks.useUpdatePlatformOrganizationStatus, { status: "active" }, { status: "active" }],
      [hooks.useUpdatePlatformOrganizationPlan, { subscriptionPlan: "pro" }, { subscription_plan: "pro" }],
      [hooks.useUpdatePlatformOrganizationLogo, { logoUrl: "https://example.test/new.png" }, { logo_url: "https://example.test/new.png" }],
    ]) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
      const key = platformOrganizationKeys.detail(old.id);
      const updated = { ...old, ...changed, updated_at: "2026-08-25T11:00:00.000Z" };
      let releaseGet;
      let releasePatch;
      let getStarted;
      let patchStarted;
      const getting = new Promise((resolve) => { getStarted = resolve; });
      const patching = new Promise((resolve) => { patchStarted = resolve; });
      platformApi.defaults.adapter = async (config) => {
        const data = await new Promise((resolve) => {
          if (config.method === "get") {
            releaseGet = () => resolve(old);
            getStarted();
          } else {
            assert.equal(config.method, "patch");
            releasePatch = () => resolve(updated);
            patchStarted();
          }
        });
        return { data: { success: true, data }, status: 200, statusText: "OK", headers: {}, config };
      };
      let mutation;
      function CaptureMutation() {
        mutation = hook();
        return null;
      }
      renderToString(createElement(QueryClientProvider, { client }, createElement(CaptureMutation)));
      client.setQueryData(key, old);
      const pendingGet = client.fetchQuery({
        queryKey: key,
        queryFn: () => platformService.getOrganization(old.id),
      }).catch(() => undefined);
      await getting;
      const patch = mutation.mutateAsync({ organizationId: old.id, expectedUpdatedAt: old.updated_at, ...variables });
      await patching;
      assert.deepEqual(client.getQueryData(key), old, "não publica escrita otimista");
      releasePatch();
      await patch;
      assert.deepEqual(client.getQueryData(key), updated);
      releaseGet();
      await pendingGet;
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(client.getQueryData(key), updated, "resposta GET velha não pode desfazer PATCH nem updated_at");
      client.clear();
    }
  } finally {
    platformApi.defaults.adapter = originalAdapter;
  }
});

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
  ownershipTransferDialogSource,
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
  source("./components/OwnershipTransferDialog.tsx"),
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
  ownershipTransferDialogSource,
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
  assert.match(
    platformServiceSource,
    /api\.delete\(`\/platform\/organizations\/\$\{organizationId\}\/users\/\$\{userId\}`\)/,
  );
  assert.match(
    platformServiceSource,
    /api\.post\(\s*`\/platform\/organizations\/\$\{organizationId\}\/users\/\$\{userId\}\/reactivate`/,
  );
  assert.match(
    platformServiceSource,
    /api\.get\(\s*`\/platform\/organizations\/\$\{organizationId\}\/users\/\$\{userId\}\/permissions`/,
  );
  assert.match(
    platformServiceSource,
    /api\.put\(\s*`\/platform\/organizations\/\$\{organizationId\}\/users\/\$\{userId\}\/permissions`,\s*permissions,?\s*\)/,
  );
  assert.match(
    platformServiceSource,
     /api\.post\(\s*`\/platform\/organizations\/\$\{organizationId\}\/ownership-transfer`/,
  );
  assert.doesNotMatch(
    allSuperAdminSources,
    /cw\.token|jwtDecode|Authorization|Bearer|nookies|support_mode|support-sessions/,
  );
  assert.doesNotMatch(platformServiceSource, /updateOrganization\s*\(/);
});

await runTest("reutiliza o editor compartilhado para permissões no tenant selecionado", () => {
  assert.match(usersPanelSource, /AdminPermissionsEditor/);
  assert.match(usersPanelSource, /getUserPermissions/);
  assert.match(usersPanelSource, /updateUserPermissions/);
  assert.match(usersPanelSource, /Editar permissões/);
  assert.match(usersPanelSource, /permissionActionRef/);
});

 await runTest("separa a transferência de ownership com confirmação reforçada", () => {
  assert.match(usersPanelSource, /Transferir ownership/);
  assert.match(usersPanelSource, /OwnershipTransferDialog/);
  assert.match(usersHookSource, /usePlatformOwnershipTransferMutation/);
  assert.match(usersHookSource, /queryKey: \["platform", "audit"\]/);
  assert.match(ownershipTransferDialogSource, /Organização/);
  assert.match(ownershipTransferDialogSource, /Owner atual/);
  assert.match(ownershipTransferDialogSource, /Sucessor ativo/);
  assert.match(ownershipTransferDialogSource, /Consequência para o owner anterior/);
  assert.match(ownershipTransferDialogSource, /Justificativa/);
  assert.match(ownershipTransferDialogSource, /Confirmar transferência/);
   assert.match(ownershipTransferDialogSource, /maxLength=\{500\}/);
 });

await runTest("usa React Query, detalhe condicionado e mutations sem retry automático", () => {
  assert.match(organizationsHookSource, /useQuery\(/);
  assert.match(usersHookSource, /useQuery\(/);
  assert.match(
    usersHookSource,
    /setQueriesData<PlatformUsersListResponse>\(\s*\{\s*predicate: \(query\) =>[\s\S]*typeof query\.queryKey\[4\] === "object"/,
  );
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

await runTest("confirma o ciclo de status com organização e usuário sem simular exclusão", () => {
  assert.match(usersPanelSource, /Desativar usuário/);
  assert.match(usersPanelSource, /Reativar usuário/);
  assert.match(usersPanelSource, /organization\.name/);
  assert.match(usersPanelSource, /ConfirmationDialog/);
  assert.match(usersHookSource, /usePlatformUserLifecycleMutation/);
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

await runTest("alinha a paginação do diretório ao painel de configuração", () => {
  assert.match(superAdminPageSource, /lg:items-stretch/);
  assert.match(
    organizationDirectorySource,
    /<aside className="flex min-h-0 flex-col overflow-hidden/,
  );
  assert.doesNotMatch(organizationDirectorySource, /min-h-\[34rem\]/);
  assert.match(organizationDirectorySource, /min-h-0 flex-1 overflow-y-auto/);
});

await runTest("mantém a paginação da auditoria visível no painel com tabela rolável", () => {
  assert.match(superAdminPageSource, /lg:h-\[calc\(100vh-16rem\)\]/);
  assert.match(
    superAdminPageSource,
    /flex min-h-0 flex-col rounded-xl border/,
  );
  assert.match(
    superAdminPageSource,
    /activePanel === "audit" \? "overflow-hidden" : "overflow-auto"/,
  );
  assert.match(
    auditPanelSource,
    /<section aria-labelledby="platform-audit-title" className="flex min-h-0 flex-1 flex-col">/,
  );
  assert.match(
    auditPanelSource,
    /className="min-h-0 flex-1 overflow-auto lg:min-h-\[24rem\]"/,
  );
  assert.ok(
    auditPanelSource.indexOf("<PaginationControls") >
      auditPanelSource.indexOf('className="min-h-0 flex-1 overflow-auto"'),
  );
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

  for (const field of [
    "id",
    "name",
    "login",
    "status",
    "department_id",
    "photo_url",
    "type",
    "permission",
    "version",
  ]) {
    assert.match(userContract, new RegExp(`\\b${field}:`));
  }
  assert.match(userContract, /type: "owner" \| "admin" \| "user" \| null/);
  for (const field of [
    "joined_at",
    "organization_id",
    "first_owner_flag",
    "permission_id",
    "password",
    "password_hash",
    "hashed_password",
    "hash",
    "access_token",
    "refresh_token",
    "session_token",
    "csrf_token",
  ]) {
    assert.doesNotMatch(userContract, new RegExp(`\\b${field}:`));
  }
  assert.match(usersPanelSource, /return "Sem perfil"/);
  assert.doesNotMatch(usersPanelSource, /Nível|Entrada|joined_at|user\.permission/);
});

await runTest("mantém lista e painel de detalhe isolados pela organização selecionada", () => {
  assert.match(platformServiceSource, /\/users\/\$\{userId\}/);
  assert.match(platformServiceSource, /\/departments/);
  assert.match(usersPanelSource, /selectedUserId/);
  assert.match(usersPanelSource, /lg:grid-cols-\[22rem_minmax\(0,1fr\)\]/);
  assert.match(usersPanelSource, /usePlatformUserDetail/);
  assert.match(usersPanelSource, /usePlatformDepartments/);
  assert.match(usersPanelSource, /departmentsQuery\.isError/);
  assert.match(usersPanelSource, /departmentsQuery\.refetch/);
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

await runTest("confirma status e concentra as edições de plano e logo em diálogos", () => {
  assert.match(organizationOverviewSource, /<Dialog/);
  assert.match(organizationOverviewSource, /confirmationName !== organization\.name/);
  assert.match(
    organizationOverviewSource,
    /statusToConfirm === "suspended" \|\| statusToConfirm === "cancelled"/,
  );
  assert.doesNotMatch(organizationOverviewSource, /void updateStatus\(statusDraft\)/);
  assert.match(managementUtilsSource, /past_due|suspended|cancelled/);
  assert.match(organizationOverviewSource, /Salvar status/);
  assert.match(organizationOverviewSource, /Editar plano/);
  assert.match(organizationOverviewSource, /Editar logo/);
  assert.match(organizationOverviewSource, /title="Editar plano"/);
  assert.match(organizationOverviewSource, /title="Editar logo"/);
  assert.match(organizationOverviewSource, /onCloseAutoFocus=\{/);
  assert.match(organizationOverviewSource, /preventClose=\{planMutation\.isPending\}/);
  assert.match(organizationOverviewSource, /preventClose=\{logoMutation\.isPending\}/);
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

await runTest("oferece detalhes da ação sob demanda sem perder o contexto da lista", () => {
  assert.match(auditPanelSource, /useRef/);
  assert.match(auditPanelSource, /selectedAudit/);
  assert.match(auditPanelSource, /Ver detalhes da ação/);
  assert.match(auditPanelSource, /<Dialog/);
  assert.match(auditPanelSource, /title="Detalhes da ação"/);
  assert.match(auditPanelSource, /requestId/);
  assert.match(auditPanelSource, /serviceSource/);
  assert.match(auditPanelSource, /durationMs/);
  assert.match(auditPanelSource, /formatAuditChanges\(selectedAudit\.changes\)/);
  assert.match(auditPanelSource, /onCloseAutoFocus/);
  assert.match(auditPanelSource, /setSelectedAudit\(null\)/);
});

await runTest("exibe alterações de permissões por módulo no detalhe da auditoria", () => {
  assert.match(typesSource, /modules\?: \{[\s\S]*before: Partial<Record<string, 0 \| 1 \| 2 \| 3>>/);
  assert.match(managementUtilsSource, /changes\.modules/);
  assert.match(managementUtilsSource, /Módulo \$\{moduleKey\}/);
  assert.match(auditPanelSource, /selectedAuditChanges/);
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

await runTest("não converte detalhe pendente ou falho em auditoria global", () => {
  const detailRendering = superAdminPageSource.slice(
    superAdminPageSource.indexOf("{selectedOrganizationId && organizationDetailQuery.isLoading"),
  );
  assert.ok(detailRendering.indexOf("organizationDetailQuery.isError") >= 0);
  assert.ok(
    detailRendering.indexOf("organizationDetailQuery.isError") <
      detailRendering.indexOf('activePanel === "audit"'),
  );
});

await runTest("devolve foco pelo lifecycle Radix opcional sem corrida de animation frame", () => {
  assert.match(
    dialogSource,
    /onCloseAutoFocus\?: ComponentProps<typeof DialogPrimitive\.Content>\["onCloseAutoFocus"\]/,
  );
  assert.match(usersPanelSource, /lifecycleActionRef\.current\?\.focus\(\);/);
  assert.match(dialogSource, /onCloseAutoFocus=\{onCloseAutoFocus\}/);
  assert.match(createOrganizationDialogSource, /onCloseAutoFocus=\{/);
  assert.match(organizationOverviewSource, /onCloseAutoFocus=\{/);
  assert.match(
    organizationDirectorySource,
    /<Button asChild size="sm">\s*<button onClick=\{onCreate\} ref=\{createButtonRef\}/,
  );
  assert.doesNotMatch(superAdminPageSource + organizationOverviewSource, /requestAnimationFrame/);
});
