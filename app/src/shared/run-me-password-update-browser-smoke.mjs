import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { browserSmokeEnv } from "./testing/browserSmokeEnv.mjs";

const PLAYWRIGHT_PORT = process.env.ME_PASSWORD_SMOKE_PORT || "3102";
const configuredBaseUrl = process.env.ME_PASSWORD_SMOKE_BASE_URL?.replace(/\/$/, "");
const useProductionBuild = process.argv.includes("--production");
let baseUrl = configuredBaseUrl || `http://localhost:${PLAYWRIGHT_PORT}`;
const appRoot = fileURLToPath(new URL("../..", import.meta.url));
const pageDiagnostics = new WeakMap();
const csrfToken = "A".repeat(43);

const viewer = {
  id: "user-smoke-viewer",
  name: "Viewer Smoke",
  login: "viewer.smoke@castelo.test",
  permission: 0,
  department_id: "department-viewer",
  photo_url: null,
  organization_id: "org-smoke",
  type: "user",
};

const rhAdmin = {
  id: "user-smoke-rh-admin",
  name: "Admin RH Smoke",
  login: "admin.rh.smoke@castelo.test",
  permission: 1,
  department_id: "department-rh",
  photo_url: null,
  organization_id: "org-smoke",
  type: "admin",
};

