import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { AuthTokenError } from "../../shared/services/errors/AuthTokenError.ts";
import { canSSRAdmin } from "./utils/canSSRAdmin.ts";
import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_COOKIE_NAME,
  getAuthCookieOptions,
} from "./utils/authCookie.ts";
import { createBearerAuthHeaders, getAuthTokenValue } from "./utils/authHeaders.ts";
import {
  canAccessAdministration,
  canCreateOrganizationOwner,
  canCreateUsers,
  isAdminPermission,
  isOrganizationOwner,
} from "./utils/permissions.ts";
import {
  resolveAccessLevelFromAdditionalPermission,
  resolveDepartmentModuleKey,
  resolveModuleAccess,
} from "./utils/moduleAccess.ts";

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

function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

function createSsrContext(token) {
  const headers = {};

  if (token) {
    headers.cookie = `cw.token=${token}`;
  }

  return {
    req: {
      headers,
    },
    res: {
      getHeader() {
        return undefined;
      },
      setHeader() {},
    },
  };
}

const authContextSource = await readFile(
  new URL("../../context/AuthContext.tsx", import.meta.url),
  "utf8",
);
const appShellSource = await readFile(
  new URL("../../shared/components/newLayout/AppShell.tsx", import.meta.url),
  "utf8",
);
const administracaoSource = await readFile(
  new URL("../../shared/components/newLayout/Administracao.tsx", import.meta.url),
  "utf8",
);
const rhPermissionsSource = await readFile(
  new URL("../rh/hooks/useRhPermissions.ts", import.meta.url),
  "utf8",
);
const canSSRAuthSource = await readFile(
  new URL("./utils/canSSRAuth.ts", import.meta.url),
  "utf8",
);
const rootPageSource = await readFile(new URL("../../pages/index.tsx", import.meta.url), "utf8");
const globalStylesSource = await readFile(
  new URL("../../styles/global.css", import.meta.url),
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
    assert.equal(canAccessAdministration(2), true);
    assert.equal(canAccessAdministration(100), true);
    assert.equal(canAccessAdministration(1), false);
    assert.equal(canAccessAdministration({ permission: 2, type: "owner" }), true);
    assert.equal(canAccessAdministration({ permission: 2, type: "admin" }), false);
    assert.equal(canAccessAdministration({ permission: 2, type: "admin", modules: { rh: 2 } }), true);
    assert.equal(canAccessAdministration({ permission: 2, type: "admin", modules: { comercial: 2 } }), false);
    assert.equal(canAccessAdministration({ permission: 2, type: "admin" }, { departmentModule: "rh" }), true);
    assert.equal(canAccessAdministration({ permission: 1, type: "admin" }, { departmentModule: "rh" }), false);
    assert.equal(canAccessAdministration({ permission: 2, type: "admin" }, { rhAccess: { isAdmin: true } }), true);
    assert.equal(canAccessAdministration({ permission: 2, type: "user" }), false);
    assert.equal(canAccessAdministration({ permission: 999, type: null }), true);
    assert.equal(canAccessAdministration({ permission: 2 }), true);
    assert.equal(canAccessAdministration({ permission: 1 }), false);
    assert.equal(canAccessAdministration({ permission: 1, modules: { rh: 2 } }), true);
    assert.equal(canAccessAdministration({ permission: 1, modules: { rh: 1 } }), false);
    assert.equal(canAccessAdministration(undefined), false);
  });

  await runTest("user creation and organization owner creation use different gates", () => {
    assert.equal(canCreateUsers({ permission: 2, type: "owner" }), true);
    assert.equal(canCreateUsers({ permission: 2, type: "admin", modules: { rh: 2 } }), true);
    assert.equal(canCreateUsers({ permission: 2, type: "admin" }, { departmentModule: "rh" }), true);
    assert.equal(canCreateUsers({ permission: 2, type: "admin", modules: { rh: 1 } }), false);
    assert.equal(canCreateUsers({ permission: 2, type: "admin", modules: { comercial: 2 } }), false);
    assert.equal(canCreateOrganizationOwner({ permission: 2, type: "owner" }), true);
    assert.equal(canCreateOrganizationOwner({ permission: 2, type: "admin", modules: { rh: 2 } }), false);
    assert.equal(canCreateOrganizationOwner({ permission: 999, type: null }), true);
  });

  await runTest("isOrganizationOwner accepts explicit owners and numeric legacy fallback", () => {
    assert.equal(isOrganizationOwner({ permission: 2, type: "owner" }), true);
    assert.equal(isOrganizationOwner({ permission: 2, type: "admin" }), false);
    assert.equal(isOrganizationOwner({ permission: 2, type: null }), true);
    assert.equal(isOrganizationOwner(2), true);
    assert.equal(isOrganizationOwner(1), false);
  });

  await runTest("app shell checks full user access for administration navigation", () => {
    assert.match(appShellSource, /const accessUser = meQuery\.data \?\? user;/);
    assert.match(appShellSource, /canAccessAdministration\(accessUser, \{ rhAccess \}\)/);
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

  await runTest("resolveModuleAccess grants department access from user permission level", () => {
    assert.deepEqual(
      resolveModuleAccess({
        userPermission: 1,
        departmentModule: "regularize",
        module: "regularize",
      }),
      {
        level: "edit",
        canView: true,
        canEdit: true,
        isAdmin: false,
        source: "department",
      },
    );
  });

  await runTest("resolveModuleAccess honors explicit department module permission", () => {
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
        level: "admin",
        canView: true,
        canEdit: true,
        isAdmin: true,
        source: "department",
      },
    );
  });

  await runTest("resolveModuleAccess allows denied department permission to remove the module", () => {
    assert.deepEqual(
      resolveModuleAccess({
        userPermission: -1,
        departmentModule: "rh",
        module: "rh",
        additionalModulePermissions: {
          rh: null,
        },
      }),
      {
        level: "none",
        canView: false,
        canEdit: false,
        isAdmin: false,
        source: "department",
      },
    );

    assert.deepEqual(
      resolveModuleAccess({
        userPermission: 0,
        departmentModule: "rh",
        module: "rh",
        additionalModulePermissions: {
          rh: null,
        },
      }),
      {
        level: "view",
        canView: true,
        canEdit: false,
        isAdmin: false,
        source: "department",
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
        level: "edit",
        canView: true,
        canEdit: true,
        isAdmin: false,
        source: "additional-module",
      },
    );
  });

  await runTest("resolveModuleAccess denies modules without department or additional permission", () => {
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
  });

  await runTest("module access helpers normalize aliases and additional permission levels", () => {
    assert.equal(resolveDepartmentModuleKey("Departamento Pessoal"), "pessoal");
    assert.equal(resolveDepartmentModuleKey("Tecnologia"), "ti");
    assert.equal(resolveAccessLevelFromAdditionalPermission(2), "admin");
    assert.equal(resolveAccessLevelFromAdditionalPermission(1), "edit");
    assert.equal(resolveAccessLevelFromAdditionalPermission(0), "view");
    assert.equal(resolveAccessLevelFromAdditionalPermission(null), "none");
  });

  await runTest("app shell uses module hook for menu visibility instead of raw access store", () => {
    assert.match(appShellSource, /useModuleAccessMap\(MODULE_KEYS\)/);
    assert.equal(appShellSource.includes("useAccessStore("), false);
    assert.match(appShellSource, /const accessUser = meQuery\.data \?\? user/);
    assert.match(appShellSource, /canAccessAdministration\(accessUser,\s*\{\s*rhAccess\s*\}\)/);
    assert.match(appShellSource, /const rhAccess = moduleAccessMap\.rh/);
  });

  await runTest("app shell renders an explicit forbidden state for inaccessible module routes", () => {
    assert.match(appShellSource, /Você não tem acesso a este módulo no perfil atual\./);
    assert.match(appShellSource, /currentModuleAccess\?\.canView === false/);
  });

  await runTest("app shell holds module route children while module access is loading", () => {
    assert.match(
      appShellSource,
      /shouldRenderModuleAccessLoading\s*=\s*Boolean\(currentModuleKey\)\s*&&\s*isModuleAccessLoading/,
    );
    assert.match(appShellSource, /shouldRenderModuleAccessLoading\s*\?\s*<ModuleAccessLoadingState \/>/);
    assert.match(appShellSource, /:\s*shouldRenderModuleAccessDenied\s*\?\s*<ModuleAccessDeniedState \/>/);
  });

  await runTest("app shell keeps module navigation stable while module access is loading", () => {
    assert.match(appShellSource, /isModuleAccessCategory:\s*true/);
    assert.match(appShellSource, /function ModuleNavLoadingItem/);
    assert.match(appShellSource, /shouldRenderModuleNavLoading/);
    assert.equal(appShellSource.includes("isModuleAccessLoading) {\n      return false;"), false);
    assert.equal(appShellSource.includes("isModuleAccessLoading) {\n          return false;"), false);
  });

  await runTest("canSSRAuth redirects unauthenticated users to login", () => {
    assert.match(canSSRAuthSource, /if\s*\(\s*!token\s*\)/);
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

  await runTest("canSSRAdmin redirects unauthenticated users to login", async () => {
    const guard = canSSRAdmin(async () => ({ props: { ok: true } }));
    const result = await guard(createSsrContext());

    assert.deepEqual(result, {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    });
  });

  await runTest("canSSRAdmin redirects non-admin users to dashboard without executing the page", async () => {
    let called = false;
    const guard = canSSRAdmin(async () => {
      called = true;
      return { props: { ok: true } };
    });

    const result = await guard(createSsrContext(createToken({ permission: 1 })));

    assert.equal(called, false);
    assert.deepEqual(result, {
      redirect: {
        destination: "/dashboard",
        permanent: false,
      },
    });
  });

  await runTest("canSSRAdmin can render a forbidden state instead of redirecting", async () => {
    const guard = canSSRAdmin(
      async () => ({ props: { ok: true } }),
      {
        onForbidden: () => ({ props: { forbidden: true } }),
      },
    );

    const result = await guard(createSsrContext(createToken({ permission: 1 })));

    assert.deepEqual(result, { props: { forbidden: true } });
  });

  await runTest("canSSRAdmin allows admin users through", async () => {
    const guard = canSSRAdmin(async () => ({ props: { ok: true } }));
    const result = await guard(createSsrContext(createToken({ permission: 2 })));

    assert.deepEqual(result, { props: { ok: true } });
  });

  await runTest("canSSRAdmin allows RH module admins through", async () => {
    const guard = canSSRAdmin(async () => ({ props: { ok: true } }));
    const result = await guard(createSsrContext(createToken({ permission: 1, modules: { rh: 2 } })));

    assert.deepEqual(result, { props: { ok: true } });
  });

  await runTest("canSSRAdmin allows high-permission admins through", async () => {
    const guard = canSSRAdmin(async () => ({ props: { ok: true } }));
    const result = await guard(createSsrContext(createToken({ permission: 999 })));

    assert.deepEqual(result, { props: { ok: true } });
  });

  await runTest("canSSRAdmin redirects auth-token failures to login", async () => {
    const guard = canSSRAdmin(async () => {
      throw new AuthTokenError();
    });

    const result = await guard(createSsrContext(createToken({ permission: 2 })));

    assert.deepEqual(result, {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    });
  });

  await runTest("canSSRAdmin redirects unexpected authorization failures to dashboard", async () => {
    const guard = canSSRAdmin(async () => {
      throw new Error("403 forbidden");
    });

    const result = await guard(createSsrContext(createToken({ permission: 2 })));

    assert.deepEqual(result, {
      redirect: {
        destination: "/dashboard",
        permanent: false,
      },
    });
  });

  await runTest("auth cookie options keep session cookie safe in development", () => {
    assert.equal(AUTH_COOKIE_NAME, "cw.token");
    assert.equal(AUTH_COOKIE_MAX_AGE_SECONDS, 60 * 60 * 24 * 7);
    assert.deepEqual(getAuthCookieOptions("development"), {
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });

  await runTest("auth cookie options enable secure flag in production", () => {
    assert.deepEqual(getAuthCookieOptions("production"), {
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });

  await runTest("auth cookie options allow HTTP develop slots to disable secure flag", () => {
    const previousValue = process.env.NEXT_PUBLIC_AUTH_COOKIE_SECURE;
    process.env.NEXT_PUBLIC_AUTH_COOKIE_SECURE = "false";

    try {
      assert.deepEqual(getAuthCookieOptions("production"), {
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
        sameSite: "lax",
        secure: false,
      });
    } finally {
      if (previousValue === undefined) {
        delete process.env.NEXT_PUBLIC_AUTH_COOKIE_SECURE;
      } else {
        process.env.NEXT_PUBLIC_AUTH_COOKIE_SECURE = previousValue;
      }
    }
  });

  await runTest("auth headers are omitted when token is missing", () => {
    assert.equal(getAuthTokenValue(undefined), null);
    assert.equal(getAuthTokenValue(""), null);
    assert.equal(createBearerAuthHeaders(undefined), null);
    assert.equal(createBearerAuthHeaders(""), null);
  });

  await runTest("auth headers include bearer token when token exists", () => {
    assert.equal(getAuthTokenValue("abc.def.signature"), "abc.def.signature");
    assert.deepEqual(createBearerAuthHeaders("abc.def.signature"), {
      Authorization: "Bearer abc.def.signature",
    });
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

  await runTest("admin permission updates refresh the authenticated session when editing self", () => {
    assert.match(authContextSource, /refreshSession:\s*\(\)\s*=>\s*Promise<UserProps \| null>/);
    assert.match(authContextSource, /async function refreshSession\(\)/);
    assert.match(
      authContextSource,
      /<AuthContext\.Provider value=\{\{ user, isAuthenticated, signIn, logoutUser, refreshSession, loading \}\}/,
    );
    assert.match(administracaoSource, /const \{ user, refreshSession \} = useAuth\(\);/);
    assert.match(
      administracaoSource,
      /if \(selectedPermissionUserId === user\?\.id\) \{[\s\S]*await refreshSession\(\);[\s\S]*\}/,
    );
    assert.match(authContextSource, /await queryClient\.invalidateQueries\(\{ queryKey: ME_QUERY_KEY \}\);/);
    assert.equal(authContextSource.includes("queryClient.setQueryData(ME_QUERY_KEY, currentUser)"), false);
    assert.equal(administracaoSource.includes("accessStoreActions.syncFromToken"), false);
  });

  await runTest("admin permission updates invalidate cached permission data after save", () => {
    assert.match(
      administracaoSource,
      /queryClient\.invalidateQueries\(\{[\s\S]*queryKey:\s*\["admin", "permissions", selectedPermissionUserId\],[\s\S]*\}\)/,
    );
    assert.match(administracaoSource, /invalidateAdminUserLists\(\)/);
    const handleSavePermissionsSource = getFunctionSource(administracaoSource, "handleSavePermissions");

    assert.equal(handleSavePermissionsSource.includes("refetchPermissionUsers"), false);
  });

  await runTest("admin permissions tab is available to RH module admins", () => {
    assert.match(administracaoSource, /const canManagePermissions = hasAdminAccess;/);
    assert.equal(
      administracaoSource.includes("const canManagePermissions = canManageOrganizationOwners;"),
      false,
    );
  });

  await runTest("admin create user action uses native disabled state when context is unavailable", () => {
    assert.match(administracaoSource, /disabled=\{isCreateBlockedByDepartments\}/);
    assert.equal(administracaoSource.includes("aria-disabled={isCreateBlockedByDepartments}"), false);
  });

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
    assert.match(administracaoSource, /\{filteredPermissionUsers\.length\} de \{permissionUsers\.length\} usuário/);
    assert.match(administracaoSource, /Salvar permissões/);
    assert.equal(administracaoSource.includes(': "Salvar"'), false);
    assert.match(
      administracaoSource,
      /<select[\s\S]*disabled=\{isSelectedPermissionOwner \|\| isSavingPermissions\}/,
    );
  });
  await runTest("RH module user permission does not grant administrative dashboard", () => {
    assert.doesNotMatch(rhPermissionsSource, /explicitRhPermission[\s\S]*>=\s*1/);
    assert.match(rhPermissionsSource, /canViewRhDashboard\s*=\s*canManageRh/);
    assert.match(rhPermissionsSource, /canManageRh\s*=\s*hasRhAdminPermission \|\| isGlobalAdmin/);
  });
})();
