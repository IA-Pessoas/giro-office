import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { browserSmokeEnv } from "./testing/browserSmokeEnv.mjs";

const PLAYWRIGHT_PORT = process.env.FIELD_HELP_SMOKE_PORT || "3114";
const configuredBaseUrl = process.env.FIELD_HELP_SMOKE_BASE_URL?.replace(/\/$/, "");
let baseUrl = configuredBaseUrl || `http://localhost:${PLAYWRIGHT_PORT}`;
const appRoot = fileURLToPath(new URL("../..", import.meta.url));

const smokeUser = {
  id: "user-field-help-smoke",
  name: "Field Help Smoke",
  login: "field.help.smoke@castelo.test",
  permission: 0,
  department_id: "department-pessoal",
  photo_url: null,
  organization_id: "org-smoke",
  type: "user",
  modules: { pessoal: 3, integracao: 3 },
};

async function installApiMocks(page) {
  await page.route("**/user/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: smokeUser }),
    });
  });

  await page.route("**/department/list*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [{ id: smokeUser.department_id, name: "Departamento Pessoal", status: "Ativo" }],
      }),
    });
  });

  await page.route("**/client/list*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          items: [
            {
              id: "client-field-help-smoke",
              name: "Empresa Demonstração",
              organization_id: smokeUser.organization_id,
              status: "Ativo",
              cpf_cnpj: "12.345.678/0001-90",
              company_name: "Empresa Demonstração Ltda.",
              fantasy_name: "Empresa Demo",
              service_unique: false,
              deletion_date: null,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
          hasMore: false,
        },
      }),
    });
  });

  await page.route("**/pessoal/payroll/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: null }),
    });
  });

  await page.route("**/pessoal/overview", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          unions: { total: 0, withBaseDate: 0, withoutBaseDate: 0, withCnpj: 0 },
          ldd: { total: 0, open: 0, overdue: 0, paid: 0 },
        },
      }),
    });
  });

  for (const endpoint of ["**/pessoal/groups*", "**/pessoal/unions*", "**/rh/operational-users*"]) {
    await page.route(endpoint, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: [] }),
      });
    });
  }

  await page.route("**/socket.io/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
  });
}

async function assertFieldHelp({ viewport, theme, screenshotPath, groupScreenshotPath }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl, viewport });

  try {
    await context.addInitScript((initialTheme) => {
      window.localStorage.setItem("workspace-theme", initialTheme);
    }, theme);
    await context.addCookies([
      {
        name: "cw.session",
        value: "opaque-test-session",
        url: baseUrl,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    const page = await context.newPage();
    await installApiMocks(page);
    await page.goto("/departamento-pessoal", { waitUntil: "networkidle", timeout: 120_000 });

    await page.getByRole("button", { name: "Selecionar cliente" }).click();
    await page.getByRole("option", { name: /Empresa Demonstração/ }).click();
    await page.getByRole("tab", { name: "Folha" }).click();

    const helpButton = page.getByRole("button", { name: "Ajuda: Tipo de adiantamento" });
    assert.equal(await helpButton.getAttribute("aria-label"), "Ajuda: Tipo de adiantamento");

    // O tooltip fecha quando um ancestral rola; posicione o campo antes de focar.
    await helpButton.scrollIntoViewIfNeeded();
    await helpButton.focus();
    assert.equal(
      await helpButton.evaluate((element) => document.activeElement === element),
      true,
      "The help button should be reachable by keyboard focus.",
    );

    const tooltip = page.getByRole("tooltip");
    await tooltip.waitFor({ state: "visible", timeout: 10_000 });
    assert.match(
      await tooltip.innerText(),
      /Tipo usado para calcular o adiantamento quando essa opção estiver ativa\./,
    );
    assert.ok(await helpButton.getAttribute("aria-describedby"));

    await helpButton.hover();
    assert.equal(await tooltip.isVisible(), true, "The tooltip should also open on mouse hover.");
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      theme,
      `The ${theme} theme should be applied.`,
    );

    const box = await helpButton.boundingBox();
    assert.ok(box, "The help button should have a visible bounding box.");
    assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1);

    await page.screenshot({ path: screenshotPath, fullPage: true });

    await page.getByRole("tab", { name: "Grupos" }).click();
    assert.equal(
      await page.getByRole("tab", { name: "Grupos" }).getAttribute("aria-selected"),
      "true",
    );
    await page.getByRole("button", { name: "Novo grupo" }).click();
    const policy = page.getByLabel("Política de obrigações");
    assert.equal(await policy.inputValue(), "NORMAL");
    await policy.selectOption("NO_OBLIGATIONS");
    assert.equal(await policy.inputValue(), "NO_OBLIGATIONS");
    await page.screenshot({ path: groupScreenshotPath, fullPage: true });
  } finally {
    await context.close();
    await browser.close();
  }
}

await withNextServer(async () => {
  await assertFieldHelp({
    viewport: { width: 1440, height: 900 },
    theme: "light",
    screenshotPath: "output/playwright/issue-487-contextual-help-real-desktop.png",
    groupScreenshotPath: "output/playwright/issue-1081/02-group-policy-desktop.png",
  });
  console.log("PASS FieldHelp desktop light theme and keyboard/mouse interaction");

  await assertFieldHelp({
    viewport: { width: 390, height: 844 },
    theme: "dark",
    screenshotPath: "output/playwright/issue-487-contextual-help-real-mobile-dark.png",
    groupScreenshotPath: "output/playwright/issue-1081/03-group-policy-mobile-dark.png",
  });
  console.log("PASS FieldHelp mobile dark theme and responsive positioning");
});

async function withNextServer(run) {
  if (configuredBaseUrl) {
    await run();
    return;
  }

  const reusableBaseUrl = await findReusableLocalServer();
  if (reusableBaseUrl) {
    baseUrl = reusableBaseUrl;
    await run();
    return;
  }

  const command = process.platform === "win32" ? "cmd" : "pnpm";
  const args =
    process.platform === "win32"
      ? ["/c", "pnpm", "exec", "next", "dev", "--webpack", "--port", PLAYWRIGHT_PORT]
      : ["exec", "next", "dev", "--webpack", "--port", PLAYWRIGHT_PORT];
  const server = spawn(command, args, {
    cwd: appRoot,
    env: browserSmokeEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";

  server.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForServer(server, () => output);
    await run();
  } finally {
    stopServer(server);
  }
}

async function findReusableLocalServer() {
  for (const candidate of [`http://localhost:${PLAYWRIGHT_PORT}`, "http://localhost:3001", "http://localhost:3000"]) {
    try {
      const response = await fetch(candidate);
      if (response.ok || response.status < 500) {
        return candidate;
      }
    } catch {
      // Try the next local candidate.
    }
  }

  return null;
}

async function waitForServer(server, getOutput) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 180_000) {
    if (server.exitCode !== null) {
      throw new Error(`Next dev exited before the smoke test.\n${getOutput()}`);
    }

    try {
      const response = await fetch(baseUrl);
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // Wait for Next to bind the local port.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for Next at ${baseUrl}.\n${getOutput()}`);
}

function stopServer(server) {
  if (!server.pid || server.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }

  server.kill("SIGTERM");
}
