import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { browserSmokeEnv } from "../../shared/testing/browserSmokeEnv.mjs";

const PORT = process.env.PLAYWRIGHT_PORT || "3115";
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "");
const useProductionBuild = process.argv.includes("--production");
const baseUrl = configuredBaseUrl || `http://localhost:${PORT}`;
const APP_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const evidenceDir = process.env.CONTABIL_SMOKE_EVIDENCE_DIR;
const notificationEvidencePath = process.env.APP_SHELL_NOTIFICATIONS_SCREENSHOT_PATH;
const assistantEvidencePath = process.env.APP_SHELL_ASSISTANT_SCREENSHOT_PATH;
// Mesma flag de build do AppShell: sem ela, o assistente (ainda sem IA) fica oculto.
const aiAssistantEnabled = process.env.NEXT_PUBLIC_AI_ASSISTANT_ENABLED === "true";
const browserViewport =
  process.env.CONTABIL_SMOKE_MOBILE === "1" ? { width: 390, height: 844 } : { width: 1366, height: 768 };
const isMobileSmoke = process.env.CONTABIL_SMOKE_MOBILE === "1";
const MODULE_KEYS = [
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pessoal",
  "regularize",
  "rh",
  "ti",
  "triagem",
];

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

const noAccessUser = createUser({
  id: "user-dashboard-no-access",
  name: "No Access Smoke",
  login: "dashboard.no-access@castelo.test",
});

const organizationOwnerProfile = createUser({
  id: "user-organization-owner-smoke",
  name: "Organization Owner Smoke",
  login: "organization.owner@castelo.test",
  permission: 3,
  type: "owner",
  modules: { contabil: 3 },
});

