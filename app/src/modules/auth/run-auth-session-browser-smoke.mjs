import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const PORT = process.env.AUTH_SESSION_SMOKE_PORT || "3116";
const configuredBaseUrl = process.env.AUTH_SESSION_SMOKE_BASE_URL?.replace(/\/$/, "");
const baseUrl = configuredBaseUrl || `http://localhost:${PORT}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const evidenceDir = fileURLToPath(
  new URL("../../../../docs/superpowers/evidence/", import.meta.url),
);
const loginEvidencePath = `${evidenceDir}2026-08-20-issue-772-login.png`;
const authenticatedEvidencePath = `${evidenceDir}2026-08-20-issue-772-authenticated-session.png`;

const smokeUser = {
  department_id: "department-auth-session-smoke",
  id: "user-auth-session-smoke",
  login: "browser.smoke",
  modules: { integracao: 1 },
  name: "Browser Session Smoke",
  organization_id: "organization-auth-session-smoke",
  permission: 1,
  type: "user",
};

async function installApiMocks(page, context) {
  let authenticated = false;

  await page.route("**/dashboard/stats*", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ success: true, data: {} }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("**/department/list*", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ success: true, data: [] }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("**/chat", async (route) => {
    await route.fulfill({
      body: JSON.stringify([]),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("**/user/me", async (route) => {
    await route.fulfill({
      body: JSON.stringify(
        authenticated
          ? { success: true, data: smokeUser }
          : { success: false, error: "Não autenticado." },
      ),
      contentType: "application/json",
      status: authenticated ? 200 : 401,
    });
  });

  await page.route("**/user/session", async (route) => {
    assert.equal(route.request().method(), "POST");
    assert.deepEqual(route.request().postDataJSON(), {
      login: "browser.smoke",
      password: "not-a-real-password",
    });
    assert.equal(route.request().headers().authorization, undefined);

    authenticated = true;
    await context.addCookies([
      {
        httpOnly: true,
        name: "cw.session",
        sameSite: "Lax",
        url: baseUrl,
        value: "opaque-test-session",
      },
      {
        httpOnly: false,
        name: "cw.csrf",
        sameSite: "Lax",
        url: baseUrl,
        value: "A".repeat(43),
      },
    ]);

    const responseBody = { success: true, data: smokeUser };
    assert.equal("token" in responseBody.data, false);
    await route.fulfill({
      body: JSON.stringify(responseBody),
      contentType: "application/json",
      status: 200,
    });
  });
}

async function runBrowserProof() {
  await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { height: 900, width: 1440 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await installApiMocks(page, context);

  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    try {
      await page.getByRole("button", { name: "Entrar no Office" }).waitFor();
    } catch (error) {
      const bodyText = (await page.locator("body").innerText()).slice(0, 1_000);
      throw new Error(
        `Login UI did not render at ${page.url()}. body=${bodyText} pageErrors=${pageErrors.join(" | ")} consoleErrors=${consoleErrors.join(" | ")}`,
        { cause: error },
      );
    }
    await page.waitForTimeout(1_000);
    await page.screenshot({ path: loginEvidencePath, fullPage: true });

    await page.getByLabel("Login").fill("browser.smoke");
    await page.getByLabel("Senha").fill("not-a-real-password");
    await page.getByRole("button", { name: "Entrar no Office" }).click();
    await page.waitForURL((url) => url.pathname === "/dashboard");
    await page.getByRole("heading", { name: "Dashboard", level: 1 }).waitFor();

    const visibleCookies = await page.evaluate(() => document.cookie);
    assert.doesNotMatch(visibleCookies, /cw\.session=/);
    assert.equal(await page.evaluate(() => localStorage.getItem("cw.token")), null);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("cw.token")), null);

    const sessionCookie = (await context.cookies()).find((cookie) => cookie.name === "cw.session");
    assert.equal(sessionCookie?.httpOnly, true);
    await page.screenshot({ path: authenticatedEvidencePath, fullPage: true });
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }
}

await withNextServer(runBrowserProof);
console.log("PASS browser session remains HttpOnly through login and authenticated navigation");

async function withNextServer(test) {
  if (configuredBaseUrl) {
    await test();
    return;
  }

  const command = process.platform === "win32" ? "cmd" : "corepack";
  const args =
    process.platform === "win32"
      ? ["/c", "corepack", "pnpm", "exec", "next", "start", "--port", PORT]
      : ["pnpm", "exec", "next", "start", "--port", PORT];
  const serverProcess = spawn(command, args, {
    cwd: appRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
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

  while (Date.now() - startedAt < 60_000) {
    const output = getOutput();
    if (serverProcess.exitCode !== null) {
      throw new Error(`Next production server exited before smoke test.\n${output}`);
    }
    if (output.includes("Module not found: Can't resolve")) {
      throw new Error(`Next production server failed to load the app.\n${output}`);
    }

    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // Retry until Next binds the port.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for the production build at ${baseUrl}.\n${getOutput()}`);
}

function stopServer(serverProcess) {
  if (!serverProcess.pid || serverProcess.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    execFileSync("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  serverProcess.kill("SIGTERM");
}
