import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const PORT = process.env.COMMERCIAL_SMOKE_PORT || "3127";
const baseUrl = (process.env.COMMERCIAL_SMOKE_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const gatewayEntry = join(repoRoot, "services/gateway/dist/services/gateway/src/server.js");
const gatewayPort = process.env.COMMERCIAL_SMOKE_GATEWAY_PORT || "3010";
const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;
const gatewayJwtSecret = "commercial-smoke-jwt-secret";
const smokeCsrfToken = "A".repeat(43);
const evidenceDir = process.env.COMMERCIAL_SMOKE_EVIDENCE_DIR || join(tmpdir(), "girooffice-commercial-959-evidence");
const smokeUser = {
  id: "user-commercial-smoke",
  name: "Comercial Smoke",
  login: "commercial.smoke",
  organization_id: "organization-commercial-smoke",
  permission: 2,
  type: "admin",
  modules: { comercial: 2 },
};
const commercialAccessProfiles = [
  ...["user", "admin"].flatMap((type) =>
    [0, 1, 2, 3].map((commercialLevel) => ({
      label: `${type} comercial=${commercialLevel}`,
      user: {
        ...smokeUser,
        id: `commercial-${type}-${commercialLevel}`,
        permission: type === "admin" ? 2 : 0,
        type,
        modules: { comercial: commercialLevel },
      },
      canView: commercialLevel > 0,
      canEdit: commercialLevel >= 2,
    })),
  ),
  ...[0, 1, 2, 3].map((commercialLevel) => ({
    label: `owner comercial=${commercialLevel}`,
    user: {
      ...smokeUser,
      id: `commercial-owner-${commercialLevel}`,
      permission: 0,
      type: "owner",
      modules: { comercial: commercialLevel },
    },
    canView: true,
    canEdit: true,
  })),
];
const client = {
  id: "b0000000-0000-4000-8000-000000000001",
  name: "Cliente Smoke",
  company_name: "Empresa Smoke",
  fantasy_name: "Smoke Ltda.",
};
const proposalConfig = {
  id: "c0000000-0000-4000-8000-000000000001",
  name: "Configuração Smoke",
  contract_value: 1800.125,
};
const prospecting = {
  id: "d0000000-0000-4000-8000-000000000001",
  client_id: client.id,
  status: "Análise Financeira",
  status_date: "2026-09-10T00:00:00.000Z",
  description: "Retorno na próxima semana",
  client,
};
const taskBilling = {
  id: "e0000000-0000-4000-8000-000000000001",
  task_id: "f0000000-0000-4000-8000-000000000001",
  task_name: "Entrega Smoke",
  task_status: "A Realizar",
  billing: "Realizar",
  hiring_status: "A Realizar",
  payment: null,
  billing_description: null,
};

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createSessionToken(user) {
  const header = encodeJwtPart({ alg: "HS256", typ: "JWT" });
  const payload = encodeJwtPart({
    user_id: user.id,
    organization_id: user.organization_id,
    permission: user.permission,
    type: user.type,
    modules: user.modules,
    session_id: `commercial-smoke-${user.id}`,
    session_version: 1,
    csrf_hash: createHash("sha256").update(smokeCsrfToken).digest("hex"),
  });
  const signature = createHmac("sha256", gatewayJwtSecret)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

function respondJson(response, data, status = 200) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ success: true, data }));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

async function startServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Upstream de smoke não abriu uma porta.");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(() => resolve()));
}

function stopProcessTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  child.kill("SIGTERM");
}

function createUserUpstream() {
  const usersById = new Map(commercialAccessProfiles.map((profile) => [profile.user.id, profile.user]));
  return startServer((request, response) => {
    if (request.url?.startsWith("/user/session/validate")) {
      response.statusCode = 200;
      response.end();
      return;
    }

    const userId = request.headers["x-auth-user-id"];
    const currentUser = usersById.get(Array.isArray(userId) ? userId[0] : userId) || smokeUser;
    if (request.url?.startsWith("/user/me") || request.url?.startsWith("/user/session/refresh")) {
      respondJson(response, currentUser);
      return;
    }

    respondJson(response, {}, 404);
  });
}

