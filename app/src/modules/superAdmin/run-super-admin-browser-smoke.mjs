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
const platformUser = {
  id: "user-safe-1",
  name: "Pessoa de teste",
  login: "pessoa@example.test",
  status: "active",
  department_id: "department-safe-1",
  photo_url: null,
  type: "admin",
  version: 1,
};
let platformUserPermissions = { rh: 1, fiscal: 1 };
let createdUser = null;
let createdUserOrganizationId = null;
const currentOwner = {
  id: "owner-safe-1",
  name: "Owner atual",
  login: "owner@example.test",
  status: "active",
  department_id: "department-safe-1",
  photo_url: null,
  type: "owner",
  version: 1,
};
const requests = [];
const auditEvents = [];
let forceConflict = false;
let forceUserVersionConflict = false;
let nextUserCreateError = null;
let auditUnavailable = false;
let revision = 1;
let delayedDetailId = null;
let delayedDetail;
let failedDetailId = null;
let delayedMutationPath = null;
let delayedMutation;
let delayedUserLifecyclePath = null;
let delayedUserLifecycle;

function reply(response, status, data) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(
    JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }),
  );
}

function userBelongsToOrganization(user, organizationId) {
  if (!user) return false;
  if (user.id === createdUser?.id) return createdUserOrganizationId === organizationId;
  return organizationId === organization.id && [platformUser.id, currentOwner.id].includes(user.id);
}

function usersForOrganization(organizationId) {
  return [platformUser, currentOwner, createdUser].filter((user) =>
    userBelongsToOrganization(user, organizationId),
  );
}

function recordAuditEvent(organizationId, action, referringId, changes) {
  auditEvents.unshift({
    id: `audit-safe-${auditEvents.length + 2}`,
    requestId: `request-safe-${auditEvents.length + 2}`,
    organizationId,
    method: "ENTITY_CHANGE",
    path: `/platform/organizations/${organizationId}/users/${referringId}`,
    outcome: "success",
    statusCode: 200,
    serviceSource: "user-service",
    createdAt: "2026-08-25T12:01:00.000Z",
    action,
    referring: "user",
    referringId,
    actorPlatformUserId: identity.id,
    changes,
  });
}

