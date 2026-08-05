import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_PORT || "3115";
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "");
let baseUrl = configuredBaseUrl || `http://localhost:${PORT}`;
const APP_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
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

const noAccessUser = {
  id: "user-dashboard-no-access",
  name: "No Access Smoke",
  login: "dashboard.no-access@castelo.test",
  permission: 0,
  department_id: "department-no-access",
  organization_id: "org-no-access",
  type: "user",
  modules: Object.fromEntries(MODULE_KEYS.map((moduleKey) => [moduleKey, 0])),
};

function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

async function installApiMocks(page) {
  await page.route("**/user/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: noAccessUser }),
    });
  });

  await page.route("**/department/list**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  await page.route("**/socket.io/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: route.request().method() === "POST" ? "ok" : '0{"sid":"auth-sidebar-smoke"}',
    });
  });
}

async function assertDashboardIsHidden() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1366, height: 768 },
  });

  await context.addCookies([
    {
      name: "cw.token",
      value: createToken({
        id: noAccessUser.id,
        permission: noAccessUser.permission,
        type: noAccessUser.type,
        modules: noAccessUser.modules,
      }),
      url: baseUrl,
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();
  await installApiMocks(page);
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Recolher sidebar" }).waitFor({ state: "visible" });
  await page.waitForTimeout(250);

  const dashboardLink = page.locator("aside").getByRole("link", {
    name: "Dashboard",
    exact: true,
  });

  assert.equal(
    await dashboardLink.count(),
    0,
    "Dashboard must not be rendered in the sidebar without module access.",
  );

  await browser.close();
}

await withNextServer(async () => {
  await assertDashboardIsHidden();
  console.log("PASS dashboard is hidden from sidebar without module access");
});

async function withNextServer(test) {
  if (configuredBaseUrl) {
    await test();
    return;
  }

  const command = process.platform === "win32" ? "cmd" : "corepack";
  const args =
    process.platform === "win32"
      ? ["/c", "corepack", "pnpm", "exec", "next", "dev", "--webpack", "--port", PORT]
      : ["pnpm", "exec", "next", "dev", "--webpack", "--port", PORT];
  const serverProcess = spawn(command, args, {
    cwd: APP_ROOT,
    env: process.env,
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
