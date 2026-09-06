import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";

const PORT = process.env.PROJECT_WIZARD_BROWSER_PORT || "3117";
const configuredBaseUrl = process.env.PROJECT_WIZARD_BROWSER_BASE_URL?.replace(/\/$/, "");
const baseUrl = configuredBaseUrl || `http://localhost:${PORT}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const clientId = "11111111-1111-4111-8111-111111111111";

const smokeUser = {
  id: "user-project-wizard-smoke",
  name: "Admin Integração",
  login: "projects.wizard.smoke@castelo.test",
  permission: 1,
  department_id: "department-one",
  organization_id: "org-project-wizard-smoke",
  type: "admin",
  modules: { integracao: 3 },
};

const project = {
  id: "project-existing",
  client_id: clientId,
  name: "Projeto existente",
  objective: "Preservar edição direta",
  status: "Em andamento",
  porcentage: 0,
  start_date: "2026-09-01",
  end_date: null,
};

async function installApiMocks(page, wizardRequests) {
  await page.route("**/user/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: smokeUser },
    }),
  );
  await page.route("**/department/list*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: [] },
    }),
  );
  await page.route("**/client/list*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: {
          items: [{ id: clientId, name: "Cliente Wizard", company_name: "Cliente Wizard" }],
          total: 1,
          page: 1,
          pageSize: 50,
          hasMore: false,
        },
      },
    }),
  );
  await page.route("**/client/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: {
          id: clientId,
          name: "Cliente Wizard",
          company_name: "Cliente Wizard",
          cpf_cnpj: "00.000.000/0001-00",
        },
      },
    }),
  );
  await page.route("**/project/metrics", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: {
          total: 1,
          completed: 0,
          inProgress: 1,
          paused: 0,
          toDo: 0,
          notContracted: 0,
          taskMetrics: { total: 0, completed: 0, open: 0, paused: 0, emptyStatus: 0 },
        },
      },
    }),
  );
  await page.route("**/project/list*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: [project] },
    }),
  );
  await page.route("**/project?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: { detail: project } },
    }),
  );
  await page.route("**/task/project-wizard", async (route) => {
    const request = route.request();
    wizardRequests.push({
      body: request.postDataJSON(),
      key: request.headers()["idempotency-key"],
    });
    if (wizardRequests.length === 1) {
      await route.fulfill({ status: 500, contentType: "application/json", json: { error: "Tente novamente." } });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      json: {
        success: true,
        data: { project: { ...project, id: "project-created" }, counts: { main: 0, dependencies: 0, unassigned: 0 } },
      },
    });
  });
  await page.route("**/task/list*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: { data: [], total: 0, hasMore: false, summary: { inProgress: 0, billable: 0 } } },
    }),
  );
}

async function runBrowserProof() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cw.session", value: "opaque-test-session", url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const wizardRequests = [];
  await installApiMocks(page, wizardRequests);

  try {
    await page.goto("/projects", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Novo projeto" })).toBeDisabled();

    await page.goto(`/projects?clientId=${clientId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Projetos", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Novo projeto" }).click();
    const wizard = page.getByRole("dialog", { name: "Novo projeto" });
    await expect(wizard.getByText("Cliente Wizard", { exact: true })).toBeVisible();
    await wizard.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Preencha o nome do projeto.", { exact: true })).toBeVisible();

    await wizard.getByLabel("Nome").fill("Projeto pelo wizard");
    await wizard.getByLabel("Data de início").fill("2026-09-10");
    await wizard.getByLabel("Data final prevista").fill("2026-09-09");
    await wizard.getByLabel("Objetivo").fill("Criar sem tarefas.");
    await wizard.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("A data final não pode ser anterior à data de início.", { exact: true })).toBeVisible();

    await wizard.getByLabel("Data final prevista").fill("2026-09-11");
    await wizard.getByRole("button", { name: "Continuar" }).click();
    await expect(wizard.getByText("Nenhuma tarefa será criada nesta etapa.", { exact: true })).toBeVisible();
    await wizard.getByRole("button", { name: "Pular e revisar" }).click();
    assert.equal(wizardRequests.length, 0, "Pular a etapa 2 não pode criar tarefas nem minutos.");
    await expect(wizard.getByText("Revisão", { exact: true })).toBeVisible();
    await expect(wizard.getByText("Nome: Projeto pelo wizard", { exact: true })).toBeVisible();
    await wizard.getByRole("button", { name: "Voltar para etapa 1" }).click();
    await expect(wizard.getByLabel("Nome")).toHaveValue("Projeto pelo wizard");
    await wizard.getByRole("button", { name: "Continuar" }).click();
    await wizard.getByRole("button", { name: "Pular e revisar" }).click();
    await wizard.getByRole("button", { name: "Criar projeto" }).click();
    await expect(page.getByText("Tente novamente.", { exact: true })).toBeVisible();
    await wizard.getByRole("button", { name: "Criar projeto" }).click();
    await expect.poll(() => wizardRequests.length).toBe(2);
    assert.equal(wizardRequests[0].key, wizardRequests[1].key, "A retentativa deve reutilizar a chave da abertura.");
    assert.notEqual(wizardRequests[0].key, undefined);
    assert.deepEqual(wizardRequests[1].body, {
      client_id: clientId,
      name: "Projeto pelo wizard",
      start_date: "2026-09-10",
      end_date: "2026-09-11",
      objective: "Criar sem tarefas.",
    });
    await expect(page.getByText("Projeto criado com sucesso.", { exact: true })).toHaveCount(1);
    await expect(page).toHaveURL(`/tasks?clientId=${clientId}`);

    await page.goto(`/projects?clientId=${clientId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Editar" }).first().click();
    const editDialog = page.getByRole("dialog", { name: "Editar projeto" });
    await expect(editDialog.getByRole("button", { name: "Salvar alterações" })).toBeVisible();
    await expect(editDialog.getByRole("button", { name: "Continuar" })).toHaveCount(0);
    await editDialog.getByRole("button", { name: "Cancelar" }).click();

    smokeUser.modules.integracao = 1;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Novo projeto" })).toHaveCount(0);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function withNextServer(run) {
  if (configuredBaseUrl) return run();
  const command = process.platform === "win32" ? "cmd" : "corepack";
  const args = process.platform === "win32"
    ? ["/c", "pnpm", "exec", "next", "dev", "--webpack", "--port", PORT]
    : ["pnpm", "exec", "next", "dev", "--webpack", "--port", PORT];
  const server = spawn(command, args, { cwd: appRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk.toString(); });
  server.stderr.on("data", (chunk) => { output += chunk.toString(); });
  try {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 45_000) {
      if (server.exitCode !== null) throw new Error(`Next dev encerrou antes do smoke.\n${output}`);
      try {
        const response = await fetch(baseUrl);
        if (response.ok || response.status < 500) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await run();
  } finally {
    if (server.pid && server.exitCode === null) {
      if (process.platform === "win32") {
        execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        server.kill("SIGTERM");
      }
    }
  }
}

await withNextServer(runBrowserProof);
console.log("PASS wizard de projeto cria somente projeto e preserva edição direta");