function hasProcessExited(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error && typeof error === "object" && error.code === "ESRCH";
  }
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
    if (auditUnavailable) return reply(response, 503, "Auditoria indisponível no teste.");
    const organizationId = url.searchParams.get("organizationId");
    const auditOrganization =
      organizations.find((item) => item.id === organizationId) ?? organization;
    const baselineEvent = {
      id: "audit-safe-1",
      requestId: "request-safe-1",
      organizationId: auditOrganization.id,
      method: "ENTITY_CHANGE",
      path: `/platform/organizations/${auditOrganization.id}`,
      outcome: "success",
      statusCode: 200,
      serviceSource: "organization-service",
      createdAt: "2026-08-25T12:00:00.000Z",
      action: "organization.subscription_plan.updated",
      referring: "organization",
      referringId: auditOrganization.id,
      actorPlatformUserId: identity.id,
      changes: { subscription_plan: { from: "trial", to: "pro" } },
    };
    const items = [
      baselineEvent,
      ...auditEvents.filter((event) => !organizationId || event.organizationId === organizationId),
    ];
    return reply(response, 200, {
      items,
      total: items.length,
      page: 1,
      pageSize: 25,
    });
  }
  const permissionsMatch = url.pathname.match(
    /^\/platform\/organizations\/([^/]+)\/users\/([^/]+)\/permissions$/,
  );
  const permissionsOrganization =
    permissionsMatch && organizations.find((item) => item.id === permissionsMatch[1]);
  if (
    permissionsOrganization &&
    userBelongsToOrganization(
      [platformUser, createdUser].find((user) => user?.id === permissionsMatch[2]),
      permissionsOrganization.id,
    )
  ) {
    if (request.method === "GET") return reply(response, 200, platformUserPermissions);
    if (request.method === "PUT") {
      assert.equal(request.headers["x-csrf-token"], csrf);
      assert.equal(request.headers.authorization, undefined);
      assert.ok(
        Object.values(body).every((level) => Number.isInteger(level) && level >= 0 && level <= 3),
      );
      const previousPermissions = platformUserPermissions;
      platformUserPermissions = body;
      recordAuditEvent(
        permissionsOrganization.id,
        "user.permissions.updated",
        permissionsMatch[2],
        { permissions: { from: previousPermissions, to: body } },
      );
      return reply(response, 200, platformUserPermissions);
    }
  }
  const ownershipTransferMatch = url.pathname.match(
    /^\/platform\/organizations\/([^/]+)\/ownership-transfer$/,
  );
  if (ownershipTransferMatch && ownershipTransferMatch[1] === organization.id) {
    assert.equal(request.method, "POST");
    assert.equal(request.headers["x-csrf-token"], csrf);
    assert.equal(request.headers.authorization, undefined);
    assert.deepEqual(Object.keys(body).sort(), [
      "currentOwnerId",
      "justification",
      "previousOwnerAction",
      "successorUserId",
    ]);
    assert.equal(body.currentOwnerId, currentOwner.id);
    assert.equal(body.successorUserId, platformUser.id);
    assert.equal(body.previousOwnerAction, "demote");
    assert.equal(body.justification, "Recuperação de ownership aprovada.");
    recordAuditEvent(organization.id, "organization.ownership.transferred", currentOwner.id, {
      successor_user_id: { from: currentOwner.id, to: platformUser.id },
      previous_owner_action: { from: "owner", to: "demote" },
    });
    return reply(response, 200, { currentOwner, successor: platformUser });
  }
  const usersCollectionMatch = url.pathname.match(/^\/platform\/organizations\/([^/]+)\/users$/);
  const usersOrganization =
    usersCollectionMatch && organizations.find((item) => item.id === usersCollectionMatch[1]);
  if (usersOrganization && request.method === "POST") {
    if (request.headers["x-csrf-token"] !== csrf)
      return reply(response, 403, "CSRF inválido no teste.");
    assert.equal(request.headers.authorization, undefined);
    assert.equal(Object.hasOwn(body, "organization_id"), false);
    assert.equal(typeof body.password, "string");
    if (body.name.length < 3) return reply(response, 400, "Payload inválido no teste.");
    if (nextUserCreateError) {
      const status = nextUserCreateError;
      nextUserCreateError = null;
      return reply(response, status, "Login já cadastrado no tenant.");
    }
    createdUser = {
      id: "user-safe-created",
      name: body.name,
      login: body.login,
      status: "active",
      department_id: body.department_id,
      photo_url: null,
      type: body.type,
      permission: body.permission,
      version: 1,
    };
    createdUserOrganizationId = usersOrganization.id;
    recordAuditEvent(usersOrganization.id, "user.created", createdUser.id, {
      name: { from: null, to: createdUser.name },
      login: { from: null, to: createdUser.login },
    });
    return reply(response, 201, createdUser);
  }
  const userMatch = url.pathname.match(
    /^\/platform\/organizations\/([^/]+)\/users\/([^/]+)(?:\/(reactivate))?$/,
  );
  const selectedUser = userMatch && organizations.find((item) => item.id === userMatch[1]);
  const managedUser =
    userMatch &&
    usersForOrganization(userMatch[1]).find((item) => item.id === userMatch[2]);
  if (selectedUser && managedUser && userBelongsToOrganization(managedUser, selectedUser.id)) {
    if (request.method === "GET" && !userMatch[3]) return reply(response, 200, managedUser);
    if (request.method === "PATCH" && !userMatch[3]) {
      assert.equal(request.headers["x-csrf-token"], csrf);
      assert.equal(request.headers.authorization, undefined);
      assert.equal(body.expected_version, managedUser.version);
      if (Object.hasOwn(body, "password")) assert.equal(typeof body.password, "string");
      if (forceUserVersionConflict) {
        forceUserVersionConflict = false;
        managedUser.version += 1;
        return reply(response, 409, "Conflito de edição.");
      }
      const previousName = managedUser.name;
      const previousLogin = managedUser.login;
      managedUser.name = body.name;
      managedUser.login = body.login;
      managedUser.department_id = body.department_id;
      managedUser.version += 1;
      recordAuditEvent(selectedUser.id, "user.updated", managedUser.id, {
        name: { from: previousName, to: managedUser.name },
        login: { from: previousLogin, to: managedUser.login },
      });
      return reply(response, 200, managedUser);
    }
    if (request.method === "DELETE" && !userMatch[3]) {
      assert.equal(request.headers["x-csrf-token"], csrf);
      assert.equal(request.headers.authorization, undefined);
      if (managedUser.type === "owner") return reply(response, 409, "Último owner do tenant.");
      if (url.pathname === delayedUserLifecyclePath) await delayedUserLifecycle;
      managedUser.status = "inactive";
      recordAuditEvent(selectedUser.id, "user.deactivated", managedUser.id, {
        status: { from: "active", to: "inactive" },
      });
      return reply(response, 200, managedUser);
    }
    if (request.method === "POST" && userMatch[3] === "reactivate") {
      assert.equal(request.headers["x-csrf-token"], csrf);
      assert.equal(request.headers.authorization, undefined);
      if (url.pathname === delayedUserLifecyclePath) await delayedUserLifecycle;
      managedUser.status = "active";
      recordAuditEvent(selectedUser.id, "user.reactivated", managedUser.id, {
        status: { from: "inactive", to: "active" },
      });
      return reply(response, 200, managedUser);
    }
  }
  const match = url.pathname.match(
    /^\/platform\/organizations\/([^/]+)(?:\/(users|departments|status|subscription-plan|logo-url))?$/,
  );
  const selected = match && organizations.find((item) => item.id === match[1]);
  if (selected && request.method === "GET") {
    if (!match[2] && selected.id === delayedDetailId) await delayedDetail;
    if (!match[2] && selected.id === failedDetailId)
      return reply(response, 403, "Detalhe indisponível no teste.");
    if (match[2] === "users") {
      const users = usersForOrganization(selected.id);
      return reply(response, 200, {
        users,
        total: users.length,
        hasMore: false,
      });
    }
    if (match[2] === "departments") {
      return reply(response, 200, [{ id: "department-safe-1", name: "Operações" }]);
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
    if (url.pathname === delayedMutationPath) await delayedMutation;
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
let primaryError;

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
      !/server responded with a status of (400|401|403|404|409|503)/.test(message.text()) &&
      !/AxiosError: Request failed with status code (400|403|409|503)/.test(message.text()) &&
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
    platformUser.status = "active";
    platformUserPermissions = { rh: 1, fiscal: 1 };
    createdUser = null;
    createdUserOrganizationId = null;
    platformUser.type = "admin";
    currentOwner.status = "active";
    auditEvents.length = 0;
    auditUnavailable = false;
    forceUserVersionConflict = false;
    nextUserCreateError = null;
    currentOwner.type = "owner";
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
    if (viewport.width >= 1024) {
      const detailsPanelBox = await directory.locator("xpath=following-sibling::div[1]").boundingBox();
      assert.ok(
        directoryBox &&
          detailsPanelBox &&
          Math.abs(
            directoryBox.y + directoryBox.height - (detailsPanelBox.y + detailsPanelBox.height),
          ) <= 1,
        `Diretório e painel desalinhados: ${JSON.stringify({ directoryBox, detailsPanelBox })}`,
      );
    }
    for (const name of ["Próxima", "Última página"]) {
      const buttonBox = await directory.getByRole("button", { name, exact: true }).boundingBox();
      assert.ok(
        buttonBox && buttonBox.x + buttonBox.width <= directoryBox.x + directoryBox.width,
        `Paginação ${name} fora do diretório: ${JSON.stringify({ directoryBox, buttonBox })}`,
      );
    }
    assert.equal(await page.getByRole("link", { name: "Super Admin", exact: true }).count(), 1);
    await page.getByRole("button", { name: "Usuários", exact: true }).click();
    await page
      .getByRole("button", { name: /Pessoa de teste pessoa@example\.test/ })
      .waitFor();
    assert.ok(
      requests.some(
        (request) => request.path === `/platform/organizations/${organization.id}/users`,
      ),
    );
    await page.getByRole("button", { name: "Criar usuário", exact: true }).click();
    const invalidUserDialog = page.getByRole("dialog", {
      name: "Cadastrar Novo Usuário",
      exact: true,
    });
    await invalidUserDialog.getByLabel(/Nome/).fill("x");
    await invalidUserDialog.getByLabel(/Login/).fill("invalido@example.test");
    await invalidUserDialog.getByLabel(/Senha/).fill("Senha!2026");
    await invalidUserDialog.getByLabel(/Departamento/).selectOption("department-safe-1");
    await invalidUserDialog.getByRole("button", { name: "Criar Usuário", exact: true }).click();
    await invalidUserDialog
      .getByText("Não foi possível concluir o cadastro com os dados informados.", { exact: true })
      .waitFor();
    await invalidUserDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await invalidUserDialog.waitFor({ state: "hidden" });

    await context.addCookies([{ name: "cw.csrf", value: "B".repeat(43), url: baseUrl }]);
    await page.getByRole("button", { name: "Criar usuário", exact: true }).click();
    const csrfUserDialog = page.getByRole("dialog", {
      name: "Cadastrar Novo Usuário",
      exact: true,
    });
    await csrfUserDialog.getByLabel(/Nome/).fill("CSRF inválido");
    await csrfUserDialog.getByLabel(/Login/).fill("csrf@example.test");
    await csrfUserDialog.getByLabel(/Senha/).fill("Senha!2026");
    await csrfUserDialog.getByLabel(/Departamento/).selectOption("department-safe-1");
    await csrfUserDialog.getByRole("button", { name: "Criar Usuário", exact: true }).click();
    await csrfUserDialog
      .getByText("Não foi possível concluir o cadastro com os dados informados.", { exact: true })
      .waitFor();
    await context.addCookies([{ name: "cw.csrf", value: csrf, url: baseUrl }]);
    await csrfUserDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await csrfUserDialog.waitFor({ state: "hidden" });

    await page.getByRole("button", { name: "Criar usuário", exact: true }).click();
    const duplicateUserDialog = page.getByRole("dialog", {
      name: "Cadastrar Novo Usuário",
      exact: true,
    });
    await duplicateUserDialog.getByLabel(/Nome/).fill("Usuário duplicado");
    await duplicateUserDialog.getByLabel(/Login/).fill("pessoa@example.test");
    await duplicateUserDialog.getByLabel(/Senha/).fill("Senha!2026");
    await duplicateUserDialog.getByLabel(/Departamento/).selectOption("department-safe-1");
    nextUserCreateError = 409;
    await duplicateUserDialog.getByRole("button", { name: "Criar Usuário", exact: true }).click();
    await duplicateUserDialog
      .getByText("Não foi possível concluir o cadastro com os dados informados.", { exact: true })
      .waitFor();
    await duplicateUserDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await duplicateUserDialog.waitFor({ state: "hidden" });

    await page.getByRole("button", { name: "Criar usuário", exact: true }).click();
    const createUserDialog = page.getByRole("dialog", {
      name: "Cadastrar Novo Usuário",
      exact: true,
    });
    await createUserDialog.getByLabel(/Nome/).fill("Usuário homologado");
    await createUserDialog.getByLabel(/Login/).fill("homologado@example.test");
    await createUserDialog.getByLabel(/Senha/).fill("Senha!2026");
    await createUserDialog.getByLabel(/Departamento/).selectOption("department-safe-1");
    await createUserDialog.getByRole("button", { name: "Criar Usuário", exact: true }).click();
    await createUserDialog.waitFor({ state: "hidden" });
    const createdUserTrigger = page.getByRole("button", {
      name: /Usuário homologado homologado@example\.test/,
    });
    await createdUserTrigger.waitFor();
    await createdUserTrigger.click();
    const crossedUserStatus = await page.evaluate(async (path) => {
      const response = await fetch(path);
      return response.status;
    }, `/api/platform/organizations/${secondOrganization.id}/users/user-safe-created`);
    assert.equal(crossedUserStatus, 404, "tenant não pode consultar usuário de outra organização");
    const lastOwnerStatus = await page.evaluate(async ({ path, csrfToken }) => {
      const response = await fetch(path, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      return response.status;
    }, {
      path: `/api/platform/organizations/${organization.id}/users/${currentOwner.id}`,
      csrfToken: csrf,
    });
    assert.equal(lastOwnerStatus, 409, "último owner não pode ser desativado");
    const userDetails = page.getByRole("complementary", { name: "Detalhes do usuário" });
    await page.getByRole("button", { name: "Editar dados", exact: true }).click();
    await userDetails.getByLabel("Nome", { exact: true }).fill("Versão desatualada");
    forceUserVersionConflict = true;
    await userDetails.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    await userDetails
      .getByText(
        "Este usuário foi alterado por outra pessoa. Recarregue o estado atual antes de salvar.",
      )
      .waitFor();
    await userDetails.getByRole("button", { name: "Recarregar", exact: true }).click();
    await page.getByRole("button", { name: "Editar dados", exact: true }).waitFor();
    await page.getByRole("button", { name: "Editar dados", exact: true }).click();
    await userDetails.getByLabel("Nome", { exact: true }).fill("Usuário homologado editado");
    await userDetails.getByLabel("Nova senha", { exact: true }).fill("OutraSenha!2026");
    await userDetails.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    const passwordDialog = page.getByRole("dialog", {
      name: "Confirmar alteração de senha",
      exact: true,
    });
    await passwordDialog.getByRole("button", { name: "Alterar senha", exact: true }).click();
    await page.getByRole("heading", { name: "Usuário homologado editado", exact: true }).waitFor();
    assert.ok(
      requests.some(
        (request) =>
          request.method === "PATCH" &&
          request.path === `/platform/organizations/${organization.id}/users/user-safe-created`,
      ),
    );
    const permissionsTrigger = page.getByRole("button", {
      name: "Editar permissões",
      exact: true,
    });
    await permissionsTrigger.click();
    const permissionsDialog = page.getByRole("dialog", {
      name: "Permissões modulares",
      exact: true,
    });
    await permissionsDialog.waitFor();
    await permissionsDialog.getByText(platformUser.name, { exact: true }).first().waitFor();
    const permissionSelect = permissionsDialog.locator("select").first();
    await permissionSelect.selectOption("3");
    await permissionsDialog.getByRole("button", { name: "Salvar permissões", exact: true }).click();
    await page.getByText("Permissões atualizadas com sucesso.", { exact: true }).waitFor();
    assert.ok(
      requests.some(
        (request) =>
          request.method === "PUT" &&
          request.path ===
            `/platform/organizations/${organization.id}/users/user-safe-created/permissions`,
      ),
    );
    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true });
      await settleLayout();
      await page.screenshot({
        path: join(
          screenshotDirectory,
          viewport.width > 1000
            ? "issue-902-permissions-desktop.png"
            : "issue-902-permissions-mobile.png",
        ),
      });
    }
    await page.keyboard.press("Escape");
    await permissionsDialog.waitFor({ state: "hidden" });
    await page.waitForFunction(
      () => document.activeElement?.textContent?.trim() === "Editar permissões",
      null,
      { timeout: 3_000 },
    );

    await page.getByRole("button", { name: /Owner atual owner@example\.test/ }).click();
    assert.equal(
      await page.getByRole("button", { name: "Desativar usuário", exact: true }).count(),
      0,
    );
    const transferTrigger = page.getByRole("button", {
      name: "Transferir ownership",
      exact: true,
    });
    await transferTrigger.click();
    const transferDialog = page.getByRole("dialog", {
      name: "Transferir ownership",
      exact: true,
    });
    await transferDialog.getByText(organization.name, { exact: true }).waitFor();
    await transferDialog.getByText(currentOwner.name, { exact: true }).last().waitFor();
    await transferDialog.getByLabel("Sucessor ativo", { exact: true }).selectOption(platformUser.id);
    await transferDialog
      .getByLabel("Justificativa", { exact: true })
      .fill("Recuperação de ownership aprovada.");
    await transferDialog.getByText(platformUser.name, { exact: true }).last().waitFor();
    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true });
      await settleLayout();
      await page.screenshot({
        path: join(
          screenshotDirectory,
          viewport.width > 1000
            ? "issue-904-ownership-transfer-desktop.png"
            : "issue-904-ownership-transfer-mobile.png",
        ),
      });
    }
    await transferDialog.getByRole("button", { name: "Confirmar transferência", exact: true }).click();
    await transferDialog.waitFor({ state: "hidden" });
    assert.ok(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path === `/platform/organizations/${organization.id}/ownership-transfer`,
      ),
    );
    await page.getByRole("button", { name: /Pessoa de teste pessoa@example\.test/ }).click();
    const deactivateTrigger = page.getByRole("button", {
      name: "Desativar usuário",
      exact: true,
    });
    await deactivateTrigger.waitFor();
    await deactivateTrigger.click();
    const deactivateDialog = page.getByRole("dialog", {
      name: "Desativar usuário",
      exact: true,
    });
    await deactivateDialog.waitFor();
    await deactivateDialog.getByText(organization.name).first().waitFor();
    await deactivateDialog.getByText(platformUser.name).first().waitFor();
    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true });
      await settleLayout();
      await page.screenshot({
        path: join(
          screenshotDirectory,
          viewport.width > 1000
            ? "issue-903-user-deactivation-desktop.png"
            : "issue-903-user-deactivation-mobile.png",
        ),
      });
    }
    await page.keyboard.press("Escape");
    await deactivateDialog.waitFor({ state: "hidden" });
    await page.waitForFunction(
      () => document.activeElement?.textContent?.trim() === "Desativar usuário",
      null,
      { timeout: 3_000 },
    );
    await deactivateTrigger.click();
    let releaseUserLifecycle;
    try {
      delayedUserLifecyclePath = `/platform/organizations/${organization.id}/users/${platformUser.id}`;
      delayedUserLifecycle = new Promise((resolve) => {
        releaseUserLifecycle = resolve;
      });
      await deactivateDialog.getByRole("button", { name: "Desativar usuário", exact: true }).click();
      await deactivateDialog.getByRole("button", { name: "Confirmando...", exact: true }).waitFor();
      assert.equal(
        await deactivateDialog.getByRole("button", { name: "Cancelar", exact: true }).isDisabled(),
        true,
      );
      await page.keyboard.press("Escape");
      assert.equal(await deactivateDialog.isVisible(), true, "não fecha durante a mutação pendente");
    } finally {
      delayedUserLifecyclePath = null;
      releaseUserLifecycle?.();
    }
    await deactivateDialog.waitFor({ state: "hidden" });
    await page.getByText("Inativo", { exact: true }).waitFor();
    await page.waitForFunction(
      () => document.activeElement?.textContent?.trim() === "Reativar usuário",
      null,
      { timeout: 3_000 },
    );
    const reactivateTrigger = page.getByRole("button", {
      name: "Reativar usuário",
      exact: true,
    });
    await reactivateTrigger.click();
    const reactivateDialog = page.getByRole("dialog", {
      name: "Reativar usuário",
      exact: true,
    });
    await reactivateDialog.getByText(organization.name).first().waitFor();
    await reactivateDialog.getByRole("button", { name: "Reativar usuário", exact: true }).click();
    await reactivateDialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Desativar usuário", exact: true }).waitFor();
    assert.ok(
      requests.some(
        (request) =>
          request.method === "DELETE" &&
          request.path === `/platform/organizations/${organization.id}/users/${platformUser.id}`,
      ),
    );
    assert.ok(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path ===
            `/platform/organizations/${organization.id}/users/${platformUser.id}/reactivate`,
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
    assert.deepEqual(
      auditEvents.map((event) => event.action).sort(),
      [
        "organization.ownership.transferred",
        "user.created",
        "user.deactivated",
        "user.permissions.updated",
        "user.reactivated",
        "user.updated",
      ],
    );
    const serializedAuditEvents = JSON.stringify(auditEvents);
    assert.equal(
      /Senha!2026|OutraSenha!2026|hash|cookie|token/i.test(serializedAuditEvents),
      false,
    );
    assert.ok(auditEvents.every((event) => event.actorPlatformUserId === identity.id));
    assert.ok(auditEvents.every((event) => event.referringId && event.changes));
    assert.ok(
      auditEvents.every((event) =>
        Object.values(event.changes).every((change) =>
          Object.hasOwn(change, "from") && Object.hasOwn(change, "to"),
        ),
      ),
    );
    auditUnavailable = true;
    await page.getByLabel("Pesquisar rota").fill("/indisponivel");
    await page.getByText("Não foi possível carregar a auditoria.", { exact: true }).waitFor();
    auditUnavailable = false;
    await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
    await page.getByText("user.created", { exact: true }).waitFor();
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

    const planTrigger = page.getByRole("button", { name: "Editar plano", exact: true });
    const planDialog = page.getByRole("dialog", { name: "Editar plano", exact: true });
    await planTrigger.click();
    await planDialog.waitFor();
    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true });
      await settleLayout();
      await page.screenshot({
        path: join(
          screenshotDirectory,
          viewport.width > 1000
            ? "task-8-plan-dialog-desktop.png"
            : "task-8-plan-dialog-mobile.png",
        ),
      });
    }
    await planDialog.getByLabel("Plano", { exact: true }).selectOption("enterprise");
    await page.keyboard.press("Escape");
    await planDialog.waitFor({ state: "hidden" });
    await page.waitForFunction(
      () => document.activeElement?.textContent?.trim() === "Editar plano",
      null,
      { timeout: 3_000 },
    );
    await planTrigger.click();
    assert.equal(
      await planDialog.getByLabel("Plano", { exact: true }).inputValue(),
      created.subscription_plan,
      "cancelar não pode preservar rascunho de plano",
    );
    const pendingPlan = created.subscription_plan === "pro" ? "enterprise" : "pro";
    let releaseMutation;
    try {
      delayedMutationPath = `/platform/organizations/${created.id}/subscription-plan`;
      delayedMutation = new Promise((resolve) => {
        releaseMutation = resolve;
      });
      await planDialog.getByLabel("Plano", { exact: true }).selectOption(pendingPlan);
      await planDialog.getByRole("button", { name: "Salvar plano", exact: true }).click();
      await planDialog.getByRole("button", { name: "Salvando...", exact: true }).waitFor();
      assert.equal(await planDialog.getByRole("button", { name: "Cancelar", exact: true }).isDisabled(), true);
      assert.equal(await planDialog.getByRole("button", { name: "Salvando...", exact: true }).isDisabled(), true);
      await page.keyboard.press("Escape");
      assert.equal(await planDialog.isVisible(), true, "não fecha durante a mutação pendente");
    } finally {
      delayedMutationPath = null;
      releaseMutation?.();
    }
    await planDialog.waitFor({ state: "hidden" });
    await page.getByText("Plano atualizado.", { exact: true }).waitFor();
    assert.equal(created.subscription_plan, pendingPlan);

    const logoTrigger = page.getByRole("button", { name: "Editar logo", exact: true });
    const logoDialog = page.getByRole("dialog", { name: "Editar logo", exact: true });
    await logoTrigger.click();
    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true });
      await settleLayout();
      await page.screenshot({
        path: join(
          screenshotDirectory,
          viewport.width > 1000
            ? "task-8-logo-dialog-desktop.png"
            : "task-8-logo-dialog-mobile.png",
        ),
      });
    }
    await logoDialog.getByLabel("URL HTTPS", { exact: true }).fill("https://user:secret@example.test/logo.png");
    await logoDialog.getByRole("button", { name: "Salvar logo", exact: true }).click();
    await logoDialog.getByText("Informe uma URL HTTPS sem credenciais.", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await logoDialog.waitFor({ state: "hidden" });
    await page.waitForFunction(
      () => document.activeElement?.textContent?.trim() === "Editar logo",
      null,
      { timeout: 3_000 },
    );
    await logoTrigger.click();
    assert.equal(await logoDialog.getByLabel("URL HTTPS", { exact: true }).inputValue(), created.logo_url ?? "");
    await logoDialog
      .getByLabel("URL HTTPS", { exact: true })
      .fill("https://assets.example.test/logo.png");
    await logoDialog.getByRole("button", { name: "Salvar logo", exact: true }).click();
    await logoDialog.waitFor({ state: "hidden" });
    await page.getByText("URL do logo atualizada.", { exact: true }).waitFor();
    assert.equal(created.logo_url, "https://assets.example.test/logo.png");
    await logoTrigger.click();
    await logoDialog.getByLabel("URL HTTPS", { exact: true }).fill("");
    await logoDialog.getByRole("button", { name: "Salvar logo", exact: true }).click();
    await logoDialog.waitFor({ state: "hidden" });
    await page.getByText("URL do logo removida.", { exact: true }).waitFor();
    assert.equal(created.logo_url, null);
    console.log("PASS diálogos de plano/logo, URL HTTPS e limpeza sem fetch de imagem externa");

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
    await planTrigger.click();
    await planDialog.getByLabel("Plano", { exact: true }).selectOption("enterprise");
    await planDialog.getByRole("button", { name: "Salvar plano", exact: true }).click();
    await planDialog
      .getByText("Esta organização foi alterada por outra pessoa.", { exact: false })
      .waitFor();
    await page.waitForFunction(() => document.querySelector("#platform-status")?.value === "trial");
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(
      requests.filter((request) => request.method === "PATCH").length,
      mutationCount + 1,
    );
    await planDialog.getByLabel("Plano", { exact: true }).selectOption("enterprise");
    await planDialog.getByRole("button", { name: "Salvar plano", exact: true }).click();
    await planDialog.waitFor({ state: "hidden" });
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
  primaryError = error;
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
  let cleanupError;
  try {
    await page?.unrouteAll({ behavior: "ignoreErrors" });
    await browser?.close();
    if (serverProcess.pid && serverProcess.exitCode === null) {
      if (process.platform === "win32") {
        try {
          execFileSync("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
          });
        } catch (error) {
          await new Promise(setImmediate);
          if (error && typeof error === "object" && error.code === "EPERM") throw error;
          if (!hasProcessExited(serverProcess.pid)) throw error;
        }
      } else {
        serverProcess.kill("SIGTERM");
      }
    }
  } catch (error) {
    cleanupError = error;
  }
  try {
    await new Promise((resolve) => upstream.close(resolve));
  } catch (error) {
    cleanupError ??= error;
  }
  if (cleanupError) {
    if (primaryError) {
      console.error("CLEANUP_ERROR", cleanupError);
    } else {
      throw cleanupError;
    }
  }
}