function createCommercialUpstream() {
  const state = {
    proposalConfigs: [proposalConfig],
    prospectingList: [],
    archivedProspectingIds: new Set(),
    taskBillingList: [taskBilling],
  };

  const upstream = startServer((request, response) => {
    const pathname = new URL(request.url || "/", "http://commercial-smoke").pathname;
    if (pathname === "/commercial/proposal-configs" && request.method === "GET") {
      respondJson(response, state.proposalConfigs);
      return;
    }
    if (pathname === "/commercial/proposal-configs" && request.method === "POST") {
      readJsonBody(request).then((body) => {
        const created = {
          ...body,
          id: "c0000000-0000-4000-8000-000000000002",
        };
        state.proposalConfigs.push(created);
        setTimeout(() => respondJson(response, created, 201), 250);
      });
      return;
    }
    if (pathname.startsWith("/commercial/proposal-configs/") && request.method === "PATCH") {
      readJsonBody(request).then((body) => {
        const id = pathname.split("/").at(-1);
        const updated = state.proposalConfigs.find((item) => item.id === id);
        if (!updated) {
          respondJson(response, {}, 404);
          return;
        }
        Object.assign(updated, body);
        respondJson(response, updated);
      });
      return;
    }
    if (pathname.startsWith("/commercial/proposal-configs/") && request.method === "DELETE") {
      state.proposalConfigs = state.proposalConfigs.filter((item) => item.id !== pathname.split("/").pop());
      respondJson(response, { id: pathname.split("/").pop(), deleted: true });
      return;
    }
    if (pathname === "/commercial/prospecting/clients") {
      respondJson(response, state.archivedProspectingIds.has(prospecting.id) ? [] : [client]);
      return;
    }
    if (pathname === "/commercial/prospecting" && request.method === "GET") {
      respondJson(response, state.prospectingList);
      return;
    }
    if (pathname === "/commercial/prospecting" && request.method === "POST") {
      state.prospectingList = [prospecting];
      setTimeout(() => respondJson(response, prospecting, 201), 250);
      return;
    }
    if (pathname.startsWith("/commercial/prospecting/") && request.method === "GET") {
      respondJson(response, prospecting);
      return;
    }
    if (pathname.startsWith("/commercial/prospecting/") && request.method === "PATCH") {
      respondJson(response, { ...prospecting, status: "Envio de Proposta" });
      return;
    }
    if (pathname.startsWith("/commercial/prospecting/") && request.method === "DELETE") {
      const prospectingId = pathname.split("/").pop();
      state.prospectingList = state.prospectingList.filter((item) => item.id !== prospectingId);
      state.archivedProspectingIds.add(prospectingId);
      respondJson(response, { id: prospectingId, deleted: true });
      return;
    }
    if (pathname === "/commercial/task-billing" && request.method === "GET") {
      respondJson(response, state.taskBillingList);
      return;
    }
    if (pathname.startsWith("/commercial/task-billing/") && request.method === "PUT") {
      state.taskBillingList = [{
        ...taskBilling,
        hiring_status: "Contratado",
        payment: "Pago",
        billing_description: "Cobrança confirmada",
      }];
      respondJson(response, state.taskBillingList[0]);
      return;
    }

    respondJson(response, {}, 404);
  });

  return upstream;
}

async function installMocks(page, context, currentUser = smokeUser) {
  await context.addCookies([
    { name: "cw.session", value: createSessionToken(currentUser), url: baseUrl, httpOnly: true },
    { name: "cw.csrf", value: smokeCsrfToken, url: baseUrl, httpOnly: false },
  ]);
  await page.addInitScript(() => {
    if (!window.localStorage.getItem("workspace-theme")) window.localStorage.setItem("workspace-theme", "light");
    if (!window.localStorage.getItem("chakra-ui-color-mode")) window.localStorage.setItem("chakra-ui-color-mode", "light");
  });
  const json = (route, data, status = 200) => route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data }),
  });
  await page.route("**/department/list*", (route) => json(route, []));
  await page.route("**/chat", (route) => json(route, []));
  await page.route("**/socket.io/**", (route) => route.abort());
}

