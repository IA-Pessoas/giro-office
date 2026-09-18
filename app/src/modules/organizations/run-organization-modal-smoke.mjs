import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

import { browserSmokeEnv } from "../../shared/testing/browserSmokeEnv.mjs";

const PLAYWRIGHT_PORT = process.env.PLAYWRIGHT_PORT || "3101";
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "");
let baseUrl = configuredBaseUrl || `http://localhost:${PLAYWRIGHT_PORT}`;
const APP_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const pageDiagnostics = new WeakMap();
const csrfToken = "A".repeat(43);

const smokeUser = {
  id: "user-smoke-admin",
  name: "Admin Smoke",
  login: "admin.smoke@castelo.test",
  permission: 2,
  department_id: "department-admin",
  photo_url: null,
  organization_id: "org-smoke",
  type: "owner",
};

function getSmokeOrganization() {
  return {
    id: "org-smoke",
    name: "Castelo Smoke",
    slug: "castelo-smoke",
    logo_url: `${baseUrl}/smoke-logo.svg`,
    status: "active",
    created_at: "2026-06-25T00:00:00.000Z",
    updated_at: "2026-06-25T00:00:00.000Z",
    email_created_by: smokeUser.login,
    cnpj: "12.345.678/0001-90",
    subscription_plan: "premium",
  };
}

async function installApiMocks(page, onOrganizationCreate) {
  await page.route("**/user/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: smokeUser }),
    });
  });

  await page.route("**/organizations/org-smoke", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: getSmokeOrganization() }),
    });
  });

  await page.route("**/organizations", async (route) => {
    assert.equal(route.request().method(), "POST");
    onOrganizationCreate?.(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: getSmokeOrganization() }),
    });
  });

  await page.route("**/smoke-logo.svg", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="24" fill="#0f172a"/><path d="M60 18 92 42v36L60 102 28 78V42Z" fill="#2563eb"/><path d="M60 35 78 48v24L60 85 42 72V48Z" fill="#fff"/></svg>`,
    });
  });

  await page.route("**/department/list**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [{ id: smokeUser.department_id, name: "Administrativo", status: "Ativo" }],
      }),
    });
  });

  await page.route("**/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/socket.io/**", async (route) => {
    const body =
      route.request().method() === "POST"
        ? "ok"
        : '0{"sid":"smoke-socket","upgrades":[],"pingInterval":25000,"pingTimeout":25000}';

    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body,
    });
  });
}

async function assertOrganizationModal(viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    baseURL: baseUrl,
  });

  await context.addCookies([
    {
      name: "cw.session",
      value: "opaque-test-session",
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "cw.csrf",
      value: csrfToken,
      url: baseUrl,
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();
  const diagnostics = [];
  pageDiagnostics.set(page, diagnostics);
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      diagnostics.push(`[console:${message.type()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    diagnostics.push(`[pageerror] ${error.message}`);
  });
  await installApiMocks(page);

  await page.goto("/configuracoes", { waitUntil: "domcontentloaded", timeout: 120_000 });

  await assertVisible(page.getByRole("heading", { name: "Configurações" }), page, "heading Configurações");
  await page.getByRole("button", { name: "Editar organização" }).click();

  const dialog = page.getByRole("dialog", { name: "Editar organização" });
  await assertVisible(dialog, page, "dialog Editar organização");
  await assertVisible(dialog.getByLabel("URL da logo"), page, "input URL da logo");
  await assertVisible(dialog.getByRole("button", { name: "Salvar logo" }), page, "button Salvar logo");

  const box = await dialog.boundingBox();
  assert.ok(box, "Dialog should have a bounding box.");
  assert.ok(box.x >= 0, `Dialog should not overflow left: x=${box.x}.`);
  assert.ok(box.y >= 0, `Dialog should not overflow top: y=${box.y}.`);
  assert.ok(
    box.x + box.width <= viewport.width + 1,
    `Dialog should fit viewport width: right=${box.x + box.width}, viewport=${viewport.width}.`,
  );
  assert.ok(
    box.y + box.height <= viewport.height + 1,
    `Dialog should fit viewport height: bottom=${box.y + box.height}, viewport=${viewport.height}.`,
  );

  await dialog.getByRole("button", { name: "Salvar plano" }).scrollIntoViewIfNeeded();
  await assertVisible(dialog.getByRole("button", { name: "Salvar plano" }), page, "button Salvar plano");

  await browser.close();
}

