import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  APP_ROUTE_MODULE_MAP,
  MODULE_KEYS,
  canViewIntegrationRoute,
  canViewTasksOnlyIntegrationRoute,
  getModulePermissionLevel,
  hasAnyModuleAccess,
  normalizeRoutePath,
  resolveModuleAccess,
} from "./utils/moduleAccess.ts";

const appShellSource = await readFile(
  new URL("../../shared/components/newLayout/AppShell.tsx", import.meta.url),
  "utf8",
);

const getModuleKeyFromRoutePath = compileSnippet(
  extractFunctionDeclaration(appShellSource, "getModuleKeyFromRoutePath"),
  {
    APP_ROUTE_MODULE_MAP,
    moduleCategories: [],
    normalizeRoutePath,
  },
);
const getNavigationModuleName = compileSnippet(
  extractFunctionDeclaration(appShellSource, "getNavigationModuleName"),
  {
    getModulePermissionLevel,
  },
);
const canViewModuleFromPathSource = extractConstInitializer(appShellSource, "canViewModuleFromPath");
const canViewTasksOnlyRouteSource = extractConstInitializer(appShellSource, "canViewTasksOnlyRoute");
const canViewCurrentModuleRouteSource = extractConstInitializer(
  appShellSource,
  "canViewCurrentModuleRoute",
);
const shouldRenderModuleAccessDeniedSource = extractConstInitializer(
  appShellSource,
  "shouldRenderModuleAccessDenied",
);
const deniedFallbackHrefSource = extractJsxPropExpression(appShellSource, "fallbackHref");
const deniedFallbackLabelSource = extractJsxPropExpression(appShellSource, "fallbackLabel");

const integrationRestrictedProfiles = [
  createUser({
    id: "user-integracao-0-contabil-1",
    name: "Contabil View Smoke",
    login: "contabil.view@castelo.test",
    modules: { integracao: 0, contabil: 1 },
  }),
  createUser({
    id: "user-integracao-0-contabil-2",
    name: "Contabil Edit Smoke",
    login: "contabil.edit@castelo.test",
    modules: { integracao: 0, contabil: 2 },
  }),
  createUser({
    id: "user-integracao-0-contabil-3",
    name: "Contabil Admin Smoke",
    login: "contabil.admin@castelo.test",
    modules: { integracao: 0, contabil: 3 },
  }),
];