async function installApiMocks(page, currentUser) {
  const notificationState = {
    mode: "success",
    readCalls: 0,
    loadingStarted: Promise.resolve(),
    loadingStartedResolve: null,
    releaseLoading: null,
  };

  await page.route("**/user/me", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ success: true, data: currentUser }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("**/department/list**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ success: true, data: [] }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("**/client/list**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        success: true,
        data: { items: [], total: 0, page: 1, pageSize: 50, hasMore: false },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("**/contabil/controls/list**", async (route) => {
    const competence = new URL(route.request().url()).searchParams.get("competence");
    await route.fulfill({
      body: JSON.stringify({
        success: true,
        data: {
          competence,
          items: [
            {
              client_id: "contabil-smoke-client-initialized",
              legal_name: "Alfa Contábil Ltda.",
              control: { depreciation: true },
              closing: {
                client_id: "contabil-smoke-client-initialized",
                competence,
                status: "NOT_RECEIVED",
                archived_at: null,
              },
            },
            {
              client_id: "contabil-smoke-client-missing",
              legal_name: "Beta Contábil Ltda.",
              control: null,
              closing: {
                client_id: "contabil-smoke-client-missing",
                competence,
                status: "NOT_RECEIVED",
                archived_at: null,
              },
            },
          ],
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("**/task/notifications/read", async (route) => {
    notificationState.readCalls += 1;
    await route.fulfill({
      body: JSON.stringify({ success: true, data: null }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("**/task/notifications", async (route) => {
    if (notificationState.mode === "loading") {
      notificationState.loadingStartedResolve?.();
      await new Promise((resolve) => {
        notificationState.releaseLoading = resolve;
      });
    }

    if (notificationState.mode === "error") {
      await route.fulfill({
        body: JSON.stringify({ success: false, error: "Falha simulada" }),
        contentType: "application/json",
        status: 500,
      });
      return;
    }

    if (notificationState.mode === "empty") {
      await route.fulfill({
        body: JSON.stringify({ success: true, data: { items: [], unread_count: 0 } }),
        contentType: "application/json",
        status: 200,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({
        success: true,
        data: {
          items: [
            {
              id: "task-notification-smoke",
              task_id: "task-notification-smoke-target",
              type: "TASK_ASSIGNED",
              title: "Tarefa operacional pendente",
              message: "A tarefa precisa de acompanhamento.",
              read_at: null,
              created_at: "2026-09-19T12:00:00.000Z",
            },
          ],
          unread_count: 1,
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("**/socket.io/**", async (route) => {
    await route.fulfill({
      body: route.request().method() === "POST" ? "ok" : '0{"sid":"auth-sidebar-smoke"}',
      contentType: "text/plain",
      status: 200,
    });
  });

  return {
    readCalls: () => notificationState.readCalls,
    setMode(mode) {
      notificationState.mode = mode;
      if (mode === "loading") {
        notificationState.loadingStarted = new Promise((resolve) => {
          notificationState.loadingStartedResolve = resolve;
        });
      }
    },
    waitForLoading: () => notificationState.loadingStarted,
    releaseLoading() {
      notificationState.releaseLoading?.();
      notificationState.releaseLoading = null;
    },
  };
}

function appendDiagnostics(message, pageErrors, consoleErrors) {
  const details = [];

  if (pageErrors.length > 0) {
    details.push(`pageErrors=${pageErrors.join(" | ")}`);
  }

  if (consoleErrors.length > 0) {
    details.push(`consoleErrors=${consoleErrors.join(" | ")}`);
  }

  return details.length > 0 ? `${message}\n${details.join("\n")}` : message;
}

async function captureContabilEvidence(page, userId) {
  if (!evidenceDir) return;

  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: join(evidenceDir, `${userId}.png`), fullPage: true });
}

async function assertContabilPageRendered(page, pageErrors, consoleErrors, label) {
  const heading = page.getByRole("heading", { name: "Contábil", level: 1 });
  const description = page.getByText(
    "Controle mensal, responsáveis e relacionamento contábil por cliente.",
    {
      exact: true,
    },
  );
  const controlTab = page.getByRole("tab", { name: "Controle", exact: true });
  const portfolio = page.getByRole("heading", { name: "Carteira operacional", exact: true });
  const competence = page.getByLabel("Competência da carteira", { exact: true });
  const initializedClient = page.getByRole("cell", { name: "Alfa Contábil Ltda.", exact: true });
  const missingClient = page.getByRole("cell", { name: "Beta Contábil Ltda.", exact: true });

  await heading.waitFor({ state: "visible" });
  await description.waitFor({ state: "visible" });
  await controlTab.waitFor({ state: "visible" });
  await portfolio.waitFor({ state: "visible" });
  await competence.waitFor({ state: "visible" });
  await initializedClient.waitFor({ state: "visible" });
  await missingClient.waitFor({ state: "visible" });

  assert.equal(
    await controlTab.getAttribute("aria-selected"),
    "true",
    appendDiagnostics(
      `${label}: a aba Controle deve estar selecionada ao abrir o módulo Contábil.`,
      pageErrors,
      consoleErrors,
    ),
  );
  const competenceYear = page.getByLabel("Competência da carteira (ano)", { exact: true });
  const competenceMonth = page.getByLabel("Competência da carteira (mês)", { exact: true });
  await competenceYear.selectOption("2026");
  await competenceMonth.selectOption("08");
  await page.getByText("2 clientes, 1 controle iniciado e 1 sem controle mensal.", { exact: true }).waitFor({
    state: "visible",
  });
  assert.equal(
    `${await competenceYear.inputValue()}-${await competenceMonth.inputValue()}`,
    "2026-08",
    appendDiagnostics(
      `${label}: a carteira deve atualizar a competência selecionada.`,
      pageErrors,
      consoleErrors,
    ),
  );
  assert.equal(
    await page.getByRole("heading", { name: "Acesso indisponível", exact: true }).count(),
    0,
    appendDiagnostics(
      `${label}: o estado global de acesso indisponível não deve renderizar em /contabil.`,
      pageErrors,
      consoleErrors,
    ),
  );
}

async function waitForTasksRedirect(page, deniedPath, pageErrors, consoleErrors) {
  try {
    await page.waitForURL((url) => url.pathname === "/tasks", { timeout: 5_000 });
  } catch (error) {
    const message = appendDiagnostics(
      `A rota bloqueada ${deniedPath} não redirecionou observavelmente para /tasks.`,
      pageErrors,
      consoleErrors,
    );
    console.error(message);
    throw new Error(
      message,
      { cause: error },
    );
  }

  assert.equal(
    new URL(page.url()).pathname,
    "/tasks",
    `${deniedPath} deve terminar em /tasks via router.replace("/tasks").`,
  );
}

async function assertIntegrationLevelZeroKeepsIndependentModuleAccess(currentUser) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: browserViewport,
  });
  const pageErrors = [];
  const consoleErrors = [];
  const appRequests = [];
  let assistantObservationActive = false;
  let assistantUnexpectedRequest = null;

  await context.addCookies([
    {
      httpOnly: true,
      name: "cw.session",
      sameSite: "Lax",
      url: baseUrl,
      value: "opaque-test-session",
    },
  ]);

  const page = await context.newPage();
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("request", (request) => {
    appRequests.push(request.url());
    if (assistantObservationActive) {
      assistantUnexpectedRequest = request.url();
    }
  });
  const notificationState = await installApiMocks(page, currentUser);

  try {
    await page.goto("/contabil", { waitUntil: "networkidle" });
    await page.locator("aside").waitFor({ state: "visible" });
    const contabilLink = page.getByRole("link", { name: "Contábil", exact: true });

    await contabilLink.waitFor({ state: "visible" });
    await page.getByRole("link", { name: "Minhas tarefas", exact: true }).waitFor({
      state: "visible",
    });

    assert.equal(
      new URL(page.url()).pathname,
      "/contabil",
      appendDiagnostics(
        "O acesso direto a /contabil deve permanecer na URL observável.",
        pageErrors,
        consoleErrors,
      ),
    );
    await assertContabilPageRendered(
      page,
      pageErrors,
      consoleErrors,
      "Abertura direta de /contabil",
    );
    const notificationButton = page.getByRole("button", { name: "Abrir notificações" });
    await notificationButton.click();
    await page.getByRole("heading", { name: "Notificações", level: 3 }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: /Tarefa operacional pendente/ }).waitFor({ state: "visible" });
    assert.equal(
      await page.getByText("A tarefa precisa de acompanhamento.", { exact: true }).count(),
      1,
      "O painel deve exibir a notificação operacional mockada.",
    );
    if (notificationEvidencePath && currentUser.id === integrationRestrictedProfiles[0].id) {
      await mkdir(dirname(notificationEvidencePath), { recursive: true });
      await page.screenshot({ path: notificationEvidencePath, fullPage: true });
    }
    const readResponse = page.waitForResponse("**/task/notifications/read");
    await page.getByRole("button", { name: /Tarefa operacional pendente/ }).click();
    await readResponse;
    assert.equal(notificationState.readCalls(), 1, "A interação deve marcar a notificação como lida.");
    await page.goto("/contabil", { waitUntil: "networkidle" });
    await page.locator("aside").waitFor({ state: "visible" });
    if (!aiAssistantEnabled) {
      assert.equal(
        await page.getByPlaceholder("Pergunte qualquer coisa ao Assistente IA...").count(),
        0,
        "Sem NEXT_PUBLIC_AI_ASSISTANT_ENABLED, o Assistente IA não aparece.",
      );
    } else {
      const requestsBeforeAssistant = appRequests.length;
      assistantObservationActive = true;
      await page.getByPlaceholder("Pergunte qualquer coisa ao Assistente IA...").fill("Como está minha operação?");
      await page.getByPlaceholder("Pergunte qualquer coisa ao Assistente IA...").press("Enter");
      await page.getByRole("heading", { name: "Assistente IA", level: 2 }).waitFor({ state: "visible" });
      await page.getByText(
        "Este assistente ainda não está conectado a uma IA. A mensagem foi mantida apenas nesta sessão e não foi enviada ao servidor.",
        { exact: true },
      ).waitFor({ state: "visible" });
      await page.waitForTimeout(250);
      assistantObservationActive = false;
      assert.equal(
        assistantUnexpectedRequest,
        null,
        `O fluxo local do Assistente IA gerou uma requisição inesperada: ${assistantUnexpectedRequest ?? ""}`,
      );
      assert.deepEqual(
        appRequests.slice(requestsBeforeAssistant),
        [],
        "O fluxo local do Assistente IA não deve gerar requisições de rede.",
      );
      if (assistantEvidencePath && currentUser.id === integrationRestrictedProfiles[0].id) {
        await mkdir(dirname(assistantEvidencePath), { recursive: true });
        await page.screenshot({ path: assistantEvidencePath, fullPage: true });
      }
      await page.getByRole("button", { name: "Fechar Assistente IA" }).click();
    }

    notificationState.setMode("loading");
    await page.reload({ waitUntil: "domcontentloaded" });
    await notificationState.waitForLoading();
    await notificationButton.waitFor({ state: "visible" });
    await notificationButton.click();
    await page.getByText("Carregando notificações...", { exact: true }).waitFor({ state: "visible" });
    notificationState.setMode("success");
    notificationState.releaseLoading();
    await page.getByRole("button", { name: /Tarefa operacional pendente/ }).waitFor({ state: "visible" });
    await page.getByTestId("app-shell-notifications-backdrop").click({ position: { x: 1, y: 1 } });

    notificationState.setMode("error");
    await page.reload({ waitUntil: "networkidle" });
    await notificationButton.click();
    await page.getByRole("alert").getByText("Não foi possível carregar todas as notificações.", { exact: true }).waitFor({ state: "visible" });
    notificationState.setMode("empty");
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await page.getByText("Nenhuma notificação encontrada.", { exact: true }).waitFor({ state: "visible" });
    await page.getByTestId("app-shell-notifications-backdrop").click({ position: { x: 1, y: 1 } });
    await captureContabilEvidence(page, currentUser.id);
    if (isMobileSmoke) return;
    assert.equal(
      await page.locator("aside").getByRole("link", { name: "Clientes", exact: true }).count(),
      0,
      "Clientes deve permanecer oculto quando integração=0.",
    );
    assert.equal(
      await page.locator("aside").getByRole("link", { name: "Projetos", exact: true }).count(),
      0,
      "Projetos deve permanecer oculto quando integração=0.",
    );

    await page.getByRole("link", { name: "Minhas tarefas", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/tasks");
    assert.equal(
      new URL(page.url()).pathname,
      "/tasks",
      "A navegação observável da sidebar deve levar para /tasks.",
    );

    await contabilLink.click();
    await page.waitForURL((url) => url.pathname === "/contabil");
    await assertContabilPageRendered(
      page,
      pageErrors,
      consoleErrors,
      "Navegação via link Contábil da sidebar",
    );

    await page.goto("/clients/123", { waitUntil: "networkidle" });
    await waitForTasksRedirect(page, "/clients/123", pageErrors, consoleErrors);

    await page.goto("/projects/123", { waitUntil: "networkidle" });
    await waitForTasksRedirect(page, "/projects/123", pageErrors, consoleErrors);
  } finally {
    await browser.close();
  }
}

async function assertDashboardIsHiddenWithoutModuleAccess() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: browserViewport,
  });

  await context.addCookies([
    {
      httpOnly: true,
      name: "cw.session",
      sameSite: "Lax",
      url: baseUrl,
      value: "opaque-test-session",
    },
  ]);

  const page = await context.newPage();
  await installApiMocks(page, noAccessUser);

  try {
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.locator("aside").waitFor({ state: "visible" });

    assert.equal(
      await page.locator("aside").getByRole("link", { name: "Dashboard", exact: true }).count(),
      0,
      "Dashboard deve permanecer oculto na sidebar sem acesso a módulos.",
    );
  } finally {
    await browser.close();
  }
}

async function assertConfigurationAndAdministrationNavigation() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: browserViewport,
  });

  await context.addCookies([
    {
      httpOnly: true,
      name: "cw.session",
      sameSite: "Lax",
      url: baseUrl,
      value: "opaque-test-session",
    },
  ]);

  const page = await context.newPage();
  await installApiMocks(page, organizationOwnerProfile);

  try {
    await page.goto("/contabil", { waitUntil: "networkidle" });
    await page.locator("aside").waitFor({ state: "visible" });
    await page.getByRole("link", { name: "Configurações", exact: true }).waitFor({ state: "visible" });
    await page.getByRole("link", { name: "Administração", exact: true }).waitFor({ state: "visible" });
    assert.equal(
      await page.getByRole("link", { name: "Configurações", exact: true }).getAttribute("href"),
      "/configuracoes",
    );
    assert.equal(
      await page.getByRole("link", { name: "Administração", exact: true }).getAttribute("href"),
      "/administracao",
    );
    assert.equal(
      await page.evaluate(() => window.innerWidth),
      browserViewport.width,
      "O smoke deve executar no viewport responsivo configurado.",
    );
  } finally {
    await browser.close();
  }
}

await withNextServer(async () => {
  await assertDashboardIsHiddenWithoutModuleAccess();
  console.log("PASS dashboard is hidden from sidebar without module access");
  await assertConfigurationAndAdministrationNavigation();
  console.log("PASS configuration and administration navigation is visible to organization owners");

  for (const currentUser of integrationRestrictedProfiles) {
    await assertIntegrationLevelZeroKeepsIndependentModuleAccess(currentUser);
    console.log(
      `PASS integracao=0 preserves contabil sidebar/url access for contabil=${currentUser.modules.contabil}`,
    );
  }
});

async function withNextServer(test) {
  if (configuredBaseUrl) {
    await test();
    return;
  }

  const command = process.platform === "win32" ? "cmd" : "corepack";
  const nextArgs = useProductionBuild
    ? ["start", "--port", PORT]
    : ["dev", "--webpack", "--port", PORT];
  const args =
    process.platform === "win32"
      ? ["/c", "corepack", "pnpm", "exec", "next", ...nextArgs]
      : ["pnpm", "exec", "next", ...nextArgs];
  const serverProcess = spawn(command, args, {
    cwd: APP_ROOT,
    env: browserSmokeEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";

  serverProcess.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  serverProcess.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForServer(serverProcess, () => output);
    await test();
  } finally {
    stopServer(serverProcess);
  }
}

async function waitForServer(serverProcess, getOutput) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 45_000) {
    const output = getOutput();

    if (serverProcess.exitCode !== null) {
      throw new Error(`Next server exited before smoke test.\n${output}`);
    }

    if (output.includes("Module not found: Can't resolve")) {
      throw new Error(`Next server failed to compile the app before smoke test.\n${output}`);
    }

    if (useProductionBuild && !output.includes("Ready in")) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }

    try {
      const response = await fetch(baseUrl);
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // Retry until the server binds the port.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for Next server at ${baseUrl}.\n${getOutput()}`);
}

function stopServer(serverProcess) {
  if (!serverProcess.pid || serverProcess.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    execFileSync("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }

  serverProcess.kill("SIGTERM");
}
