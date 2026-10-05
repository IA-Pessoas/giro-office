import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium, expect as baseExpect } from "@playwright/test";

// Os 5s padrao do Playwright bastam nesta maquina, mas nao no runner do CI:
// fechar o dialogo depende de "Salvar alteracoes" completar a requisicao.
const expect = baseExpect.configure({ timeout: 15_000 });

import { browserSmokeEnv } from "../../shared/testing/browserSmokeEnv.mjs";

const PORT = process.env.TASKS_BROWSER_PORT || "3116";
const configuredBaseUrl = process.env.TASKS_BROWSER_BASE_URL?.replace(/\/$/, "");
const baseUrl = configuredBaseUrl || `http://localhost:${PORT}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const clientId = "11111111-1111-4111-8111-111111111111";
const secondClientId = "22222222-2222-4222-8222-222222222222";
const externalClientId = "33333333-3333-4333-8333-333333333333";
const missingClientId = "44444444-4444-4444-8444-444444444444";
const financeScreenshotPath =
  process.env.TASKS_FINANCEIRO_SCREENSHOT_PATH ?? "output/playwright/issue-301-finance-task.png";
const financeMobileScreenshotPath =
  process.env.TASKS_FINANCEIRO_MOBILE_SCREENSHOT_PATH ??
  "output/playwright/issue-301-finance-task-mobile.png";
const releasedServicesScreenshotPath =
  process.env.TASKS_RELEASED_SERVICES_SCREENSHOT_PATH ??
  "output/playwright/issue-1243-released-services.png";
const departmentChangeScreenshotPath =
  process.env.TASKS_DEPARTMENT_CHANGE_SCREENSHOT_PATH ??
  "../output/playwright/issue-1593-department-change.png";

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
  client_name: "Cliente Filtro",
  project_name: "Projeto migração",
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
  responsible_name: smokeUser.name,
};

const uniqueServiceTask = {
  ...task,
  id: "task-unique-released",
  name: "Serviço único liberado",
  client_name: "Empresa serviço único",
  project_name: "Projeto serviço único",
};

const legacyTaskDetail = {
  id: task.id,
  model_id: "model-legacy",
  project_id: "project-one",
  client_id: clientId,
  name: task.name,
  status: task.status,
  department_id: "department-legacy",
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

const assignedTaskDetail = {
  ...legacyTaskDetail,
  id: assignedTask.id,
  name: assignedTask.name,
  responsible_id: smokeUser.id,
};

async function installApiMocks(
  page,
  taskListRequests,
  clientDetailRequests,
  createTaskRequests,
  updateTaskRequests,
  responsibleOptionsRequests,
  regularizeLinkRequests,
  financeSettlementRequests,
) {
  let currentLegacyTaskDetail = { ...legacyTaskDetail };
  let financeQueue = [
    {
      id: "task-finance-pending",
      name: "Tarefa financeira pendente",
      client_id: clientId,
      department_id: "department-one",
      status: "Em andamento",
    },
    {
      id: "task-finance-single",
      name: "Tarefa financeira individual",
      client_id: clientId,
      department_id: "department-one",
      status: "Pendente",
    },
  ];
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
    const filteredTasks = requestUrl.searchParams.get("unique_service_released") === "true"
      ? [uniqueServiceTask]
      : requestUrl.searchParams.get("assignment") === "assigned"
        ? [assignedTask]
        : [task];
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
          { id: "department-legacy", name: "Departamento legado", status: "Ativo" },
          { id: "department-sole", name: "Departamento com candidato único", status: "Ativo" },
          { id: "department-multiple", name: "Departamento com múltiplos", status: "Ativo" },
          { id: "department-empty", name: "Departamento sem candidatos", status: "Ativo" },
        ],
      },
    }),
  );
  await page.route("**/rh/operational-users*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: [{ id: smokeUser.id, name: smokeUser.name, status: "Ativo" }],
      },
    }),
  );
  await page.route(/\/task\/financeiro\/queue(?:\?.*)?$/, (route) => {
    const requestUrl = new URL(route.request().url());
    const departmentId = requestUrl.searchParams.get("department_id");
    if (requestUrl.searchParams.get("client_id") !== clientId || (departmentId && departmentId !== "department-one")) {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        json: { success: false, error: "Parâmetros financeiros inválidos" },
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: financeQueue },
    });
  });
  await page.route(/\/task\/financeiro\/collectors(?:\?.*)?$/, (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.searchParams.get("department_id") !== "department-one") {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        json: { success: false, error: "Departamento financeiro inválido" },
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: [] },
    });
  });
  await page.route(/\/task\/financeiro$/, (route) => {
    const request = route.request();
    if (request.method() !== "PUT") return route.continue();
    const body = request.postDataJSON();
    financeSettlementRequests.push({
      method: request.method(),
      body,
      idempotencyKey: request.headers()["idempotency-key"],
    });
    financeQueue = financeQueue.filter((item) => item.id !== body.task_id);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: { task_ids: [body.task_id], settled: 1 } },
    });
  });
  await page.route(/\/task\/financeiro\/settle$/, (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const body = request.postDataJSON();
    financeSettlementRequests.push({
      method: request.method(),
      body,
      idempotencyKey: request.headers()["idempotency-key"],
    });
    const taskIds = body.task_ids;
    financeQueue = financeQueue.filter((item) => !taskIds.includes(item.id));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: { task_ids: taskIds, settled: taskIds.length } },
    });
  });
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
            id: "model-stale",
            name: "Modelo incompatível no servidor",
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
  await page.route(/\/task\/model(?:\?.*)?$/, (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: {
          detail: {
            id: "model-default",
            name: "Modelo com padrão",
            department_id: "department-one",
            responsible_id: "responsible-default",
            responsible2_id: null,
            responsible3_id: null,
            observations: "Modelo para smoke",
            billing: "Não Realizar",
            prevision: 1,
          },
        },
      },
    });
  });
  await page.route(/\/task\/model\/dependent(?:\?.*)?$/, (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: [] },
    });
  });
  await page.route(/\/task\/integration(?:\?.*)?$/, (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        json: {
          success: true,
          data: [
            {
              id: "link-missing",
              task_model_id: "model-default",
              referring: "process-missing",
              referring_type: "process",
              available: false,
            },
          ],
        },
      });
    }
    regularizeLinkRequests.push({ method: request.method(), body: request.postDataJSON() });
    return route.fulfill({
      status: request.method() === "POST" ? 201 : 200,
      contentType: "application/json",
      json: { success: true, data: {} },
    });
  });
  await page.route("**/regularize/processes*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: [{ id: "process-1", process_type: "Abertura" }],
      },
    }),
  );
  await page.route("**/regularize/licenses*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: [{ id: "license-1", type_license: "Alvará" }],
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
  await page.route("**/task/deps/options*", (route) => {
    const requestUrl = new URL(route.request().url());
    responsibleOptionsRequests.push(requestUrl);
    const departmentId = requestUrl.searchParams.get("department_id");
    const users =
      departmentId === "department-legacy" || departmentId === "department-one"
        ? [
            { id: "responsible-default", name: "Responsável padrão" },
            { id: "responsible-alternative", name: "Responsável alternativo" },
          ]
        : [];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: { users, departments: [] } },
    });
  });
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
      if (payload.model_id === "model-stale") {
        return route.fulfill({
          status: 422,
          contentType: "application/json",
          json: {
            success: false,
            error: "Modelo de tarefa não é elegível para o departamento informado.",
            code: "UNPROCESSABLE_ENTITY",
          },
        });
      }
      const currentDetail =
        payload.task_id === assignedTask.id ? assignedTaskDetail : currentLegacyTaskDetail;
      const updatedDetail = {
        ...currentDetail,
        ...payload,
        ...(payload.model_id ? { responsible2_id: null, responsible3_id: null } : {}),
      };
      if (payload.task_id === currentLegacyTaskDetail.id) {
        currentLegacyTaskDetail = updatedDetail;
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        json: {
          success: true,
          data: updatedDetail,
        },
      });
    }
    const taskId = new URL(request.url()).searchParams.get("task_id");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: {
          detail: taskId === assignedTask.id ? assignedTaskDetail : currentLegacyTaskDetail,
        },
      },
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
  page.setDefaultNavigationTimeout(120_000);
  const taskListRequests = [];
  const clientDetailRequests = [];
  const createTaskRequests = [];
  const updateTaskRequests = [];
  const responsibleOptionsRequests = [];
  const regularizeLinkRequests = [];
  const financeSettlementRequests = [];
  await installApiMocks(
    page,
    taskListRequests,
    clientDetailRequests,
    createTaskRequests,
    updateTaskRequests,
    responsibleOptionsRequests,
    regularizeLinkRequests,
    financeSettlementRequests,
  );

  try {
    await page.goto(`/tasks?clientId=${clientId}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page.getByRole("heading", { name: "Tarefas", level: 1 })).toBeVisible();
    await expect(page.getByText("Tarefa sem responsável", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fila financeira", level: 2 })).toBeVisible();
    await expect(page.getByText("Tarefa financeira pendente", { exact: true })).toBeVisible();
    await expect(page.getByText("Tarefa financeira individual", { exact: true })).toBeVisible();

    const releasedServicesFilter = page.getByLabel("Liberação do Comercial");
    await releasedServicesFilter.selectOption("true");
    await expect
      .poll(() =>
        taskListRequests.some((url) => url.searchParams.get("unique_service_released") === "true"),
      )
      .toBe(true);
    await expect(page.getByText(uniqueServiceTask.name, { exact: true })).toBeVisible();
    await expect(page.getByText(uniqueServiceTask.client_name, { exact: true })).toBeVisible();
    await expect(page.getByText(uniqueServiceTask.project_name, { exact: true })).toBeVisible();
    await page.screenshot({ path: releasedServicesScreenshotPath, fullPage: true });
    await releasedServicesFilter.selectOption("");
    await expect(page.getByText(task.name, { exact: true })).toBeVisible();

    await page.screenshot({ path: financeScreenshotPath, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Fila financeira", level: 2 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Baixa Express do cliente" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nova tarefa" })).toBeVisible();
    await page.screenshot({ path: financeMobileScreenshotPath, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("checkbox", { name: "Selecionar Tarefa financeira pendente" }).check();
    await page.getByRole("button", { name: "Baixar selecionadas (1)" }).click();
    await expect(page.getByText("1 tarefa(s) baixada(s).", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Tarefa financeira individual", { exact: true })).toBeVisible();
    const individualFinanceRow = page
      .getByText("Tarefa financeira individual", { exact: true })
      .locator("..");
    await individualFinanceRow.getByRole("button", { name: "Baixar", exact: true }).click();
    await expect(page.getByText("1 tarefa(s) baixada(s).", { exact: true })).toBeVisible();
    await expect(page.getByText("Nenhuma tarefa financeira pendente.", { exact: true })).toBeVisible();
    assert.deepEqual(
      financeSettlementRequests.map(({ method, body }) => ({ method, body })),
      [
        { method: "POST", body: { task_ids: ["task-finance-pending"] } },
        { method: "PUT", body: { task_id: "task-finance-single" } },
      ],
    );
    for (const request of financeSettlementRequests) {
      assert.match(request.idempotencyKey, /^[0-9a-f-]{36}$/);
    }
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
    await dialog.getByRole("button", { name: "Criar tarefa" }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => createTaskRequests.length).toBe(1);
    assert.equal(createTaskRequests[0].responsible_id, null);

    await page.getByRole("button", { name: "Nova tarefa" }).click();
    const assignedCreateDialog = page.getByRole("dialog", { name: "Nova tarefa" });
    await assignedCreateDialog.getByLabel("Projeto").selectOption("project-one");
    await assignedCreateDialog.getByLabel("Observações").fill("Criação atribuída smoke");
    await assignedCreateDialog.getByLabel("Departamento").selectOption("department-one");
    await assignedCreateDialog.getByLabel("Modelo de tarefa").selectOption("model-default");
    await assignedCreateDialog.getByRole("button", { name: "Criar tarefa" }).click();
    await expect(assignedCreateDialog).toHaveCount(0);
    await expect.poll(() => createTaskRequests.length).toBe(2);

    assert.deepEqual(
      {
        client_id: createTaskRequests[1].client_id,
        project_id: createTaskRequests[1].project_id,
        model_id: createTaskRequests[1].model_id,
        department_id: createTaskRequests[1].department_id,
        responsible_id: createTaskRequests[1].responsible_id,
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
    await expect(editModel.locator('option[value="model-default"]')).toHaveCount(0);
    await expect(editResponsible.locator('option[value="responsible-alternative"]')).toHaveText(
      "Responsável alternativo",
    );
    assert.equal(
      responsibleOptionsRequests.at(-1).searchParams.get("department_id"),
      "department-legacy",
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

    await page.getByRole("button", { name: `Editar tarefa ${task.name}` }).click();
    const swapDialog = page.getByRole("dialog", { name: "Editar tarefa" });
    await expect(swapDialog).toBeVisible();
    await expect(swapDialog.getByLabel("Nome")).toHaveValue(task.name);
    await expect(swapDialog.getByLabel("Observações")).toHaveValue("Legado preservado");
    await swapDialog.getByLabel("Departamento").selectOption("department-one");
    await swapDialog.getByLabel("Modelo de tarefa").selectOption("model-stale");
    await expect(swapDialog.getByLabel("Responsável")).toHaveValue("responsible-default");
    await swapDialog.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(swapDialog).toBeVisible();
    await expect(
      page.getByText("Modelo de tarefa não é elegível para o departamento informado.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect.poll(() => updateTaskRequests.length).toBe(2);

    await swapDialog.getByLabel("Modelo de tarefa").selectOption("model-default");
    await swapDialog.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(swapDialog).toHaveCount(0);
    await expect.poll(() => updateTaskRequests.length).toBe(3);
    assert.deepEqual(
      {
        model_id: updateTaskRequests[2].model_id,
        department_id: updateTaskRequests[2].department_id,
        responsible_id: updateTaskRequests[2].responsible_id,
        name: updateTaskRequests[2].name,
        status: updateTaskRequests[2].status,
        observations: updateTaskRequests[2].observations,
        billing: updateTaskRequests[2].billing,
        urgency: updateTaskRequests[2].urgency,
      },
      {
        model_id: "model-default",
        department_id: "department-one",
        responsible_id: "responsible-default",
        name: task.name,
        status: task.status,
        observations: "Legado preservado",
        billing: task.billing,
        urgency: "Normal",
      },
      "A troca válida deve resolver o responsável e preservar os demais campos editáveis.",
    );
    assert.equal(Object.hasOwn(updateTaskRequests[2], "prevision_date"), false);

    await page.getByRole("button", { name: `Editar tarefa ${task.name}` }).click();
    const persistedSwapDialog = page.getByRole("dialog", { name: "Editar tarefa" });
    await expect(persistedSwapDialog.getByLabel("Departamento")).toHaveValue("department-one");
    await expect(persistedSwapDialog.getByLabel("Modelo de tarefa")).toHaveValue("model-default");
    await expect(persistedSwapDialog.getByLabel("Responsável")).toHaveValue(
      "responsible-default",
    );
    await expect(persistedSwapDialog.getByLabel("Observações")).toHaveValue(
      "Legado preservado",
    );
    await expect(page.locator(".Toastify__toast")).toHaveCount(0, { timeout: 7_000 });
    await persistedSwapDialog
      .locator("label")
      .filter({ hasText: "Departamento" })
      .screenshot({ path: departmentChangeScreenshotPath });
    await persistedSwapDialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(persistedSwapDialog).toHaveCount(0);

    await page.getByLabel("Atribuição").selectOption("assigned");
    await expect(page.getByText(assignedTask.name, { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: smokeUser.name, exact: true })).toBeVisible();
    const assignedRequest = taskListRequests.at(-1);
    assert.equal(assignedRequest.searchParams.get("client_id"), clientId);
    assert.equal(assignedRequest.searchParams.get("assignment"), "assigned");

    smokeUser.modules.integracao = 1;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByLabel("Atribuição").selectOption("assigned");
    await page.getByRole("button", { name: `Editar tarefa ${assignedTask.name}` }).click();
    const restrictedDialog = page.getByRole("dialog", { name: "Editar tarefa" });
    await expect(restrictedDialog).toBeVisible();
    await expect(restrictedDialog.getByLabel("Departamento")).toHaveCount(0);
    await expect(restrictedDialog.getByLabel("Responsável")).toHaveCount(0);
    await restrictedDialog.getByLabel("Observações").fill("Atualização restrita");
    await restrictedDialog
      .getByRole("button", { name: "Salvar status e observações" })
      .click();
    await expect(restrictedDialog).toHaveCount(0);
    await expect.poll(() => updateTaskRequests.length).toBe(4);
    assert.deepEqual(Object.keys(updateTaskRequests[3]).sort(), [
      "observations",
      "status",
      "task_id",
    ]);

    smokeUser.modules.integracao = 3;
    await page.reload({ waitUntil: "domcontentloaded" });
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

    await page.goto("/configs/integracao/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Modelos de tarefas", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Editar modelo Modelo com padrão" }).click();
    const modelDialog = page.getByRole("dialog", { name: "Editar modelo" });
    await expect(modelDialog).toBeVisible();
    await expect(modelDialog.getByText("Processo: process-missing (indisponível)")).toBeVisible();
    await modelDialog.getByLabel("Tipo de destino Regularize").selectOption("process");
    await modelDialog.getByLabel("Destino Regularize", { exact: true }).selectOption("process-1");
    await modelDialog.getByRole("button", { name: "Adicionar vínculo Regularize" }).click();
    await expect.poll(() => regularizeLinkRequests.length).toBe(1);
    assert.deepEqual(regularizeLinkRequests[0], {
      method: "POST",
      body: {
        task_model_id: "model-default",
        referring: "process-1",
        referring_type: "process",
      },
    });
    await modelDialog.getByRole("button", { name: "Remover vínculo Regularize" }).first().click();
    await page.getByRole("dialog", { name: "Remover vínculo do Regularize?" })
      .getByRole("button", { name: "Remover vínculo", exact: true }).click();
    await expect.poll(() => regularizeLinkRequests.length).toBe(2);
    assert.equal(regularizeLinkRequests[1].method, "DELETE");
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