for (const currentUser of integrationRestrictedProfiles) {
  await runTest(
    `integracao=0 preserves contabil sidebar/url access for contabil=${currentUser.modules.contabil}`,
    () => {
      assertSidebarVisibility(currentUser);
      assertDirectUrlAccess("/contabil", currentUser, {
        shouldRenderDenied: false,
        shouldRestrictToTasksOnly: false,
        shouldViewCurrentRoute: true,
      });
      assertDirectUrlAccess("/clients/123", currentUser, {
        shouldRenderDenied: true,
        shouldRestrictToTasksOnly: true,
        shouldViewCurrentRoute: false,
        expectedFallbackHref: "/tasks",
        expectedFallbackLabel: "Ir para Minhas tarefas",
      });
    },
  );
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function assertSidebarVisibility(currentUser) {
  const context = createViewContext("/contabil", currentUser);
  const canViewModuleFromPath = compileSnippet(canViewModuleFromPathSource, context);

  assert.equal(
    canViewModuleFromPath("/contabil"),
    true,
    "Contábil deve permanecer visível quando integração=0 e contábil>=1.",
  );
  assert.equal(
    canViewModuleFromPath("/tasks"),
    true,
    "Minhas tarefas deve permanecer visível quando integração=0.",
  );
  assert.equal(
    canViewModuleFromPath("/clients"),
    false,
    "Clientes deve permanecer oculto quando integração=0.",
  );
  assert.equal(
    canViewModuleFromPath("/projects"),
    false,
    "Projetos deve permanecer oculto quando integração=0.",
  );
  assert.equal(
    getNavigationModuleName({ name: "Tarefas", path: "/tasks" }, currentUser),
    "Minhas tarefas",
    "O item de tarefas deve continuar renomeado para Minhas tarefas no nível 0 de Integração.",
  );
  assert.equal(
    getNavigationModuleName({ name: "Contábil", path: "/contabil" }, currentUser),
    "Contábil",
    "O item de Contábil deve manter o rótulo original.",
  );
}

function assertDirectUrlAccess(pathname, currentUser, expected) {
  const routeContext = createRouteContext(pathname, currentUser);
  const canViewTasksOnlyRoute = evaluateExpression(canViewTasksOnlyRouteSource, {
    canViewTasksOnlyIntegrationRoute,
    currentModuleKey: routeContext.currentModuleKey,
    moduleAccessUser: currentUser,
    pathname,
  });
  const canViewCurrentModuleRoute = evaluateExpression(canViewCurrentModuleRouteSource, {
    canViewCurrentModuleRoute: undefined,
    canViewIntegrationRoute,
    canViewTasksOnlyRoute,
    currentModuleAccess: routeContext.currentModuleAccess,
    currentModuleKey: routeContext.currentModuleKey,
    moduleAccessUser: currentUser,
    pathname,
  });
  const shouldRenderDenied = evaluateExpression(shouldRenderModuleAccessDeniedSource, {
    Boolean,
    canViewCurrentModuleRoute,
    canViewTasksOnlyRoute,
    currentModuleKey: routeContext.currentModuleKey,
    getModulePermissionLevel,
    isModuleAccessLoading: false,
    isSelfProfileRoute: false,
    moduleAccessUser: currentUser,
  });

  assert.equal(
    canViewTasksOnlyRoute === false,
    expected.shouldRestrictToTasksOnly,
    `${pathname} shouldRestrictToTasksOnly`,
  );
  assert.equal(
    canViewCurrentModuleRoute,
    expected.shouldViewCurrentRoute,
    `${pathname} shouldViewCurrentRoute`,
  );
  assert.equal(
    shouldRenderDenied,
    expected.shouldRenderDenied,
    `${pathname} shouldRenderDenied`,
  );

  if (expected.expectedFallbackHref) {
    assert.equal(
      evaluateExpression(deniedFallbackHrefSource, {
        getModulePermissionLevel,
        moduleAccessUser: currentUser,
      }),
      expected.expectedFallbackHref,
      `${pathname} fallbackHref`,
    );
  }

  if (expected.expectedFallbackLabel) {
    assert.equal(
      evaluateExpression(deniedFallbackLabelSource, {
        getModulePermissionLevel,
        moduleAccessUser: currentUser,
      }),
      expected.expectedFallbackLabel,
      `${pathname} fallbackLabel`,
    );
  }
}

function createViewContext(pathname, currentUser) {
  const moduleAccessMap = createModuleAccessMap(currentUser);

  return {
    canManageOrganization: false,
    canManageUsers: false,
    canViewIntegrationRoute,
    canViewTasksOnlyIntegrationRoute,
    getModuleKeyFromRoutePath,
    isAdministrationAccessLoading: false,
    isModuleAccessLoading: false,
    moduleAccessMap,
    moduleAccessUser: currentUser,
    shouldShowDashboard: hasAnyModuleAccess(moduleAccessMap),
  };
}

function createRouteContext(pathname, currentUser) {
  const moduleAccessMap = createModuleAccessMap(currentUser);
  const currentModuleKey = getModuleKeyFromRoutePath(pathname);

  return {
    currentModuleAccess: currentModuleKey ? moduleAccessMap[currentModuleKey] : null,
    currentModuleKey,
    moduleAccessMap,
  };
}

function createModuleAccessMap(currentUser) {
  const isGlobalAdmin = currentUser.type === "owner";

  return Object.fromEntries(
    MODULE_KEYS.map((moduleKey) => [
      moduleKey,
      resolveModuleAccess({
        additionalModulePermissions: currentUser.modules,
        isGlobalAdmin,
        module: moduleKey,
        userPermission: currentUser.permission,
      }),
    ]),
  );
}

function createModules(overrides = {}) {
  return {
    ...Object.fromEntries(MODULE_KEYS.map((moduleKey) => [moduleKey, 0])),
    ...overrides,
  };
}

function createUser({ id, name, login, permission = 0, type = "user", modules = {} }) {
  return {
    department_id: "department-auth-sidebar-smoke",
    id,
    login,
    modules: createModules(modules),
    name,
    organization_id: "org-auth-sidebar-smoke",
    permission,
    type,
  };
}

function extractFunctionDeclaration(source, functionName) {
  return extractBlockFromMarker(source, `function ${functionName}`);
}

function extractConstInitializer(source, constName) {
  const marker = `const ${constName} =`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Could not find ${constName}.`);

  const valueStart = start + marker.length;
  const valueEnd = findStatementEnd(source, valueStart);
  return source.slice(valueStart, valueEnd).trim();
}

function extractJsxPropExpression(source, propName) {
  const marker = `${propName}={`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Could not find JSX prop ${propName}.`);

  const expressionStart = start + marker.length;
  let depth = 1;

  for (let index = expressionStart; index < source.length; index += 1) {
    const character = source[index];

    if (character === "{") {
      depth += 1;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(expressionStart, index).trim();
      }
    }
  }

  assert.fail(`Could not close JSX prop ${propName}.`);
}