async function assertCommercialAccessMatrix(browser) {
  for (const profile of commercialAccessProfiles) {
    const context = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    try {
      await installMocks(page, context, profile.user);
      await page.goto("/comercial", { waitUntil: "networkidle" });

      if (!profile.canView) {
        try {
          await page.getByRole("heading", { name: "Acesso indisponível", exact: true }).waitFor({ timeout: 10_000 });
        } catch (error) {
          throw new Error(
            `${profile.label}: acesso negado não renderizou; url=${page.url()} body=${(await page.locator("body").innerText()).slice(0, 1200)}`,
            { cause: error },
          );
        }
        assert.equal(await page.getByRole("link", { name: "Comercial", exact: true }).count(), 0);
      } else {
        await page.getByRole("heading", { name: "Catálogo de propostas", exact: true }).waitFor({ timeout: 10_000 });
        assert.equal(await page.getByRole("link", { name: "Comercial", exact: true }).count(), 1);
        assert.equal(
          await page.getByRole("button", { name: "Nova configuração", exact: true }).count(),
          profile.canEdit ? 1 : 0,
        );
        assert.equal(
          await page.getByRole("button", { name: `Excluir configuração ${proposalConfig.name}`, exact: true }).count(),
          profile.canEdit ? 1 : 0,
        );
        assert.equal(
          await page.getByText("Acesso somente leitura.", { exact: true }).count(),
          profile.canEdit ? 0 : 1,
        );
      }

      assert.deepEqual(pageErrors, [], `${profile.label}: erros de página`);
      assert.deepEqual(consoleErrors, [], `${profile.label}: erros de console`);
    } finally {
      await context.close();
    }
  }
}