async function assertOrganizationAccessRequest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl });
  const page = await context.newPage();
  let createPayload;

  await installApiMocks(page, (payload) => {
    createPayload = payload;
  });
  await page.goto("/solicitar-acesso", { waitUntil: "domcontentloaded", timeout: 120_000 });

  await page.getByLabel("Nome da organização").fill("Castelo Mask Smoke");
  await page.getByLabel("E-mail do responsável").fill("admin@castelo.test");
  const cnpjInput = page.getByLabel("CNPJ");
  await cnpjInput.fill("12345678000190");

  assert.equal(await cnpjInput.inputValue(), "12.345.678/0001-90");

  await page.getByRole("button", { name: "Enviar pedido" }).click();
  await page.getByText("Organização registada com sucesso.").waitFor({ state: "visible" });

  assert.deepEqual(createPayload, {
    name: "Castelo Mask Smoke",
    email_created_by: "admin@castelo.test",
    cnpj: "12345678000190",
  });

  await browser.close();
}

async function assertVisible(locator, page, label) {
  try {
    await locator.waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await locator.isVisible(), true);
  } catch (error) {
    const bodyText = await page.locator("body").innerText({ timeout: 1_000 }).catch(() => "");
    console.error(`Smoke failed while waiting for ${label}.`);
    console.error(`Current URL: ${page.url()}`);
    console.error(`Visible text: ${bodyText.slice(0, 600)}`);
    const diagnostics = pageDiagnostics.get(page) ?? [];
    if (diagnostics.length > 0) {
      console.error(`Diagnostics:\n${diagnostics.slice(-12).join("\n")}`);
    }
    throw error;
  }
}

await withNextServer(async () => {
  await assertOrganizationModal({ width: 1366, height: 768 });
  console.log("PASS organization edit modal desktop viewport");

  await assertOrganizationModal({ width: 390, height: 844 });
  console.log("PASS organization edit modal mobile viewport");

  await assertOrganizationAccessRequest();
  console.log("PASS organization access request masks CNPJ and submits canonical digits");
});

async function withNextServer(fn) {
  if (configuredBaseUrl) {
    await fn();
    return;
  }

  const reusableBaseUrl = await findReusableLocalServer();
  if (reusableBaseUrl) {
    baseUrl = reusableBaseUrl;
    await fn();
    return;
  }

  const command = process.platform === "win32" ? "cmd" : "corepack";
  const args =
    process.platform === "win32"
      ? ["/c", "corepack", "pnpm", "exec", "next", "dev", "--webpack", "--port", PLAYWRIGHT_PORT]
      : ["pnpm", "exec", "next", "dev", "--webpack", "--port", PLAYWRIGHT_PORT];
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
    await fn();
  } finally {
    stopServer(serverProcess);
  }
}

async function waitForServer(serverProcess, getOutput) {
  const startedAt = Date.now();
  const timeoutMs = 45_000;

  while (Date.now() - startedAt < timeoutMs) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Next dev server exited before smoke test.\n${getOutput()}`);
    }

    try {
      const response = await fetch(baseUrl);
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // Retry until the dev server binds the port.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for Next dev server at ${baseUrl}.\n${getOutput()}`);
}

async function findReusableLocalServer() {
  const candidates = Array.from(
    new Set([
      `http://localhost:${PLAYWRIGHT_PORT}`,
      "http://localhost:3001",
      "http://localhost:3000",
    ]),
  );

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate);
      if (response.ok || response.status < 500) {
        return candidate;
      }
    } catch {
      // Keep probing common local dev ports before starting another Next server.
    }
  }

  return null;
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
