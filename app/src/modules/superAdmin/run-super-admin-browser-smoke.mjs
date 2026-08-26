import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const APP_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const NEXT_BIN = fileURLToPath(
  new URL("../../../node_modules/next/dist/bin/next", import.meta.url),
);
const APP_PORT = Number(process.env.PLAYWRIGHT_PORT || "31890");
const baseUrl = `http://127.0.0.1:${APP_PORT}`;
const screenshotDirectory = process.env.SUPER_ADMIN_SCREENSHOT_DIR;
const csrf = "A".repeat(43);
const identity = {
  id: "b4bc983b-1c5c-43d8-80f0-dab220f0c500",
  name: "Operador de teste",
  email: "operador@example.test",
  auth_kind: "platform",
  platform_role: "super_admin",
};
const organization = {
  id: "fc70c08e-1907-4268-b303-f88c6f5c5c01",
  name: "Organização Aurora",
  cnpj: "11222333000181",
  slug: "organizacao-aurora",
  status: "active",
  subscription_plan: "trial",
  logo_url: null,
  created_at: "2026-08-25T10:00:00.000Z",
  updated_at: "2026-08-25T10:00:00.000Z",
};
const secondOrganization = {
  ...organization,
  id: "fc70c08e-1907-4268-b303-f88c6f5c5c02",
  name: "Organização Horizonte",
  slug: "organizacao-horizonte",
  cnpj: "11444777000161",
  subscription_plan: "pro",
};
const organizations = [organization, secondOrganization];
const requests = [];
let forceConflict = false;
let revision = 1;
let delayedDetailId = null;
let delayedDetail;
let failedDetailId = null;

function reply(response, status, data) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(
    JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }),
  );
}

const upstream = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : undefined;
  requests.push({ method: request.method, path: url.pathname, query: url.searchParams, body });

  if (url.pathname === "/user/me") return reply(response, 401, "Sessão de plataforma.");
  if (url.pathname === "/platform/me") return reply(response, 200, identity);
  if (url.pathname === "/platform/organizations" && request.method === "GET") {
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const filtered = organizations.filter((item) =>
      `${item.name} ${item.slug} ${item.cnpj}`.toLowerCase().includes(search),
    );
    return reply(response, 200, {
      organizations: filtered,
      total: filtered.length,
      page: 1,
      pageSize: 20,
    });
  }
  if (url.pathname === "/platform/organizations" && request.method === "POST") {
    assert.deepEqual(Object.keys(body).sort(), ["cnpj", "name"]);
    assert.equal(request.headers["x-csrf-token"], csrf);
    assert.equal(request.headers.authorization, undefined);
    const created = {
      ...organization,
      id: "fc70c08e-1907-4268-b303-f88c6f5c5c03",
      name: body.name,
      cnpj: body.cnpj.replace(/\D/g, ""),
      slug: "nova-organizacao",
    };
    organizations.unshift(created);
    return reply(response, 201, created);
  }
  if (url.pathname === "/platform/audit/requests") {
    return reply(response, 200, {
      items: [
        {
          id: "audit-safe-1",
          requestId: "request-safe-1",
          organizationId: url.searchParams.get("organizationId") || organization.id,
          method: "ENTITY_CHANGE",
          path: `/platform/organizations/${organization.id}`,
          outcome: "success",
          statusCode: 200,
          serviceSource: "organization-service",
          createdAt: "2026-08-25T12:00:00.000Z",
          action: "organization.subscription_plan.updated",
          referring: "organization",
          referringId: organization.id,
          actorPlatformUserId: identity.id,
          changes: { subscription_plan: { from: "trial", to: "pro" } },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
    });
  }
  const match = url.pathname.match(
    /^\/platform\/organizations\/([^/]+)(?:\/(users|status|subscription-plan|logo-url))?$/,
  );
  const selected = match && organizations.find((item) => item.id === match[1]);
  if (selected && request.method === "GET") {
    if (!match[2] && selected.id === delayedDetailId) await delayedDetail;
    if (!match[2] && selected.id === failedDetailId)
      return reply(response, 403, "Detalhe indisponível no teste.");
    if (match[2] === "users") {
      return reply(response, 200, {
        users: [
          {
            id: "user-safe-1",
            name: "Pessoa de teste",
            login: "pessoa@example.test",
            status: "active",
            department_id: "department-safe-1",
            photo_url: null,
            type: "admin",
          },
        ],
        total: 1,
        hasMore: false,
      });
    }
    return reply(response, 200, selected);
  }
  if (selected && request.method === "PATCH") {
    assert.equal(request.headers["x-csrf-token"], csrf);
    assert.equal(request.headers.authorization, undefined);
    assert.equal(body.expected_updated_at, selected.updated_at);
    const field = {
      status: "status",
      "subscription-plan": "subscription_plan",
      "logo-url": "logo_url",
    }[match[2]];
    assert.deepEqual(Object.keys(body).sort(), ["expected_updated_at", field].sort());
    selected.updated_at = new Date(Date.UTC(2026, 7, 25, 12, 0, revision++)).toISOString();
    if (forceConflict) {
      forceConflict = false;
      selected.status = "trial";
      return reply(response, 409, "Conflito de edição.");
    }
    selected[field] = body[field];
    return reply(response, 200, selected);
  }
  reply(response, 404, "Rota de teste não encontrada.");
});