async function run() {
  await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const requests = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => { if (request.url().includes("commercial")) requests.push(`${request.method()} ${request.url()}`); });
  await installMocks(page, context);

  try {
    await assertCommercialAccessMatrix(browser);
    await page.goto("/comercial", { waitUntil: "networkidle" });
    try {
    await page.getByRole("heading", { name: "Prospecção" }).waitFor({ timeout: 10_000 });
    } catch (error) {
      throw new Error(`Comercial não renderizou: url=${page.url()} body=${(await page.locator("body").innerText()).slice(0, 1200)} requests=${requests.join(" | ")} console=${consoleErrors.join(" | ")} page=${pageErrors.join(" | ")}`, { cause: error });
    }
    await page.screenshot({ path: `${evidenceDir}/01-commercial-desktop-light.png`, fullPage: true });

    assert.equal(await page.locator('form[aria-label="Nova configuração"]').count(), 0);
    await page.getByRole("button", { name: "Nova configuração", exact: true }).click();
    const proposalConfigDialog = page.getByRole("dialog", { name: "Nova configuração" });
    await proposalConfigDialog.waitFor({ state: "visible" });
    await proposalConfigDialog.screenshot({ path: `${evidenceDir}/08-commercial-config-create-modal.png` });
    const proposalConfigForm = proposalConfigDialog.getByRole("form", { name: "Nova configuração" });
    const proposalConfigSaveButton = proposalConfigForm.locator('button[type="submit"]');
    await proposalConfigSaveButton.click();
    await proposalConfigDialog.getByRole("alert").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await proposalConfigDialog.waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent?.trim()),
      "Nova configuração",
    );
    await page.getByRole("button", { name: "Nova configuração", exact: true }).click();
    await proposalConfigDialog.waitFor({ state: "visible" });
    await proposalConfigForm.getByLabel("Nome").fill("Configuração criada");
    await proposalConfigForm.getByLabel("Valor base do contrato").fill("150000");
    const createConfigResponsePromise = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().endsWith("/commercial/proposal-configs"),
    );
    await proposalConfigSaveButton.click();
    await page.waitForTimeout(100);
    const proposalConfigLoadingState = {
      disabled: await proposalConfigSaveButton.isDisabled(),
      text: await proposalConfigSaveButton.textContent(),
    };
    const createConfigResponse = await createConfigResponsePromise;
    assert.equal(proposalConfigLoadingState.disabled, true);
    assert.equal(proposalConfigLoadingState.text, "Salvando...");
    assert.deepEqual(JSON.parse(createConfigResponse.request().postData() || "{}"), {
      name: "Configuração criada",
      contract_value: 1500,
    });
    await proposalConfigDialog.waitFor({ state: "hidden" });
    await page.getByText("Configuração criada", { exact: true }).waitFor();

    await page.getByRole("button", { name: "Editar", exact: true }).first().click();
    const contractForm = page.getByRole("form", { name: "Editar configuração" });
    const contractValueInput = contractForm.getByLabel("Valor base do contrato");
    assert.equal(await contractValueInput.inputValue(), "R$ 1.800,13");
    const unchangedUpdateResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/commercial/proposal-configs/${proposalConfig.id}`),
    );
    await contractForm.getByRole("button", { name: "Salvar", exact: true }).click();
    const unchangedUpdateResponse = await unchangedUpdateResponsePromise;
    assert.deepEqual(JSON.parse(unchangedUpdateResponse.request().postData() || "{}"), {
      name: "Configuração Smoke",
      contract_value: 1800.125,
    });
    await page.getByText("Valor base do contrato: R$ 1.800,13", { exact: true }).waitFor();

    await page.getByRole("button", { name: "Editar", exact: true }).first().click();
    const editableContractForm = page.getByRole("form", { name: "Editar configuração" });
    const editableContractValueInput = editableContractForm.getByLabel("Valor base do contrato");
    assert.equal(await editableContractValueInput.inputValue(), "R$ 1.800,13");
    await editableContractValueInput.fill("abc");
    assert.equal(await editableContractValueInput.inputValue(), "");
    await editableContractValueInput.fill("123456");
    assert.equal(await editableContractValueInput.inputValue(), "R$ 1.234,56");
    await page.screenshot({ path: `${evidenceDir}/02-commercial-contract-value-mask.png`, fullPage: true });
    const updateResponsePromise = page.waitForResponse(
      (response) => response.request().method() === "PATCH" && response.url().includes("/commercial/proposal-configs/"),
    );
    await editableContractForm.getByRole("button", { name: "Salvar", exact: true }).click();
    const updateResponse = await updateResponsePromise;
    assert.deepEqual(JSON.parse(updateResponse.request().postData() || "{}"), {
      name: "Configuração Smoke",
      contract_value: 1234.56,
    });
    await page.getByText("Valor base do contrato: R$ 1.234,56", { exact: true }).waitFor();
    await page.screenshot({ path: `${evidenceDir}/03-commercial-contract-value-saved.png`, fullPage: true });

    const deleteConfigButton = page.getByRole("button", {
      name: `Excluir configuração ${proposalConfig.name}`,
      exact: true,
    });
    await deleteConfigButton.waitFor();
    const deleteResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().includes(`/commercial/proposal-configs/${proposalConfig.id}`),
    );
    page.once("dialog", (dialog) => {
      assert.equal(dialog.type(), "confirm");
      assert.equal(dialog.message(), `Excluir a configuração "${proposalConfig.name}"?`);
      void dialog.accept();
    });
    await deleteConfigButton.click();
    const deleteResponse = await deleteResponsePromise;
    assert.equal(deleteResponse.status(), 200);
    assert.deepEqual(await deleteResponse.json(), {
      success: true,
      data: { id: proposalConfig.id, deleted: true },
    });

    const createdDeleteConfigButton = page.getByRole("button", {
      name: "Excluir configuração Configuração criada",
      exact: true,
    });
    await createdDeleteConfigButton.waitFor();
    const createdDeleteResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().includes("/commercial/proposal-configs/c0000000-0000-4000-8000-000000000002"),
    );
    page.once("dialog", (dialog) => {
      assert.equal(dialog.type(), "confirm");
      assert.equal(dialog.message(), 'Excluir a configuração "Configuração criada"?');
      void dialog.accept();
    });
    await createdDeleteConfigButton.click();
    const createdDeleteResponse = await createdDeleteResponsePromise;
    assert.equal(createdDeleteResponse.status(), 200);
    assert.deepEqual(await createdDeleteResponse.json(), {
      success: true,
      data: { id: "c0000000-0000-4000-8000-000000000002", deleted: true },
    });
    await page.getByRole("heading", { name: "Nenhuma configuração cadastrada" }).waitFor();
    await page.screenshot({ path: `${evidenceDir}/02-commercial-config-deleted.png`, fullPage: true });

    const emptyConfigCreateButton = page.getByRole("button", { name: "Criar configuração", exact: true });
    await emptyConfigCreateButton.click();
    await proposalConfigDialog.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await proposalConfigDialog.waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent?.trim()),
      "Criar configuração",
    );

    await page.getByRole("button", { name: "Nova prospecção" }).click();
    const prospectingDialog = page.getByRole("dialog", { name: "Nova prospecção" });
    await prospectingDialog.waitFor({ state: "visible" });
    await prospectingDialog.screenshot({ path: `${evidenceDir}/09-commercial-prospecting-create-modal.png` });
    const prospectingForm = prospectingDialog.getByRole("form", { name: "Nova prospecção" });
    const clientSelect = prospectingForm.locator("select").first();
    await clientSelect.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), "SELECT");
    await page.screenshot({ path: `${evidenceDir}/04-commercial-form-focus.png`, fullPage: true });
    await clientSelect.selectOption(client.id);
    await prospectingForm.getByLabel("Data do status").fill("2026-09-15");
    await prospectingForm.getByLabel("Descrição").fill("Retorno na próxima semana");
    const prospectingSaveButton = prospectingForm.locator('button[type="submit"]');
    const createProspectingResponsePromise = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().endsWith("/commercial/prospecting"),
    );
    await prospectingSaveButton.click();
    await page.waitForTimeout(100);
    assert.equal(await prospectingSaveButton.isDisabled(), true);
    assert.equal(await prospectingSaveButton.textContent(), "Salvando...");
    const createProspectingResponse = await createProspectingResponsePromise;
    assert.deepEqual(JSON.parse(createProspectingResponse.request().postData() || "{}"), {
      client_id: client.id,
      status: "Análise Financeira",
      status_date: new Date("2026-09-15T12:00:00").toISOString(),
      description: "Retorno na próxima semana",
    });
    await page.getByText("Análise Financeira").last().waitFor();
    await page.screenshot({ path: `${evidenceDir}/05-commercial-saved-light.png`, fullPage: true });

    const archiveProspectingButton = page.getByRole("button", {
      name: `Arquivar prospecção ${client.fantasy_name}`,
      exact: true,
    });
    await archiveProspectingButton.waitFor();
    const archiveResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().includes(`/commercial/prospecting/${prospecting.id}`),
    );
    page.once("dialog", (dialog) => {
      assert.equal(dialog.type(), "confirm");
      assert.equal(
        dialog.message(),
        `Arquivar a prospecção de "${client.fantasy_name}"? O histórico será preservado.`,
      );
      void dialog.accept();
    });
    await archiveProspectingButton.click();
    const archiveResponse = await archiveResponsePromise;
    assert.equal(archiveResponse.status(), 200);
    assert.deepEqual(await archiveResponse.json(), {
      success: true,
      data: { id: prospecting.id, deleted: true },
    });
    await page.getByText("Nenhuma prospecção cadastrada.", { exact: true }).waitFor();
    await page.screenshot({ path: `${evidenceDir}/05-commercial-prospecting-archived.png`, fullPage: true });

    await page.getByRole("button", { name: "Nova prospecção" }).click();
    await prospectingDialog.waitFor({ state: "visible" });
    const archivedProspectingForm = prospectingDialog.getByRole("form", { name: "Nova prospecção" });
    await archivedProspectingForm.waitFor();
    assert.equal(
      await archivedProspectingForm.locator(`option[value="${client.id}"]`).count(),
      0,
    );
    await archivedProspectingForm.getByRole("button", { name: "Cancelar", exact: true }).click();
    await prospectingDialog.waitFor({ state: "hidden" });

    await page.getByRole("button", { name: "Editar cobrança" }).click();
    await page.getByLabel("Situação da contratação").selectOption("Contratado");
    await page.getByLabel("Pagamento").fill("Pago");
    await page.getByLabel("Descrição", { exact: true }).last().fill("Cobrança confirmada");
    await page.getByRole("button", { name: "Salvar cobrança" }).click();
    await page.getByText("Cobrança confirmada", { exact: true }).waitFor();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${evidenceDir}/06-commercial-mobile-light.png`, fullPage: true });
    await page.evaluate(() => window.localStorage.setItem("workspace-theme", "dark"));
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Catálogo de propostas" }).waitFor();
    const darkTextEvidence = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas indisponível para validar contraste dark.");
      const read = (selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Elemento ausente: ${selector}`);
        const color = getComputedStyle(element).color;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
        return { color, luminance: (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 };
      };
      return {
        heading: read("h1"),
        intro: read("h1 + p"),
        taskBillingHeading: read("#commercial-task-billing-title"),
      };
    });
    for (const evidence of [darkTextEvidence.heading, darkTextEvidence.intro, darkTextEvidence.taskBillingHeading]) {
      assert.ok(evidence.luminance >= 0.65, `Texto dark com contraste baixo: ${JSON.stringify(evidence)}`);
    }
    await page.screenshot({ path: `${evidenceDir}/07-commercial-mobile-dark.png`, fullPage: true });
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
  } finally {
    await browser.close();
  }
}

async function withNextServer(test) {
  if (process.env.COMMERCIAL_SMOKE_BASE_URL) return test();
  const output = [];
  const serverProcess = spawn("cmd", ["/c", "corepack", "pnpm", "exec", "next", "start", "--port", PORT], {
    cwd: appRoot,
    env: { ...process.env, API_INTERNAL_URL: gatewayUrl },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Next start não iniciou a tempo: ${output.join("\\n")}`)),
      30_000,
    );
    const onData = (chunk) => {
      output.push(chunk.toString());
      if (chunk.toString().includes("Ready in") || chunk.toString().includes("started server")) {
        clearTimeout(timeout);
        resolve();
      }
    };
    serverProcess.stdout.on("data", onData);
    serverProcess.stderr.on("data", onData);
    serverProcess.once("error", reject);
  });
  try { await test(); } finally { stopProcessTree(serverProcess); }
}