async function openProfile(user, modules, onPatch) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl });
  const diagnostics = [];

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
  pageDiagnostics.set(page, diagnostics);
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      diagnostics.push(`[console:${message.type()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    diagnostics.push(`[pageerror] ${error.message}`);
  });

  await page.route("**/user/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { ...user, modules } }),
    });
  });

  await page.route(`**/user/${user.id}`, async (route) => {
    assert.equal(route.request().method(), "PUT");
    assert.equal(route.request().headers()["x-csrf-token"], csrfToken);
    onPatch(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: user }),
    });
  });

  await page.route("**/socket.io/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
  });

  try {
    await page.goto("/me", { waitUntil: "networkidle", timeout: 15_000 });
    await page.waitForTimeout(250);
    assert.equal(new URL(page.url()).pathname, "/me", "O perfil não pode depender de sessionStorage.");
    await assertVisible(page.getByRole("heading", { name: "Meu perfil" }), page, "heading Meu perfil");
    await assertVisible(page.getByLabel("Login"), page, "input Login");

    return { browser, context, diagnostics, page };
  } catch (error) {
    await context.close();
    await browser.close();
    throw error;
  }
}

async function assertVisible(locator, page, label) {
  try {
    await locator.waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await locator.isVisible(), true);
  } catch (error) {
    const bodyText = await page.locator("body").innerText({ timeout: 1_000 }).catch(() => "");
    const diagnostics = pageDiagnostics.get(page) ?? [];
    const details = [
      `URL: ${page.url()}`,
      `Conteúdo: ${bodyText.slice(0, 600)}`,
      diagnostics.length > 0 ? `Diagnósticos: ${diagnostics.slice(-12).join("\\n")}` : "",
    ]
      .filter(Boolean)
      .join("\\n");

    throw new Error(`Smoke falhou ao aguardar ${label}.\\n${details}`, { cause: error });
  }
}

function passwordFields(page) {
  return {
    current: page.getByLabel("Senha atual", { exact: true }),
    next: page.getByLabel("Nova Senha", { exact: true }),
    confirm: page.getByLabel("Confirmar nova senha", { exact: true }),
  };
}

async function assertViewerPasswordUpdate() {
  const password = "viewer-password-smoke";
  const currentPassword = "viewer-senha-atual";
  const requests = [];
  const { browser, context, diagnostics, page } = await openProfile(viewer, { rh: 0 }, (payload) => {
    requests.push(payload);
  });

  try {
    const nameInput = page.getByLabel("Nome");
    const fields = passwordFields(page);
    const saveButton = page.getByRole("button", { name: "Salvar alterações" });

    assert.equal(await nameInput.isDisabled(), true, "Viewer não pode editar o nome.");
    for (const input of Object.values(fields)) {
      assert.equal(await input.getAttribute("type"), "password");
    }

    await fields.next.fill(password);
    await fields.confirm.fill(password);
    assert.equal(await saveButton.isDisabled(), true, "Sem a senha atual não pode salvar.");

    await fields.current.fill(currentPassword);
    await fields.confirm.fill(`${password}-diferente`);
    await assertVisible(page.getByText("As senhas não conferem."), page, "aviso de confirmação");
    assert.equal(await saveButton.isDisabled(), true, "Confirmação divergente não pode salvar.");

    await fields.confirm.fill(password);
    await saveButton.click();

    await page.getByText("Perfil atualizado com sucesso!").waitFor({ state: "visible" });
    assert.deepEqual(requests, [{ password, current_password: currentPassword }]);
    for (const input of Object.values(fields)) {
      assert.equal(await input.inputValue(), "", "As senhas devem ser limpas após sucesso.");
    }
    assert.equal((await page.locator("body").innerText()).includes(password), false);
    assert.equal(diagnostics.some((message) => message.includes(password)), false);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function assertRhAdminProfileUpdate() {
  const password = "rh-admin-password-smoke";
  const nextName = "Admin RH Atualizada";
  const requests = [];
  const { browser, context, diagnostics, page } = await openProfile(rhAdmin, { rh: 3 }, (payload) => {
    requests.push(payload);
  });

  try {
    const nameInput = page.getByLabel("Nome");
    const fields = passwordFields(page);
    const currentPassword = "rh-admin-senha-atual";

    assert.equal(await nameInput.isDisabled(), false, "Admin RH deve poder editar o nome.");
    await nameInput.fill(nextName);
    await fields.current.fill(currentPassword);
    await fields.next.fill(password);
    await fields.confirm.fill(password);
    await page.getByRole("button", { name: "Salvar alterações" }).click();

    await page.getByText("Perfil atualizado com sucesso!").waitFor({ state: "visible" });
    assert.deepEqual(requests, [{ name: nextName, password, current_password: currentPassword }]);
    assert.equal(await fields.next.inputValue(), "", "A senha deve ser limpa após sucesso.");
    assert.equal((await page.locator("body").innerText()).includes(password), false);
    assert.equal(diagnostics.some((message) => message.includes(password)), false);
  } finally {
    await context.close();
    await browser.close();
  }
}

await withNextServer(async () => {
  await assertViewerPasswordUpdate();
  console.log("PASS Viewer atualiza a própria senha pelo componente /me");

  await assertRhAdminProfileUpdate();
  console.log("PASS admin RH atualiza nome e senha pelo componente /me");
});

async function withNextServer(run) {
  if (configuredBaseUrl) {
    await run();
    return;
  }

  const reusableBaseUrl = useProductionBuild ? null : await findReusableLocalServer();
  if (reusableBaseUrl) {
    baseUrl = reusableBaseUrl;
    await run();
    return;
  }

  const command = process.platform === "win32" ? "cmd" : "corepack";
  const nextArgs = useProductionBuild
    ? ["start", "--port", PLAYWRIGHT_PORT]
    : ["dev", "--webpack", "--port", PLAYWRIGHT_PORT];
  const args =
    process.platform === "win32"
      ? ["/c", "pnpm", "exec", "next", ...nextArgs]
      : ["pnpm", "exec", "next", ...nextArgs];
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
  const candidates = Array.from(
    new Set([`http://localhost:${PLAYWRIGHT_PORT}`, "http://localhost:3001", "http://localhost:3000"]),
  );

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate);
      if (response.ok || response.status < 500) {
        return candidate;
      }
    } catch {
      // Procura um Next local antes de iniciar outro processo.
    }
  }

  return null;
}

async function waitForServer(server, getOutput) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 45_000) {
    if (server.exitCode !== null) {
      throw new Error(`Next encerrou antes do smoke.\n${getOutput()}`);
    }

    if (useProductionBuild && !getOutput().includes("Ready in")) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }

    try {
      const response = await fetch(baseUrl);
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // Aguarda o bind da porta local do Next.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Tempo esgotado aguardando Next em ${baseUrl}.\n${getOutput()}`);
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
