import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";

import {
  canAccessAdministration,
  canCreateOrganizationOwner,
  canCreateUsers,
  isAdminPermission,
  isOrganizationOwner,
} from "./utils/permissions.ts";
import {
  APP_ROUTE_MODULE_MAP,
  canViewIntegrationRoute,
  isIntegrationTasksOnlyRouteBlocked,
  canViewTasksOnlyIntegrationRoute,
  getModulePermissionLevel,
  hasAnyModuleAccess,
  resolveAccessLevelFromAdditionalPermission,
  resolveDepartmentModuleKey,
  resolveModuleAccess,
  DISABLED_MODULE_KEYS,
  MODULE_KEYS,
  isModuleDisabled,
} from "./utils/moduleAccess.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "../utils/moduleAccess" &&
      context.parentURL?.endsWith("/modules/auth/store/accessStore.ts")
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

const {
  getAccessStoreState,
  createAccessStoreUserSnapshot,
  resetAccessStoreState,
  setAccessStoreState,
  shouldSyncAccessStore,
} = await import("./store/accessStore.ts");
const { resolveRhPermissionCapabilities } = await import("../rh/utils/rhPermissions.ts");
const {
  createAuthInvalidationHandler,
  invalidateAuthSession,
  registerAuthInvalidationHandler,
} = await import(
  "../../context/authInvalidation.ts",
);
const { INTEGRACAO_QA_FIXTURES } = await import(
  "../../../../scripts/qa/integracao-fixtures.mjs",
);

await runTest("integration routes preserve the level 0 own-tasks exception", () => {
  const users = {
    level0: { type: "user", modules: { integracao: 0 } },
    level1: { type: "user", modules: { integracao: 1 } },
    level2: { type: "user", modules: { integracao: 2 } },
    level3: { type: "user", modules: { integracao: 3 } },
    owner: { type: "owner", modules: { integracao: 0 } },
  };

  assert.equal(getModulePermissionLevel(users.level0, "integracao"), 0);
  assert.equal(getModulePermissionLevel(users.level1, "integracao"), 1);
  assert.equal(getModulePermissionLevel(users.level2, "integracao"), 2);
  assert.equal(getModulePermissionLevel(users.level3, "integracao"), 3);
  assert.equal(getModulePermissionLevel(users.owner, "integracao"), 3);

  const directRoutes = [
    "/tasks/123?status=Todos",
    "/clients/123/",
    "/projects/123?tab=tasks",
    "/configs/integracao/tasks/",
  ];
  const expectedByProfile = {
    level0: [true, false, false, false],
    level1: [true, true, true, true],
    level2: [true, true, true, true],
    level3: [true, true, true, true],
    owner: [true, true, true, true],
  };

  for (const [profile, expected] of Object.entries(expectedByProfile)) {
    directRoutes.forEach((route, index) => {
      assert.equal(
        canViewIntegrationRoute(route, users[profile]),
        expected[index],
        `${profile} ${route}`,
      );
    });
  }
});

await runTest("level 0 is restricted to the tasks surface", () => {
  const level0 = { type: "user", modules: { integracao: 0 } };
  const level1 = { type: "user", modules: { integracao: 1 } };
  const owner = { type: "owner", modules: { integracao: 0 } };

  assert.equal(canViewTasksOnlyIntegrationRoute("/tasks", level0), true);
  assert.equal(canViewTasksOnlyIntegrationRoute("/tasks/123", level0), true);
  assert.equal(canViewTasksOnlyIntegrationRoute("/dashboard", level0), false);
  assert.equal(canViewTasksOnlyIntegrationRoute("/configuracoes", level0), false);
  assert.equal(canViewTasksOnlyIntegrationRoute("/dashboard", level1), true);
  assert.equal(canViewTasksOnlyIntegrationRoute("/configuracoes", owner), true);
});