function extractBlockFromMarker(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Could not find marker ${marker}.`);

  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `Could not find body for ${marker}.`);

  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];

    if (character === "{") {
      depth += 1;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  assert.fail(`Could not close block for ${marker}.`);
}

function findStatementEnd(source, startIndex) {
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    const previousCharacter = source[index - 1];

    if (inSingleQuote) {
      if (character === "'" && previousCharacter !== "\\") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (character === '"' && previousCharacter !== "\\") {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inTemplate) {
      if (character === "`" && previousCharacter !== "\\") {
        inTemplate = false;
      }
      continue;
    }

    if (character === "'") {
      inSingleQuote = true;
      continue;
    }

    if (character === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (character === "`") {
      inTemplate = true;
      continue;
    }

    if (character === "(") {
      depthParen += 1;
      continue;
    }

    if (character === ")") {
      depthParen -= 1;
      continue;
    }

    if (character === "{") {
      depthBrace += 1;
      continue;
    }

    if (character === "}") {
      depthBrace -= 1;
      continue;
    }

    if (character === "[") {
      depthBracket += 1;
      continue;
    }

    if (character === "]") {
      depthBracket -= 1;
      continue;
    }

    if (
      character === ";" &&
      depthParen === 0 &&
      depthBrace === 0 &&
      depthBracket === 0
    ) {
      return index;
    }
  }

  assert.fail("Could not find end of statement.");
}

function stripTypeScript(source) {
  return source
    .replace(/\s+as\s+[A-Za-z_$][\w$<>, |&.\[\]?]*/g, "")
    .replace(/([,(]\s*[A-Za-z_$][\w$]*)\s*:\s*([^,)=]+)/g, "$1")
    .replace(/\)\s*:\s*([^=<{]+)\{/g, "){")
    .replace(/\)\s*:\s*([^=<{]+)=>/g, ") =>");
}

function compileSnippet(source, dependencies) {
  const dependencyNames = Object.keys(dependencies);
  const dependencyValues = Object.values(dependencies);
  return Function(
    ...dependencyNames,
    `"use strict"; return (${stripTypeScript(source)});`,
  )(...dependencyValues);
}

function evaluateExpression(source, dependencies) {
  return compileSnippet(source, dependencies);
}
