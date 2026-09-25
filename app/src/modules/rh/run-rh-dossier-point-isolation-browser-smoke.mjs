import { execFileSync, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";

import { browserSmokeEnv } from "../../shared/testing/browserSmokeEnv.mjs";

const port = process.env.RH_DOSSIER_POINT_ISOLATION_PORT || "3134";
const configuredBaseUrl = process.env.RH_DOSSIER_POINT_ISOLATION_BASE_URL?.replace(/\/$/, "");
const baseUrl = configuredBaseUrl || `http://127.0.0.1:${port}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const repositoryRoot = resolve(appRoot, "..");
const screenshotDir = resolve(repositoryRoot, "output/playwright/issue-1241");
const pointConfigMessage = "Cadastre a configuração de ponto para visualizar o resumo.";
const selectCollaboratorHint = "Selecione um colaborador para consultar o dossiê.";

const user = {
  id: "rh-dossier-smoke-user",
  name: "Ana QA Dossiê",
  login: "rh.dossier.smoke",
  permission: 1,
  department_id: "rh-dossier-smoke-department",
  organization_id: "rh-dossier-smoke-organization",
  type: "admin",
  modules: { rh: 3 },
};

async function selectCollaborator(page) {
  const hint = page.getByText(selectCollaboratorHint, { exact: true });
  if (await hint.isVisible()) {
    await page.getByRole("button", { name: new RegExp(`^${user.name} Analista`) }).click();
  }
}

const dossier = {
  id: user.id,
  full_name: user.name,
  gender: "F",
  birth_date: "1992-04-15T00:00:00.000Z",
  cpf: "12345678901",
  rg: "QA-123",
  address: "Rua de Teste, 123",
  job_title: "Analista",
  email: "ana.qa@example.test",
  phone: "5511999999999",
  hire_date: "2023-01-10T00:00:00.000Z",
  dominio_hire_date: "2023-02-10T00:00:00.000Z",
  termination_date: null,
  photo_url: null,
  status: "active",
  department_id: user.department_id,
  department: { id: user.department_id, name: "Recursos Humanos" },
  allergies: [],
  emergency_contacts: [],
};

const contacts = [
  { id: "rh-dossier-smoke-contact", name: "Marina QA", phone: "5511888888888", reference: "Mãe" },
];
const allergies = [{ name: "Poeira", fonts: "Ácaros", action: "Evitar exposição" }];
const requestLog = [];
let releaseTimeSheetsError;
let releasePointConfigError;
const timeSheetsErrorGate = new Promise((resolvePromise) => {
  releaseTimeSheetsError = resolvePromise;
});
const pointConfigErrorGate = new Promise((resolvePromise) => {
  releasePointConfigError = resolvePromise;
});

function success(route, data) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data }),
  });
}

function missingPointConfig(route) {
  return route.fulfill({
    status: 404,
    contentType: "application/json",
    body: JSON.stringify({
      success: false,
      error: "Configuração de ponto não encontrada para o usuário.",
      code: "NOT_FOUND",
    }),
  });
}

async function installApiMocks(page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.startsWith("/api/")
      ? url.pathname.slice("/api".length)
      : url.port === "3010"
        ? url.pathname
        : null;

    if (!apiPath) return route.continue();

    const method = request.method();
    requestLog.push(`${method} ${apiPath}`);

    if (method === "GET" && apiPath === "/user/me") return success(route, user);
    if (method === "POST" && apiPath === "/user/session/refresh") return success(route, user);

    if (method === "GET" && apiPath === "/rh/timesheets") {
      await timeSheetsErrorGate;
      return missingPointConfig(route);
    }

    if (method === "GET" && apiPath === "/rh/profile/colaborator") return success(route, dossier);
    if (method === "GET" && apiPath === "/rh/profile/colaborator/list") {
      return success(route, [
        {
          id: user.id,
          full_name: user.name,
          job_title: "Analista",
          department: { id: user.department_id, name: "Recursos Humanos" },
          photo_url: null,
          status: "active",
        },
      ]);
    }
    if (method === "GET" && apiPath === "/rh/profile/contact") return success(route, contacts);
    if (method === "GET" && apiPath === "/rh/profile/allergy") return success(route, allergies);
    if (method === "GET" && apiPath === "/department/list") return success(route, []);
    if (method === "GET" && apiPath === "/rh/operational-users") return success(route, []);

    if (method === "GET" && apiPath === "/rh/requests") {
      return success(route, { items: [], total: 0, page: 1, pageSize: 20, hasMore: false });
    }
    if (method === "GET" && apiPath === "/rh/score/evaluations/pending") return success(route, []);
    if (method === "GET" && apiPath === "/rh/point/summary") return missingPointConfig(route);
    if (method === "GET" && apiPath.startsWith("/rh/point-config")) {
      await pointConfigErrorGate;
      return missingPointConfig(route);
    }

    return success(route, []);
  });
}

async function runBrowserProof() {
  await mkdir(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 1100 },
  });
  await context.addCookies([
    { name: "cw.session", value: "rh-dossier-smoke-session", url: baseUrl, httpOnly: true, sameSite: "Lax" },
    { name: "cw.csrf", value: "rh-dossier-smoke-csrf", url: baseUrl, sameSite: "Lax" },
  ]);

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installApiMocks(page);

  try {
    const timeSheetsRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname.endsWith("/rh/timesheets"),
      { timeout: 30_000 },
    );
    await page.goto("/rh", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByRole("button", { name: "Dossiê", exact: true }).waitFor({ timeout: 60_000 });
    await timeSheetsRequest;

    await page.getByRole("button", { name: "Dossiê", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Dossiê do colaborador" })).toBeVisible();
    // #1344: dados sensíveis só depois de escolher o colaborador.
    await expect(page.getByText(selectCollaboratorHint, { exact: true })).toBeVisible();
    expect(requestLog.filter((entry) => /\/rh\/profile\/(contact|allergy)/.test(entry))).toEqual([]);
    await selectCollaborator(page);
    await expect(page.getByRole("heading", { name: "Dados cadastrais" }).locator("..").getByText(user.name, { exact: true })).toBeVisible();
    await expect(page.getByText("Marina QA", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Nome da alergia")).toHaveValue("Poeira");
    await expect(page.getByText(pointConfigMessage, { exact: true })).toHaveCount(0);

    const timeSheetsFailure = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/rh/timesheets") && response.status() === 404,
      { timeout: 30_000 },
    );
    releaseTimeSheetsError();
    await timeSheetsFailure;

    await expect(page.getByRole("heading", { name: "Dossiê do colaborador" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dados cadastrais" }).locator("..").getByText(user.name, { exact: true })).toBeVisible();
    await expect(page.getByText("Marina QA", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Nome da alergia")).toHaveValue("Poeira");
    await expect(page.getByText(pointConfigMessage, { exact: true })).toHaveCount(0);

    if (process.env.RH_DOSSIER_POINT_ISOLATION_SKIP_SCREENSHOTS !== "1") {
      await page.screenshot({
        path: resolve(screenshotDir, "rh-dossier-without-point-config.png"),
        fullPage: true,
      });
    }

    const pointConfigRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname.includes("/rh/point-config"),
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "Ponto" }).click();
    await pointConfigRequest;
    await page.getByRole("button", { name: "Dossiê", exact: true }).click();
    const pointConfigFailure = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.includes("/rh/point-config") && response.status() === 404,
      { timeout: 30_000 },
    );
    releasePointConfigError();
    await pointConfigFailure;

    await expect(page.getByRole("heading", { name: "Dossiê do colaborador" })).toBeVisible();
    await selectCollaborator(page);
    await expect(
      page.getByRole("heading", { name: "Dados cadastrais" }).locator("..").getByText(user.name, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Marina QA", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Nome da alergia")).toHaveValue("Poeira");
    await expect(page.getByText(pointConfigMessage, { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Ponto" }).click();
    await expect(page.getByText(pointConfigMessage, { exact: true }).first()).toBeVisible();
    if (process.env.RH_DOSSIER_POINT_ISOLATION_SKIP_SCREENSHOTS !== "1") {
      await page.screenshot({
        path: resolve(screenshotDir, "rh-point-missing-config-context.png"),
        fullPage: true,
      });
    }

    expect(requestLog).toContain("GET /rh/timesheets");
    expect(requestLog).toContain("GET /rh/profile/colaborator");
    expect(requestLog).toContain("GET /rh/profile/contact");
    expect(requestLog).toContain("GET /rh/profile/allergy");
    expect(requestLog).toContain("GET /rh/point-config");
    expect(pageErrors).toEqual([]);
  } finally {
    await browser.close();
  }
}

async function withNextServer(run) {
  if (configuredBaseUrl) {
    await run();
    return;
  }

  const nextBin = resolve(appRoot, "node_modules/next/dist/bin/next");
  const serverProcess = spawn(
    process.execPath,
    [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", port],
    {
      cwd: appRoot,
      env: browserSmokeEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  serverProcess.stdout.on("data", (chunk) => (output += chunk.toString()));
  serverProcess.stderr.on("data", (chunk) => (output += chunk.toString()));

  try {
    await waitForServer(serverProcess, () => output);
    await run();
  } finally {
    stopServer(serverProcess);
  }
}

async function waitForServer(serverProcess, getOutput) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 90_000) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Next.js exited before the browser smoke.\n${getOutput()}`);
    }

    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
    } catch {
      // Wait until the local Next server accepts connections.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  throw new Error(`Timed out waiting for Next.js at ${baseUrl}.\n${getOutput()}`);
}

function stopServer(serverProcess) {
  if (!serverProcess.pid || serverProcess.exitCode !== null) return;

  if (process.platform === "win32") {
    execFileSync("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  serverProcess.kill("SIGTERM");
}

await withNextServer(runBrowserProof);
console.log("PASS RH dossier loads while a point/timesheet request fails; point message stays contextual");