await runTest(
  "integration task-only restriction stays scoped to integracao routes and preserves own tasks",
  () => {
    const integrationRestrictedProfiles = [
      { type: "user", modules: { integracao: 0, contabil: 1 } },
      { type: "user", modules: { integracao: 0, contabil: 2 } },
      { type: "user", modules: { integracao: 0, contabil: 3 } },
    ];
    const owner = { type: "owner", modules: { integracao: 0, contabil: 3 } };

    for (const subject of integrationRestrictedProfiles) {
      assert.equal(
        isIntegrationTasksOnlyRouteBlocked("integracao", "/tasks", subject),
        false,
        "Minhas tarefas deve permanecer acessível para integração=0.",
      );
      assert.equal(
        isIntegrationTasksOnlyRouteBlocked("integracao", "/clients/123", subject),
        true,
        "Clientes deve permanecer bloqueado para integração=0.",
      );
      assert.equal(
        isIntegrationTasksOnlyRouteBlocked("integracao", "/projects/123", subject),
        true,
        "Projetos deve permanecer bloqueado para integração=0.",
      );
      assert.equal(
        isIntegrationTasksOnlyRouteBlocked("contabil", "/contabil", subject),
        false,
        "Contábil não pode herdar o bloqueio de integração=0.",
      );
    }

    assert.equal(
      isIntegrationTasksOnlyRouteBlocked("integracao", "/clients/123", owner),
      false,
      "Owner não pode ser restrito pelo guard de integração=0.",
    );
  },
);

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function getFunctionSource(source, functionName) {
  const start = source.indexOf(`const ${functionName} =`);
  assert.notEqual(start, -1);

  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1);

  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];

    if (character === "{") {
      depth += 1;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        const end = source.indexOf(";", index);
        assert.notEqual(end, -1);

        return source.slice(start, end + 1);
      }
    }
  }

  assert.fail(`Function ${functionName} was not closed`);
}

const authContextSource = await readFile(
  new URL("../../context/AuthContext.tsx", import.meta.url),
  "utf8",
);
const appShellSource = await readFile(
  new URL("../../shared/components/newLayout/AppShell.tsx", import.meta.url),
  "utf8",
);
const appSource = await readFile(new URL("../../pages/_app.tsx", import.meta.url), "utf8");
const administracaoSource = await readFile(
  new URL("../../shared/components/newLayout/Administracao.tsx", import.meta.url),
  "utf8",
);
const rhPermissionsSource = await readFile(
  new URL("../rh/hooks/useRhPermissions.ts", import.meta.url),
  "utf8",
);
const canSSRAuthSource = await readFile(new URL("./utils/canSSRAuth.ts", import.meta.url), "utf8");
const rootPageSource = await readFile(new URL("../../pages/index.tsx", import.meta.url), "utf8");
const globalStylesSource = await readFile(
  new URL("../../styles/global.css", import.meta.url),
  "utf8",
);
const quickActionsSource = await readFile(
  new URL("../dashboard/components/QuickActions.tsx", import.meta.url),
  "utf8",
);
const marketingPageSource = await readFile(
  new URL("../../pages/marketing/index.tsx", import.meta.url),
  "utf8",
);
const parcelamentoPageSource = await readFile(
  new URL("../../pages/parcelamento/index.tsx", import.meta.url),
  "utf8",
);
const triagemPageSource = await readFile(
  new URL("../../pages/triagem.tsx", import.meta.url),
  "utf8",
);
const commercialPageSource = await readFile(
  new URL("../../pages/comercial/index.tsx", import.meta.url),
  "utf8",
);
const clientCommercialPageSource = await readFile(
  new URL("../../pages/clients/[id]/commercial.tsx", import.meta.url),
  "utf8",
);
const clientDetailPageSource = await readFile(
  new URL("../../pages/clients/[id].tsx", import.meta.url),
  "utf8",
);
const permissionConfigSource = await readFile(
  new URL("../users/constants/permissionConfig.ts", import.meta.url),
  "utf8",
);
const createUserConfigSource = await readFile(
  new URL("../users/constants/createUserConfig.ts", import.meta.url),
  "utf8",
);

