import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";

const PORT = process.env.TASKS_BROWSER_PORT || "3116";
const configuredBaseUrl = process.env.TASKS_BROWSER_BASE_URL?.replace(/\/$/, "");
const baseUrl = configuredBaseUrl || `http://localhost:${PORT}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const clientId = "11111111-1111-4111-8111-111111111111";
const secondClientId = "22222222-2222-4222-8222-222222222222";
const externalClientId = "33333333-3333-4333-8333-333333333333";
const missingClientId = "44444444-4444-4444-8444-444444444444";

const smokeUser = {
  id: "user-task-smoke",
  name: "Admin Integração",
  login: "tasks.smoke@castelo.test",
  permission: 1,
  department_id: "department-one",
  organization_id: "org-task-smoke",
  type: "admin",
  modules: { integracao: 3 },
};

const task = {
  id: "task-unassigned",
  isOwn: false,
  isUnassigned: true,
  name: "Tarefa sem responsável",
  status: "Em Andamento",
  billing: "Não Realizar",
  charge_comercial: false,
  charge_financeiro: false,
  hiring_status: null,
  payment: null,
  billing_description: null,
};

const assignedTask = {
  ...task,
  id: "task-assigned",
  isOwn: true,
  isUnassigned: false,
  name: "Tarefa com responsável",
};

const legacyTaskDetail = {
  id: task.id,
  model_id: "model-legacy",
  project_id: "project-one",
  client_id: clientId,
  name: task.name,
  status: task.status,
  department_id: "department-one",
  observations: "Legado preservado",
  billing: task.billing,
  urgency: "Normal",
  responsible_id: null,
  responsible2_id: "responsible-legacy-2",
  responsible3_id: null,
  start_date: null,
  prevision_date: null,
  end_date: null,
  date_created: "2026-09-01T12:00:00.000Z",
  date_updated: "2026-09-01T12:00:00.000Z",
};

async function installApiMocks(
  page,
  taskListRequests,
  clientDetailRequests,
  createTaskRequests,
  updateTaskRequests,
) {
  await page.route("**/user/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: smokeUser },
    }),
  );
  await page.route("**/task/list*", (route) => {
    const requestUrl = new URL(route.request().url());
    taskListRequests.push(requestUrl);
    const requestClientId = requestUrl.searchParams.get("client_id");
    if (requestClientId !== null && (!requestClientId || requestClientId.includes(","))) {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        json: { error: "client_id inválido" },
      });
    }
    if (requestClientId === externalClientId || requestClientId === missingClientId) {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        json: { success: false, error: "Cliente não encontrado.", code: "NOT_FOUND" },
      });
    }
    const filteredTasks =
      requestUrl.searchParams.get("assignment") === "assigned" ? [assignedTask] : [task];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: {
          data: filteredTasks,
          total: 1,
          hasMore: false,
          summary: { inProgress: 1, billable: 0 },
        },
      },
    });
  });
  await page.route("**/client/*", (route) => {
    const requestUrl = new URL(route.request().url());
    clientDetailRequests.push(requestUrl);
    if (!requestUrl.pathname.endsWith(`/client/${clientId}`)) {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        json: { error: "Cliente não encontrado" },
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: {
          id: clientId,
          name: "Cliente Filtro",
          company_name: "Cliente Filtro",
          cpf_cnpj: "00.000.000/0001-00",
        },
      },
    });
  });
  await page.route("**/client/list*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        data: {
          items: [
            {
              id: clientId,
              name: "Cliente Filtro",
              company_name: "Cliente Filtro",
              cpf_cnpj: "00.000.000/0001-00",
            },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
          hasMore: false,
        },
      },
    }),
  );
  await page.route("**/department/list*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        data: [
          { id: "department-one", name: "Departamento com candidatos", status: "Ativo" },
          { id: "department-sole", name: "Departamento com candidato único", status: "Ativo" },
          { id: "department-multiple", name: "Departamento com múltiplos", status: "Ativo" },
          { id: "department-empty", name: "Departamento sem candidatos", status: "Ativo" },
        ],
      },
    }),
  );
  await page.route("**/task/model/list*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: [
          {
            id: "model-default",
            name: "Modelo com padrão",
            department_id: "department-one",
            responsible_id: "responsible-default",
            department: {
              id: "department-one",
              name: "Departamento com candidatos",
              users: [
                { id: "responsible-default", name: "Responsável padrão" },
                { id: "responsible-alternative", name: "Responsável alternativo" },
              ],
            },
          },
          {
            id: "model-sole",
            name: "Modelo com candidato único",
            department_id: "department-sole",
            responsible_id: "legacy-ineligible",
            department: {
              id: "department-sole",
              name: "Departamento com candidato único",
              users: [{ id: "responsible-sole", name: "Responsável único" }],
            },
          },
          {
            id: "model-multiple",
            name: "Modelo com múltiplos candidatos",
            department_id: "department-multiple",
            responsible_id: "legacy-ineligible",
            department: {
              id: "department-multiple",
              name: "Departamento com múltiplos",
              users: [
                { id: "responsible-one", name: "Responsável um" },
                { id: "responsible-two", name: "Responsável dois" },
              ],
            },
          },
          {
            id: "model-empty",
            name: "Modelo sem candidato",
            department_id: "department-empty",
            responsible_id: "legacy-ineligible",
            department: {
              id: "department-empty",
              name: "Departamento sem candidatos",
              users: [],
            },
          },
        ],
      },
    }),
  );
  await page.route("**/project/list*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: [{ id: "project-one", name: "Projeto smoke" }] },
    }),
  );
  await page.route(/\/task(?:\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      createTaskRequests.push(request.postDataJSON());
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        json: { success: true, data: { create: { ...legacyTaskDetail, id: "task-created" } } },
      });
    }
    if (request.method() === "PUT") {
      const payload = request.postDataJSON();
      updateTaskRequests.push(payload);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        json: {
          success: true,
          data: { ...legacyTaskDetail, responsible_id: payload.responsible_id ?? null },
        },
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: { detail: legacyTaskDetail } },
    });
  });
}

async function runBrowserProof() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 900 },
  });
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
  const taskListRequests = [];
  const clientDetailRequests = [];
  const createTaskRequests = [];
  const updateTaskRequests = [];
  await installApiMocks(
    page,
    taskListRequests,
    clientDetailRequests,
    createTaskRequests,
    updateTaskRequests,
  );

  try {
    await page.goto(`/tasks?clientId=${clientId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Tarefas", level: 1 })).toBeVisible();
    await expect(page.getByText("Tarefa sem responsável", { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Sem responsável", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Cliente Filtro.*00\.000\.000\/0001-00/ }),
    ).toBeVisible();
    await expect.poll(() => clientDetailRequests.length).toBeGreaterThan(0);
    assert.equal(
      clientDetailRequests.every((url) => url.pathname.endsWith(`/client/${clientId}`)),
      true,
      "A seleção profunda deve ser hidratada exclusivamente pelo ID da URL.",
    );
    await expect.poll(() => taskListRequests.length).toBeGreaterThan(0);
    assert.equal(
      taskListRequests.every((url) => url.searchParams.get("client_id") === clientId),
      true,
      "A abertura com clientId não pode disparar uma listagem de tarefas sem o cliente.",
    );

    await page.getByLabel("Atribuição").selectOption("unassigned");
    await expect
      .poll(() => taskListRequests.some((url) => url.searchParams.get("assignment") === "unassigned"))
      .toBe(true);
    const combinedRequest = taskListRequests.at(-1);
    assert.equal(combinedRequest.searchParams.get("client_id"), clientId);
    assert.equal(combinedRequest.searchParams.get("assignment"), "unassigned");

    await page.getByRole("button", { name: "Nova tarefa" }).click();
    const dialog = page.getByRole("dialog", { name: "Nova tarefa" });
    await expect(dialog).toBeVisible();
    const department = dialog.getByLabel("Departamento");
    const model = dialog.getByLabel("Modelo de tarefa");
    const responsible = dialog.getByLabel("Responsável");
    await dialog.getByLabel("Projeto").selectOption("project-one");
    await dialog.getByLabel("Observações").fill("Criação smoke");

    await department.selectOption("department-one");
    await model.selectOption("model-default");
    await expect(responsible).toHaveValue("responsible-default");
    await expect(responsible.locator('option[value=""]')).toHaveAttribute("disabled", "");

    await department.selectOption("department-sole");
    await model.selectOption("model-sole");
    await expect(responsible).toHaveValue("responsible-sole");
    await expect(responsible).toBeDisabled();

    await department.selectOption("department-multiple");
    await model.selectOption("model-multiple");
    await expect(responsible).toHaveValue("");
    await expect(responsible).toBeEnabled();
    await expect(responsible.locator('option[value=""]')).toHaveAttribute("disabled", "");
    await dialog.getByRole("button", { name: "Criar tarefa" }).click();
    await expect(dialog).toBeVisible();
    assert.equal(
      createTaskRequests.length,
      0,
      "A UI não pode submeter quando há vários candidatos e nenhum responsável foi escolhido.",
    );

    await department.selectOption("department-empty");
    await expect(model).toHaveValue("");
    await model.selectOption("model-empty");
    await expect(responsible).toHaveValue("");
    await expect(responsible.locator('option[value=""]')).toHaveText("Sem responsável");
    await department.selectOption("department-one");
    await model.selectOption("model-default");
    await dialog.getByRole("button", { name: "Criar tarefa" }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => createTaskRequests.length).toBe(1);
    assert.deepEqual(
      {
        client_id: createTaskRequests[0].client_id,
        project_id: createTaskRequests[0].project_id,
        model_id: createTaskRequests[0].model_id,
        department_id: createTaskRequests[0].department_id,
        responsible_id: createTaskRequests[0].responsible_id,
      },
      {
        client_id: clientId,
        project_id: "project-one",
        model_id: "model-default",
        department_id: "department-one",
        responsible_id: "responsible-default",
      },
    );

    await page.getByRole("button", { name: `Editar tarefa ${task.name}` }).click();
    const editDialog = page.getByRole("dialog", { name: "Editar tarefa" });
    await expect(editDialog).toBeVisible();
    const editModel = editDialog.getByLabel("Modelo de tarefa");
    const editResponsible = editDialog.getByLabel("Responsável");
    await expect(editModel).toHaveValue("model-legacy");
    await expect(editResponsible.locator('option[value="responsible-alternative"]')).toHaveText(
      "Responsável alternativo",
    );
    await editResponsible.selectOption("responsible-alternative");
    await editDialog.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(editDialog).toHaveCount(0);
    await expect.poll(() => updateTaskRequests.length).toBe(1);
    assert.equal(updateTaskRequests[0].responsible_id, "responsible-alternative");
    assert.equal(
      Object.hasOwn(updateTaskRequests[0], "model_id"),
      false,
      "A atribuição posterior não pode migrar implicitamente o modelo legado.",
    );

    await page.getByLabel("Atribuição").selectOption("assigned");
    await expect(page.getByText(assignedTask.name, { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Com responsável", exact: true })).toBeVisible();
    const assignedRequest = taskListRequests.at(-1);
    assert.equal(assignedRequest.searchParams.get("client_id"), clientId);
    assert.equal(assignedRequest.searchParams.get("assignment"), "assigned");

    await page.getByLabel("Atribuição").selectOption("all");
    await page.getByRole("button", { name: /Cliente Filtro/ }).click();
    await page.getByRole("option", { name: "Sem cliente selecionado" }).click();
    await expect(page).toHaveURL(
      (url) => url.pathname === "/tasks" && !url.searchParams.has("clientId"),
    );
    await expect
      .poll(() => taskListRequests.some((url) => !url.searchParams.has("client_id")))
      .toBe(true);

    for (const rejectedClientId of [externalClientId, missingClientId]) {
      const requestsBeforeRejectedClient = taskListRequests.length;
      await page.evaluate(
        (url) => window.next.router.replace(url, undefined, { shallow: true }),
        `/tasks?clientId=${rejectedClientId}`,
      );
      await expect.poll(() => taskListRequests.length).toBeGreaterThan(requestsBeforeRejectedClient);
      assert.equal(taskListRequests.at(-1).searchParams.get("client_id"), rejectedClientId);
      await expect(page.getByText(task.name, { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Selecionar cliente" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Nova tarefa" })).toBeDisabled();
    }

    const requestsBeforeInvalidRoute = taskListRequests.length;
    await page.evaluate(
      (url) => window.next.router.replace(url, undefined, { shallow: true }),
      `/tasks?clientId=${clientId}&clientId=${secondClientId}`,
    );
    await expect(page).toHaveURL(
      (url) => url.searchParams.getAll("clientId").length === 2,
    );
    await expect.poll(() => taskListRequests.length).toBeGreaterThan(requestsBeforeInvalidRoute);
    assert.equal(
      taskListRequests.at(-1).searchParams.get("client_id"),
      `${clientId},${secondClientId}`,
      "clientId repetido deve chegar inválido ao backend, nunca virar uma listagem sem cliente.",
    );
    await expect(page.getByText("Tarefa sem responsável", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Selecionar cliente" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nova tarefa" })).toBeDisabled();

    const requestsBeforeEmptyRoute = taskListRequests.length;
    await page.evaluate(
      (url) => window.next.router.replace(url, undefined, { shallow: true }),
      "/tasks?clientId=",
    );
    await expect(page).toHaveURL((url) => url.searchParams.has("clientId"));
    await expect.poll(() => taskListRequests.length).toBeGreaterThan(requestsBeforeEmptyRoute);
    assert.equal(
      taskListRequests.at(-1).searchParams.get("client_id"),
      "",
      "clientId vazio deve chegar inválido ao backend, nunca virar uma listagem sem cliente.",
    );
    await expect(page.getByText("Tarefa sem responsável", { exact: true })).toHaveCount(0);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function withNextServer(run) {
  if (configuredBaseUrl) {
    await run();
    return;
  }

  const command = process.platform === "win32" ? "cmd" : "corepack";
  const args =
    process.platform === "win32"
      ? ["/c", "pnpm", "exec", "next", "dev", "--webpack", "--port", PORT]
      : ["pnpm", "exec", "next", "dev", "--webpack", "--port", PORT];
  const server = spawn(command, args, {
    cwd: appRoot,
    env: process.env,
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
    if (server.pid && server.exitCode === null) {
      if (process.platform === "win32") {
        execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        server.kill("SIGTERM");
      }
    }
  }
}

async function waitForServer(server, getOutput) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45_000) {
    if (server.exitCode !== null) {
      throw new Error(`Next dev encerrou antes do smoke.\n${getOutput()}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok || response.status < 500) return;
    } catch {
      // Aguarda o bind do Next na porta dedicada.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Tempo esgotado aguardando Next em ${baseUrl}.\n${getOutput()}`);
}

await withNextServer(runBrowserProof);
console.log("PASS tarefas preservam clientId, combinam atribuição e resolvem responsável elegível");