await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
const upstreamPort = upstream.address().port;
const serverProcess = spawn(
  process.execPath,
  [NEXT_BIN, "start", "--hostname", "127.0.0.1", "--port", String(APP_PORT)],
  {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      API_INTERNAL_URL: `http://127.0.0.1:${upstreamPort}`,
      NEXT_PUBLIC_API_URL: "/api",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
let serverOutput = "";
serverProcess.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
serverProcess.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
let browser;
let page;
const pageErrors = [];
const consoleErrors = [];
const settleLayout = async () => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
};
const prepareScreenshot = async () => {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const element of document.querySelectorAll("main, [data-scroll-container]"))
      element.scrollTo(0, 0);
  });
  await settleLayout();
};

try {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    if (serverProcess.exitCode !== null) throw new Error(serverOutput);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2_000) });
      if (response.status < 500) break;
    } catch {
      // Wait for this test's Next process, never reuse another worktree's server.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await context.addCookies([
    {
      name: "cw.session",
      value: "opaque-local-test-session",
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
    { name: "cw.csrf", value: csrf, url: baseUrl, sameSite: "Lax" },
  ]);
  page = await context.newPage();
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `http://127.0.0.1:${upstreamPort}${url.pathname.slice(4)}${url.search}`,
    });
    await route.fulfill({ response });
  });
  const remoteImages = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/server responded with a status of (401|409)/.test(message.text()) &&
      !(failedDetailId && /server responded with a status of 403/.test(message.text()))
    ) {
      consoleErrors.push(message.text());
    }
  });
  page.on("request", (request) => {
    if (request.resourceType() === "image" && !request.url().startsWith(baseUrl))
      remoteImages.push(request.url());
  });
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    organizations.splice(0, organizations.length, organization, secondOrganization);
    requests.length = 0;
    await page.goto("/super-admin", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: organization.name, exact: true }).waitFor();

    if (process.env.SUPER_ADMIN_DETAIL_CASE !== "failed") {
      let releaseDetail;
      delayedDetailId = secondOrganization.id;
      delayedDetail = new Promise((resolve) => {
        releaseDetail = resolve;
      });
      const delayMarker = requests.length;
      try {
        await page.getByRole("button", { name: /Organização Horizonte/ }).click();
        await page.getByText("Carregando detalhes da organização...", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Auditoria", exact: true }).click();
        assert.equal(
          await page.getByText("Carregando detalhes da organização...", { exact: true }).count(),
          1,
          "Auditoria deve manter gate de detalhe pendente, sem mudar para global",
        );
        assert.equal(
          requests
            .slice(delayMarker)
            .some(
              (request) =>
                request.path === "/platform/audit/requests" && !request.query.has("organizationId"),
            ),
          false,
        );
      } finally {
        delayedDetailId = null;
        releaseDetail();
      }
      await page.getByText("Plano: Trial → Pro", { exact: true }).waitFor();
      assert.equal(
        requests
          .filter((request) => request.path === "/platform/audit/requests")
          .at(-1)
          .query.get("organizationId"),
        secondOrganization.id,
      );
    }

    failedDetailId = organization.id;
    const failureMarker = requests.length;
    await page.reload({ waitUntil: "networkidle" });
    await page
      .getByText("Não foi possível carregar os detalhes da organização.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Auditoria", exact: true }).click();
    assert.equal(
      await page
        .getByText("Não foi possível carregar os detalhes da organização.", { exact: true })
        .count(),
      1,
      "Auditoria deve manter gate de detalhe falho, sem mudar para global",
    );
    assert.equal(
      requests
        .slice(failureMarker)
        .some(
          (request) =>
            request.path === "/platform/audit/requests" && !request.query.has("organizationId"),
        ),
      false,
    );
    failedDetailId = null;
    await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
    await page.getByText("Plano: Trial → Pro", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Visão geral", exact: true }).click();
    await page.getByRole("heading", { name: organization.name, exact: true }).waitFor();
    console.log(`PASS ${viewport.width}px detalhe atrasado/falho não consulta auditoria global`);
    const directory = page
      .locator("aside")
      .filter({ has: page.getByLabel("Pesquisar organização") });
    const directoryBox = await directory.boundingBox();
    for (const name of ["Próxima", "Última página"]) {
      const buttonBox = await directory.getByRole("button", { name, exact: true }).boundingBox();
      assert.ok(
        buttonBox && buttonBox.x + buttonBox.width <= directoryBox.x + directoryBox.width,
        `Paginação ${name} fora do diretório: ${JSON.stringify({ directoryBox, buttonBox })}`,
      );
    }
    assert.equal(await page.getByRole("link", { name: "Super Admin", exact: true }).count(), 1);
    await page.getByRole("button", { name: "Usuários", exact: true }).click();
    await page.getByText("Pessoa de teste", { exact: true }).waitFor();
    assert.ok(
      requests.some(
        (request) => request.path === `/platform/organizations/${organization.id}/users`,
      ),
    );
    await page.getByRole("button", { name: "Auditoria", exact: true }).click();
    await page.getByText("Plano: Trial → Pro", { exact: true }).waitFor();
    assert.equal(
      requests
        .filter((request) => request.path === "/platform/audit/requests")
        .at(-1)
        .query.get("organizationId"),
      organization.id,
    );
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/platform/audit/requests") &&
          !response.url().includes("organizationId"),
      ),
      page.getByLabel("Mostrar auditoria global").check(),
    ]);
    assert.equal(
      requests
        .filter((request) => request.path === "/platform/audit/requests")
        .at(-1)
        .query.get("organizationId"),
      null,
    );
    console.log("PASS seleção, usuários e auditoria contextual/global");

    await page.getByRole("button", { name: "Criar organização", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Criar organização", exact: true });
    await dialog.waitFor();
    for (const key of ["Tab", "Tab", "Tab", "Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      assert.equal(
        await dialog.evaluate((element) => element.contains(document.activeElement)),
        true,
        `Foco saiu do diálogo após ${key}`,
      );
    }
    await dialog.getByLabel("Nome", { exact: true }).fill("Nova Organização");
    await dialog.getByLabel("CNPJ", { exact: true }).fill("98765432000198");
    assert.equal(
      await dialog.getByLabel("CNPJ", { exact: true }).inputValue(),
      "98.765.432/0001-98",
    );
    await dialog.getByRole("button", { name: "Criar organização", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("heading", { name: "Nova Organização", exact: true }).waitFor();
    const created = organizations[0];
    await page.getByLabel("Pesquisar organização").fill("não encontrada");
    await page.getByText("Nenhuma organização encontrada", { exact: true }).waitFor();
    await page.getByRole("heading", { name: "Nova Organização", exact: true }).waitFor();
    await page.getByLabel("Pesquisar organização").fill("");
    console.log("PASS criação limitada e seleção preservada após refetch do diretório");

    await page.getByLabel("Novo plano", { exact: true }).selectOption("pro");
    await page.getByRole("button", { name: "Salvar plano", exact: true }).click();
    await page.getByText("Plano atualizado.", { exact: true }).waitFor();
    assert.equal(created.subscription_plan, "pro");
    await page
      .getByLabel("URL HTTPS", { exact: true })
      .fill("https://user:secret@example.test/logo.png");
    await page.getByRole("button", { name: "Salvar logo", exact: true }).click();
    await page.getByText("Informe uma URL HTTPS sem credenciais.", { exact: true }).waitFor();
    await page
      .getByLabel("URL HTTPS", { exact: true })
      .fill("https://assets.example.test/logo.png");
    await page.getByRole("button", { name: "Salvar logo", exact: true }).click();
    await page.getByText("URL do logo atualizada.", { exact: true }).waitFor();
    assert.equal(created.logo_url, "https://assets.example.test/logo.png");
    await page.getByLabel("URL HTTPS", { exact: true }).fill("");
    await page.getByRole("button", { name: "Salvar logo", exact: true }).click();
    await page.getByText("URL do logo removida.", { exact: true }).waitFor();
    assert.equal(created.logo_url, null);
    console.log("PASS plano, URL HTTPS e limpeza de logo sem fetch de imagem externa");

    const confirmation = page.getByRole("dialog", { name: "Confirmar alteração de status" });
    for (const status of ["trial", "past_due", "suspended", "cancelled", "active"]) {
      const previousStatus = created.status;
      const previousCount = requests.filter((request) => request.method === "PATCH").length;
      await page.getByLabel("Novo status", { exact: true }).selectOption(status);
      await page.getByRole("button", { name: "Salvar status", exact: true }).click();
      await confirmation.waitFor();
      assert.equal(created.status, previousStatus);
      for (const key of ["Tab", "Tab", "Tab", "Tab", "Shift+Tab"]) {
        await page.keyboard.press(key);
        assert.equal(
          await confirmation.evaluate((element) => element.contains(document.activeElement)),
          true,
        );
      }
      await page.keyboard.press("Escape");
      await confirmation.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.id === "platform-status");
      await page.getByRole("button", { name: "Salvar status", exact: true }).click();
      await confirmation.getByRole("button", { name: "Manter status" }).click();
      assert.equal(requests.filter((request) => request.method === "PATCH").length, previousCount);
      await page.getByRole("button", { name: "Salvar status", exact: true }).click();
      const confirmButton = confirmation.getByRole("button", { name: "Alterar status" });
      if (status === "suspended" || status === "cancelled") {
        assert.equal(await confirmButton.isDisabled(), true);
        await confirmation.getByLabel("Nome exato da organização").fill("nome incorreto");
        assert.equal(await confirmButton.isDisabled(), true);
        await confirmation.getByLabel("Nome exato da organização").fill(created.name);
        if (status === "suspended" && screenshotDirectory) {
          await mkdir(screenshotDirectory, { recursive: true });
          await settleLayout();
          await page.screenshot({
            path: join(
              screenshotDirectory,
              viewport.width > 1000
                ? "super-admin-status-confirmation.png"
                : "super-admin-status-confirmation-mobile.png",
            ),
          });
        }
      } else {
        assert.equal(await confirmation.getByLabel("Nome exato da organização").count(), 0);
      }
      await confirmButton.click();
      await confirmation.waitFor({ state: "hidden" });
      assert.equal(created.status, status);
      await page.waitForFunction(() => document.activeElement?.id === "platform-status", null, {
        timeout: 3_000,
      });
    }
    console.log("PASS confirmação dos cinco status; suspensão/cancelamento exigem nome exato");

    const mutationCount = requests.filter((request) => request.method === "PATCH").length;
    forceConflict = true;
    await page.getByLabel("Novo plano", { exact: true }).selectOption("enterprise");
    await page.getByRole("button", { name: "Salvar plano", exact: true }).click();
    await page
      .getByText("Esta organização foi alterada por outra pessoa.", { exact: false })
      .waitFor();
    await page.waitForFunction(() => document.querySelector("#platform-status")?.value === "trial");
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(
      requests.filter((request) => request.method === "PATCH").length,
      mutationCount + 1,
    );
    await page.getByLabel("Novo plano", { exact: true }).selectOption("enterprise");
    await page.getByRole("button", { name: "Salvar plano", exact: true }).click();
    await page.getByText("Plano atualizado.", { exact: true }).waitFor();
    assert.equal(created.subscription_plan, "enterprise");
    console.log(
      "PASS 409 atualiza detalhe/lista sem retry automático; nova tentativa usa versão atual",
    );

    await page.getByRole("button", { name: "Criar organização", exact: true }).click();
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel("Nome", { exact: true }).inputValue(), "");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(
      () => document.activeElement?.textContent?.trim() === "Criar organização",
      null,
      { timeout: 3_000 },
    );
    await prepareScreenshot();
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(
      documentWidth <= viewport.width + 1,
      `Página com overflow horizontal: ${documentWidth}px`,
    );
    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true });
      await page.screenshot({
        path: join(
          screenshotDirectory,
          viewport.width > 1000
            ? "super-admin-organizations-desktop.png"
            : "super-admin-organizations-mobile.png",
        ),
        fullPage: true,
      });
    }
    console.log(`PASS ${viewport.width}px fluxos completos, foco/Tab/Escape nos dois diálogos`);
  }
  await page.evaluate(() => {
    localStorage.setItem("workspace-theme", "dark");
    localStorage.setItem("chakra-ui-color-mode", "dark");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Nova Organização", exact: true }).waitFor();
  await prepareScreenshot();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  if (screenshotDirectory) {
    await page.screenshot({
      path: join(screenshotDirectory, "super-admin-organizations-mobile-dark.png"),
      fullPage: true,
    });
  }
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(remoteImages, []);
  console.log("PASS desktop/mobile, Escape, console sem erros inesperados e nenhuma imagem remota");
} catch (error) {
  console.error("URL", page?.url());
  console.error(
    "ACTIVE_ELEMENT",
    await page?.evaluate(() => ({
      tag: document.activeElement?.tagName,
      id: document.activeElement?.id,
    })),
  );
  console.error(
    "PAGE",
    await page
      ?.locator("body")
      .innerText()
      .catch(() => ""),
  );
  console.error("PAGE_ERRORS", pageErrors);
  console.error("CONSOLE_ERRORS", consoleErrors);
  console.error(
    "API_REQUESTS",
    requests.map((request) => `${request.method} ${request.path}?${request.query}`),
  );
  console.error("NEXT_OUTPUT", serverOutput);
  throw error;
} finally {
  await browser?.close();
  if (serverProcess.pid && serverProcess.exitCode === null) {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      serverProcess.kill("SIGTERM");
    }
  }
  await new Promise((resolve) => upstream.close(resolve));
}