await (async () => {
  await runTest("isAdminPermission allows administrative levels from 2 and above", () => {
    assert.equal(isAdminPermission(2), true);
    assert.equal(isAdminPermission(100), true);
    assert.equal(isAdminPermission(500), true);
    assert.equal(isAdminPermission(999), true);
    assert.equal(isAdminPermission(1), false);
    assert.equal(isAdminPermission(0), false);
    assert.equal(isAdminPermission(null), false);
  });

  await runTest("administration access allows owners and RH admins only", () => {
    assert.equal(canAccessAdministration(2), false);
    assert.equal(canAccessAdministration(100), false);
    assert.equal(canAccessAdministration(1), false);
    assert.equal(canAccessAdministration({ permission: 2, type: "owner" }), true);
    assert.equal(canAccessAdministration({ permission: 2, type: "admin" }), false);
    assert.equal(
      canAccessAdministration({ permission: 2, type: "admin", modules: { rh: 3 } }),
      true,
    );
    assert.equal(
      canAccessAdministration({ permission: 2, type: "admin", modules: { comercial: 2 } }),
      false,
    );
    assert.equal(
      canAccessAdministration({ permission: 2, type: "admin" }, { departmentModule: "rh" }),
      false,
    );
    assert.equal(
      canAccessAdministration({ permission: 1, type: "admin" }, { departmentModule: "rh" }),
      false,
    );
    assert.equal(
      canAccessAdministration({ permission: 2, type: "admin" }, { rhAccess: { isAdmin: true } }),
      true,
    );
    assert.equal(canAccessAdministration({ permission: 2, type: "user" }), false);
    assert.equal(canAccessAdministration({ permission: 999, type: null }), false);
    assert.equal(canAccessAdministration({ permission: 2 }), false);
    assert.equal(canAccessAdministration({ permission: 1 }), false);
    assert.equal(canAccessAdministration({ permission: 1, modules: { rh: 3 } }), true);
    assert.equal(canAccessAdministration({ permission: 1, modules: { rh: 1 } }), false);
    assert.equal(canAccessAdministration(undefined), false);
  });

  await runTest("user creation and organization owner creation use different gates", () => {
    assert.equal(canCreateUsers({ permission: 2, type: "owner" }), true);
    assert.equal(canCreateUsers({ permission: 2, type: "admin", modules: { rh: 3 } }), true);
    assert.equal(
      canCreateUsers({ permission: 2, type: "admin" }, { departmentModule: "rh" }),
      false,
    );
    assert.equal(canCreateUsers({ permission: 2, type: "admin", modules: { rh: 1 } }), false);
    assert.equal(
      canCreateUsers({ permission: 2, type: "admin", modules: { comercial: 2 } }),
      false,
    );
    assert.equal(canCreateOrganizationOwner({ permission: 2, type: "owner" }), true);
    assert.equal(
      canCreateOrganizationOwner({ permission: 2, type: "admin", modules: { rh: 2 } }),
      false,
    );
    assert.equal(canCreateOrganizationOwner({ permission: 999, type: null }), false);
  });

  await runTest("isOrganizationOwner accepts only explicit owners", () => {
    assert.equal(isOrganizationOwner({ permission: 2, type: "owner" }), true);
    assert.equal(isOrganizationOwner({ permission: 2, type: "admin" }), false);
    assert.equal(isOrganizationOwner({ permission: 2, type: null }), false);
    assert.equal(isOrganizationOwner(2), false);
    assert.equal(isOrganizationOwner(1), false);
  });

  await runTest("app shell checks full user access for administration navigation", () => {
    assert.match(
      appShellSource,
      /const accessUser = isPlatformSuperAdmin \? user : meQuery\.data \?\? user;/,
    );
    assert.match(appShellSource, /canAccessAdministration\(accessUser, \{ rhAccess \}\)/);
  });

  await runTest("dashboard navigation requires access to at least one module", () => {
    const noAccessMap = Object.fromEntries(
      MODULE_KEYS.map((moduleKey) => [moduleKey, { canView: false }]),
    );

    assert.equal(hasAnyModuleAccess(noAccessMap), false);
    assert.equal(hasAnyModuleAccess({ ...noAccessMap, rh: { canView: true } }), true);
    assert.match(appShellSource, /hasAnyModuleAccess\(moduleAccessMap\)/);
  });

  await runTest("access store isolates snapshots by active organization", () => {
    const initialState = getAccessStoreState();
    const [fixtureA, fixtureB] = INTEGRACAO_QA_FIXTURES;
    const organizationA = {
      ...initialState,
      isInitialized: true,
      user: createAccessStoreUserSnapshot({
        id: fixtureA.users[1].id,
        permission: fixtureA.users[1].level,
        organization_id: fixtureA.organization.id,
        modules: { integracao: fixtureA.users[1].level },
      }),
    };
    const organizationB = {
      ...organizationA,
      user: createAccessStoreUserSnapshot({
        id: fixtureB.users[1].id,
        permission: fixtureB.users[1].level,
        organization_id: fixtureB.organization.id,
        modules: { integracao: fixtureB.users[1].level },
      }),
    };

    assert.equal(shouldSyncAccessStore(organizationA, organizationB), true);
    setAccessStoreState(organizationA);
    assert.equal(getAccessStoreState().user?.organization_id, fixtureA.organization.id);
    setAccessStoreState(organizationB);
    assert.equal(getAccessStoreState().user?.organization_id, fixtureB.organization.id);
    resetAccessStoreState();
  });

  await runTest("resolveModuleAccess does not turn department admin into global admin", () => {
    assert.deepEqual(
      resolveModuleAccess({
        userPermission: 2,
        departmentModule: "regularize",
        module: "financeiro",
      }),
      {
        level: "none",
        canView: false,
        canEdit: false,
        isAdmin: false,
        source: "none",
      },
    );
  });

  await runTest("resolveModuleAccess grants global admin only when owner scope is explicit", () => {
    assert.deepEqual(
      resolveModuleAccess({
        userPermission: 0,
        departmentModule: "regularize",
        module: "financeiro",
        isGlobalAdmin: true,
      }),
      {
        level: "admin",
        canView: true,
        canEdit: true,
        isAdmin: true,
        source: "admin",
      },
    );
  });

  await runTest("resolveModuleAccess ignores department and global permission levels", () => {
    assert.deepEqual(
      resolveModuleAccess({
        userPermission: 1,
        departmentModule: "regularize",
        module: "regularize",
      }),
      {
        level: "none",
        canView: false,
        canEdit: false,
        isAdmin: false,
        source: "none",
      },
    );
  });

  await runTest("resolveModuleAccess uses the persisted module level", () => {
    assert.deepEqual(
      resolveModuleAccess({
        userPermission: 1,
        departmentModule: "rh",
        module: "rh",
        additionalModulePermissions: {
          rh: 2,
        },
      }),
      {
        level: "edit",
        canView: true,
        canEdit: true,
        isAdmin: false,
        source: "additional-module",
      },
    );
  });

  await runTest("resolveModuleAccess maps zero and invalid levels to no access", () => {
    assert.deepEqual(
      resolveModuleAccess({
        userPermission: -1,
        departmentModule: "rh",
        module: "rh",
        additionalModulePermissions: { rh: 0 },
      }),
      {
        level: "none",
        canView: false,
        canEdit: false,
        isAdmin: false,
        source: "none",
      },
    );

    assert.deepEqual(
      resolveModuleAccess({
        userPermission: 0,
        departmentModule: "rh",
        module: "rh",
        additionalModulePermissions: { rh: 99 },
      }),
      {
        level: "none",
        canView: false,
        canEdit: false,
        isAdmin: false,
        source: "none",
      },
    );
  });

  await runTest("resolveModuleAccess grants additional module access outside department", () => {
    assert.deepEqual(
      resolveModuleAccess({
        userPermission: 0,
        departmentModule: "regularize",
        module: "financeiro",
        additionalModulePermissions: {
          financeiro: 1,
        },
      }),
      {
        level: "view",
        canView: true,
        canEdit: false,
        isAdmin: false,
        source: "additional-module",
      },
    );
  });

  await runTest(
    "resolveModuleAccess denies modules without department or additional permission",
    () => {
      assert.deepEqual(
        resolveModuleAccess({
          userPermission: 0,
          departmentModule: "regularize",
          module: "financeiro",
        }),
        {
          level: "none",
          canView: false,
          canEdit: false,
          isAdmin: false,
          source: "none",
        },
      );
    },
  );

  await runTest("disabled modules are blocked even for global admins", () => {
    assert.deepEqual([...DISABLED_MODULE_KEYS].sort(), ["comercial", "marketing", "triagem"]);

    for (const moduleKey of DISABLED_MODULE_KEYS) {
      assert.equal(isModuleDisabled(moduleKey), true);
      assert.deepEqual(
        resolveModuleAccess({
          module: moduleKey,
          isGlobalAdmin: true,
          additionalModulePermissions: { [moduleKey]: 2 },
        }),
        {
          level: "none",
          canView: false,
          canEdit: false,
          isAdmin: false,
          source: "none",
        },
      );
    }
  });

  await runTest("module access helpers normalize aliases and additional permission levels", () => {
    assert.equal(resolveDepartmentModuleKey("Departamento Pessoal"), "pessoal");
    assert.equal(resolveDepartmentModuleKey("Tecnologia"), "ti");
    assert.equal(resolveDepartmentModuleKey("Atendimento"), null);
    assert.equal(resolveDepartmentModuleKey("PEC"), null);
    assert.equal(resolveDepartmentModuleKey("Wiki"), null);
    assert.equal(resolveAccessLevelFromAdditionalPermission(3), "admin");
    assert.equal(resolveAccessLevelFromAdditionalPermission(2), "edit");
    assert.equal(resolveAccessLevelFromAdditionalPermission(1), "view");
    assert.equal(resolveAccessLevelFromAdditionalPermission(0), "none");
    assert.equal(resolveAccessLevelFromAdditionalPermission(null), "none");
  });

  await runTest("integration routes require integration module access", () => {
    assert.equal(APP_ROUTE_MODULE_MAP["/clients"], "integracao");
    assert.equal(APP_ROUTE_MODULE_MAP["/projects"], "integracao");
    assert.equal(APP_ROUTE_MODULE_MAP["/tasks"], "integracao");
    assert.equal(APP_ROUTE_MODULE_MAP["/configs/integracao"], "integracao");
  });

  await runTest("iframe views retain module access protection", () => {
    assert.match(appSource, /<AppLayout isIframeView=\{isIframeView\}>/);
    assert.match(
      appShellSource,
      /if \(isIframeView\) \{\s*return <div[^>]*>\{mainContent\}<\/div>;/,
    );
  });

  await runTest(
    "app shell uses module hook for menu visibility instead of raw access store",
    () => {
      assert.match(appShellSource, /useModuleAccessMap\(MODULE_KEYS\)/);
      assert.equal(appShellSource.includes("useAccessStore("), false);
      assert.match(
        appShellSource,
        /const accessUser = isPlatformSuperAdmin \? user : meQuery\.data \?\? user/,
      );
      assert.match(appShellSource, /canAccessAdministration\(accessUser,\s*\{\s*rhAccess\s*\}\)/);
      assert.match(appShellSource, /const rhAccess = moduleAccessMap\.rh/);
      assert.match(appShellSource, /getNavigationModuleName\(module, moduleAccessUser\)/);
    },
  );

  await runTest("disabled modules are not registered in navigation or quick actions", () => {
    for (const blockedPath of ["/comercial", "/marketing", "/triagem"]) {
      assert.equal(appShellSource.includes(`path: "${blockedPath}"`), false);
      assert.equal(quickActionsSource.includes(`href: "${blockedPath}"`), false);
    }
  });

  await runTest(
    "disabled module pages return not found without importing module implementations",
    () => {
      for (const source of [
        commercialPageSource,
        clientCommercialPageSource,
        marketingPageSource,
        triagemPageSource,
      ]) {
        assert.match(source, /notFound:\s*true/);
      }

      assert.equal(commercialPageSource.includes("newLayout/Commercial"), false);
      assert.equal(clientCommercialPageSource.includes("ClientCommercialForm"), false);
      assert.equal(clientCommercialPageSource.includes("useUpdateClientCommercialMutation"), false);
      assert.equal(marketingPageSource.includes("newLayout/Marketing"), false);
      assert.equal(triagemPageSource.includes("newLayout/Triagem"), false);
      assert.match(parcelamentoPageSource, /ParcelamentoShell/);
    },
  );

  await runTest("disabled commercial flow is not linked from client details", () => {
    assert.equal(
      clientDetailPageSource.includes("href={`/clients/${client.id}/commercial`}"),
      false,
    );
    assert.equal(clientDetailPageSource.includes("Abrir comercial"), false);
  });

  await runTest("active modules remain configurable while retired modules are absent", () => {
    for (const moduleKey of DISABLED_MODULE_KEYS) {
      assert.equal(permissionConfigSource.includes(`"${moduleKey}"`), true);
      assert.equal(createUserConfigSource.includes(`key: "${moduleKey}"`), true);
    }
    for (const moduleKey of ["atendimento", "pec", "wiki"]) {
      assert.equal(permissionConfigSource.includes(`  "${moduleKey}":`), false);
      assert.equal(createUserConfigSource.includes(`key: "${moduleKey}"`), false);
    }
  });

  await runTest(
    "app shell renders an explicit forbidden state for inaccessible module routes",
    () => {
      assert.match(appShellSource, /Você não tem acesso a este módulo no perfil atual\./);
      assert.match(appShellSource, /canViewIntegrationRoute\(pathname, moduleAccessUser\)/);
      assert.match(appShellSource, /!canViewCurrentModuleRoute/);
    },
  );

  await runTest("app shell holds module route children while module access is loading", () => {
    assert.match(
      appShellSource,
      /shouldRenderModuleAccessLoading\s*=\s*Boolean\(currentModuleKey\)\s*&&\s*isModuleAccessLoading/,
    );
    assert.match(
      appShellSource,
      /shouldRenderModuleAccessLoading\s*\?\s*\(\s*<ModuleAccessLoadingState\s*\/>/,
    );
    assert.match(
      appShellSource,
      /:\s*shouldRenderModuleAccessDenied\s*\?\s*\(\s*<ModuleAccessDeniedState/,
    );
  });

  await runTest("app shell keeps module navigation stable while module access is loading", () => {
    assert.match(appShellSource, /isModuleAccessCategory:\s*true/);
    assert.match(appShellSource, /function ModuleNavLoadingItem/);
    assert.match(appShellSource, /shouldRenderModuleNavLoading/);
    assert.equal(appShellSource.includes("isModuleAccessLoading) {\n      return false;"), false);
    assert.equal(
      appShellSource.includes("isModuleAccessLoading) {\n          return false;"),
      false,
    );
  });

  await runTest("canSSRAuth redirects unauthenticated users to login", () => {
    assert.match(canSSRAuthSource, /if\s*\(\s*!session\s*\)/);
    assert.match(canSSRAuthSource, /destination:\s*["']\/login["']/);
  });

  await runTest("root route validates the session before redirecting to dashboard", () => {
    assert.match(rootPageSource, /canSSRAuth/);
    assert.match(rootPageSource, /setupAPIClient\(ctx\)/);
    assert.match(rootPageSource, /apiClient\.get\(["']\/user\/me["']\)/);
    assert.match(rootPageSource, /destination:\s*["']\/dashboard["']/);
    assert.equal(rootPageSource.includes("Home"), false);
  });

  await runTest("session transition loader crosses the full track", () => {
    assert.match(globalStylesSource, /@keyframes session-load/);
    assert.match(globalStylesSource, /translateX\(-100%\)/);
    assert.match(globalStylesSource, /translateX\(300%\)/);
    assert.equal(globalStylesSource.includes("translateX(115%)"), false);
  });

  await runTest("auth diagnostics are hidden in production", () => {
    assert.match(authContextSource, /process\.env\.NODE_ENV !== "production"/);
    assert.match(authContextSource, /function logAuthError/);
    assert.equal(authContextSource.includes("fullError"), false);
    assert.equal(authContextSource.includes("URL:"), false);
    assert.equal(authContextSource.includes('console.error("Erro de conex'), false);
    assert.equal(authContextSource.includes('console.error("Erro do servidor'), false);
    assert.equal(authContextSource.includes('console.error("Erro de autentica'), false);
  });

  await runTest("sessão inválida encerra o loading e orienta o retorno ao login", () => {
    assert.match(
      authContextSource,
      /function signOut\(message = "Sessão expirada\. Faça login novamente\."\)[\s\S]*toast\.error\(message,\s*\{\s*toastId: "auth-session-expired"/,
    );
    assert.match(authContextSource, /registerAuthInvalidationHandler/);
    assert.match(authContextSource, /setUser\(null\);/);
    assert.match(
      authContextSource,
      /queryClient\.removeQueries\(\{ queryKey: ME_QUERY_KEY \}\);/,
    );
    assert.match(authContextSource, /isCurrentAuthTransition\(requestVersion\)\)/);
    assert.match(authContextSource, /finally[\s\S]*setLoading\(false\)/);
  });

  await runTest("invalidação de sessão notifica o estado autenticado em runtime", () => {
    let invalidationCount = 0;
    const unregister = registerAuthInvalidationHandler(() => {
      invalidationCount += 1;
    });

    try {
      invalidateAuthSession();
      assert.equal(invalidationCount, 1);
    } finally {
      unregister();
    }
  });

  await runTest("invalidação de sessão aplica todas as transições em runtime", () => {
    const events = [];
    const handler = createAuthInvalidationHandler({
      invalidateRequests: () => events.push("invalidate-requests"),
      clearUser: () => events.push("clear-user"),
      stopLoading: () => events.push("stop-loading"),
      clearCache: () => events.push("clear-cache"),
    });

    handler();

    assert.deepEqual(events, [
      "invalidate-requests",
      "clear-user",
      "stop-loading",
      "clear-cache",
    ]);
  });

  await runTest("rotas protegidas redirecionam quando não há sessão", () => {
    assert.match(
      appSource,
      /useEffect\(\(\) => \{[\s\S]*if \(isPublicRoute \|\| loading \|\| user\) \{[\s\S]*return;[\s\S]*\}[\s\S]*void router\.push\("\/login"\)/,
    );
  });

  await runTest(
    "admin permission updates require a new login when editing self",
    () => {
      assert.match(authContextSource, /refreshSession:\s*\(\)\s*=>\s*Promise<UserProps \| null>/);
      assert.match(authContextSource, /async function refreshSession\(\)/);
      assert.match(authContextSource, /<AuthContext\.Provider value=\{\{/);
      assert.match(authContextSource, /signIn,\s*signInPlatform,\s*logoutUser,\s*logoutPlatform/);
      assert.match(authContextSource, /refreshSession,\s*refreshPlatformSession,\s*loading/);
      assert.match(administracaoSource, /import \{ signOut, useAuth \} from "@\/context\/AuthContext";/);
      assert.match(administracaoSource, /const \{ user \} = useAuth\(\);/);
      assert.match(
        administracaoSource,
        /if \(selectedPermissionUserId === user\?\.id\) \{[\s\S]*signOut\("Permissões atualizadas\. Entre novamente para aplicar os novos acessos\."\);[\s\S]*return;[\s\S]*\}/,
      );
      assert.doesNotMatch(administracaoSource, /refreshSession/);
      assert.match(
        authContextSource,
        /await queryClient\.invalidateQueries\(\{ queryKey: ME_QUERY_KEY \}\);/,
      );
      assert.equal(
        authContextSource.includes("queryClient.setQueryData(ME_QUERY_KEY, currentUser)"),
        false,
      );
      assert.equal(administracaoSource.includes("accessStoreActions.syncFromToken"), false);
    },
  );

  await runTest("admin permission updates invalidate cached permission data after save", () => {
    assert.match(
      administracaoSource,
      /queryClient\.invalidateQueries\(\{[\s\S]*queryKey:\s*\["admin", "permissions", selectedPermissionUserId\],[\s\S]*\}\)/,
    );
    assert.match(administracaoSource, /invalidateAdminUserLists\(\)/);
    const handleSavePermissionsSource = getFunctionSource(
      administracaoSource,
      "handleSavePermissions",
    );

    assert.equal(handleSavePermissionsSource.includes("refetchPermissionUsers"), false);
  });

  await runTest("admin permissions tab is available only to organization owners", () => {
    assert.match(administracaoSource, /const canManagePermissions = canManageOrganizationOwners;/);
    assert.equal(
      administracaoSource.includes("const canManagePermissions = hasAdminAccess;"),
      false,
    );
  });

  await runTest(
    "admin create user action uses native disabled state when context is unavailable",
    () => {
      assert.match(administracaoSource, /disabled=\{isCreateBlockedByDepartments\}/);
      assert.equal(
        administracaoSource.includes("aria-disabled={isCreateBlockedByDepartments}"),
        false,
      );
    },
  );

  await runTest("admin dashboard uses real permission metrics", () => {
    assert.equal(administracaoSource.includes('title: "Perfis de Acesso"'), false);
    assert.equal(administracaoSource.includes("value: 12"), false);
    assert.match(administracaoSource, /const managedModulesCount = useMemo\(\(\) => \{/);
    assert.match(administracaoSource, /PERMISSION_MODULE_GROUPS\.reduce/);
    assert.match(administracaoSource, /title: "Módulos gerenciados"/);
    assert.match(administracaoSource, /value: managedModulesCount/);
  });

  await runTest("admin permissions list supports scoped user search", () => {
    assert.match(
      administracaoSource,
      /const \[permissionSearchTerm, setPermissionSearchTerm\] = useState\(""\);/,
    );
    assert.match(administracaoSource, /const filteredPermissionUsers = useMemo\(\(\) => \{/);
    assert.match(administracaoSource, /normalizeSearchText\(permissionSearchTerm\)/);
    assert.match(administracaoSource, /filteredPermissionUsers\.length/);
    assert.match(administracaoSource, /filteredPermissionUsers\.map/);
    assert.match(administracaoSource, /placeholder="Buscar usuário ativo"/);
    assert.match(
      administracaoSource,
      /onChange=\{\(event\) => setPermissionSearchTerm\(event\.target\.value\)\}/,
    );
  });

  await runTest("admin permissions editor uses explicit save copy and stable saving state", () => {
    assert.match(
      administracaoSource,
      /\{filteredPermissionUsers\.length\} de \{permissionUsers\.length\} usuário/,
    );
    assert.match(administracaoSource, /Salvar permissões/);
    assert.equal(administracaoSource.includes(': "Salvar"'), false);
    assert.match(
      administracaoSource,
      /<select[\s\S]*disabled=\{isSelectedPermissionOwner \|\| isSavingPermissions\}/,
    );
  });
  await runTest("RH permissions hook delegates to the shared capability contract", () => {
    const userCapabilities = resolveRhPermissionCapabilities(2, false);
    const noAccessCapabilities = resolveRhPermissionCapabilities(0, false);
    const adminCapabilities = resolveRhPermissionCapabilities(3, false);
    const globalAdminCapabilities = resolveRhPermissionCapabilities(0, true);

    assert.match(rhPermissionsSource, /resolveRhPermissionCapabilities/);
    assert.match(
      rhPermissionsSource,
      /const capabilities = resolveRhPermissionCapabilities\(explicitRhPermission, isGlobalAdmin\);/,
    );
    assert.match(
      rhPermissionsSource,
      /canViewRhDashboard:\s*capabilities\.canViewRhDashboard/,
    );

    assert.deepEqual(userCapabilities, {
      canAccessRhPortal: true,
      canUseRhWorkflowMessages: true,
      canViewRhDashboard: false,
      canManageRh: false,
      canManageRhRequests: false,
      canManageRhScore: false,
      canManageRhTimeBank: false,
      canManageRhTimesheets: false,
      canManageRhWorkday: false,
    });
    assert.equal(noAccessCapabilities.canAccessRhPortal, false);
    assert.equal(noAccessCapabilities.canManageRh, false);
    assert.equal(adminCapabilities.canViewRhDashboard, true);
    assert.equal(adminCapabilities.canManageRh, true);
    assert.equal(globalAdminCapabilities.canAccessRhPortal, true);
    assert.equal(globalAdminCapabilities.canManageRh, true);
  });
})();