async function waitForGateway(serverProcess, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Gateway encerrou antes do smoke: ${output.join("\n")}`);
    }
    try {
      const response = await fetch(`${gatewayUrl}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      // O processo ainda está inicializando.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Gateway não iniciou a tempo: ${output.join("\n")}`);
}

async function withGateway(test) {
  if (process.env.COMMERCIAL_SMOKE_BASE_URL) return test();

  const userUpstream = await createUserUpstream();
  const commercialUpstream = await createCommercialUpstream();
  const output = [];
  const serverProcess = spawn(
    process.execPath,
    [gatewayEntry],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        JWT_SECRET: gatewayJwtSecret,
        GATEWAY_PORT: gatewayPort,
        USER_SERVICE_URL: userUpstream.url,
        COMMERCIAL_SERVICE_URL: commercialUpstream.url,
        AUDIT_ENABLED: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  serverProcess.stdout.on("data", (chunk) => output.push(chunk.toString()));
  serverProcess.stderr.on("data", (chunk) => output.push(chunk.toString()));

  try {
    await waitForGateway(serverProcess, output);
    try {
      await test();
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)} gateway=${output.join("\\n")}`, { cause: error });
    }
  } finally {
    stopProcessTree(serverProcess);
    await closeServer(userUpstream.server);
    await closeServer(commercialUpstream.server);
  }
}

await withGateway(() => withNextServer(run));
console.log(`commercial browser smoke passed; evidence=${evidenceDir}`);
