import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";

import { browserSmokeEnv } from "../../shared/testing/browserSmokeEnv.mjs";

const PORT = process.env.PROJECT_WIZARD_BROWSER_PORT || "3117";
const configuredBaseUrl = process.env.PROJECT_WIZARD_BROWSER_BASE_URL?.replace(/\/$/, "");
const baseUrl = configuredBaseUrl || `http://localhost:${PORT}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const failureArtifactDir =
  process.env.PROJECT_WIZARD_BROWSER_ARTIFACT_DIR || path.join(appRoot, "smoke-artifacts");
const clientId = "11111111-1111-4111-8111-111111111111";
const departments = [
  { id: "department-one", name: "Fiscal" },
  { id: "department-two", name: "Contábil" },
  { id: "department-empty", name: "Sem equipe" },
];
const candidates = [
  { id: "ana", name: "Ana" },
  { id: "bia", name: "Bia" },
];
const taskModels = [
  {
    id: "model-default",
    name: "Modelo padrão",
    department_id: "department-one",
    responsible_id: "ana",
    department: { ...departments[0], users: candidates },
  },
  {
    id: "model-choice",
    name: "Modelo com escolha",
    department_id: "department-one",
    responsible_id: "ineligible",
    department: { ...departments[0], users: candidates },
  },
  {
    id: "model-single",
    name: "Modelo único",
    department_id: "department-two",
    responsible_id: "ineligible",
    department: { ...departments[1], users: [{ id: "caio", name: "Caio" }] },
  },
  {
    id: "model-empty",
    name: "Modelo sem equipe",
    department_id: "department-empty",
    responsible_id: "ineligible",
    department: { ...departments[2], users: [] },
  },
];

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

async function installApiMocks(
  page,
  previewRequests,
  wizardRequests,
  extractionRequests = [],
  firstExtractionGate,
  invalidExtractionRequests = [],
) {
  const existingTask = {
    id: "task-existing",
    name: "Tarefa anterior",
    status: "A Realizar",
    billing: "Não Realizar",
    isOwn: false,
    isUnassigned: true,
    charge_comercial: false,
    charge_financeiro: false,
    hiring_status: null,
    payment: null,
    billing_description: null,
  };
  let taskList = [existingTask];
  let failFirstModelChoicePreview = true;
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
      json: { success: true, data: departments },
    }),
  );
  await page.route("**/task/model/list*", (route) =>
    route.fulfill({ status: 200, json: { success: true, data: taskModels } }),
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
  await page.route("**/task/project-wizard/extract-tasks", async (route) => {
    const request = route.request();
    const contentType = request.headers()["content-type"] ?? "";
    for (const [filename, error] of [
      ["ata-corrompida.docx", "O arquivo DOCX está corrompido ou não pôde ser lido."],
      ["ata-digitalizada.pdf", "O arquivo da Ata não contém texto."],
    ]) {
      if (request.postDataBuffer()?.includes(Buffer.from(`filename="${filename}"`))) {
        invalidExtractionRequests.push(filename);
        await route.fulfill({ status: 400, json: { success: false, error } });
        return;
      }
    }
    extractionRequests.push({
      contentType,
      body: contentType.startsWith("multipart/form-data")
        ? request.postDataBuffer().toString()
        : request.postDataJSON(),
    });
    const extractionNumber = extractionRequests.length;
    if (extractionNumber === 1) {
      await firstExtractionGate;
    }
    if (extractionNumber === 3) {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        json: { success: false, error: "Nenhuma tarefa foi identificada na Ata." },
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: {
          tasks: [
            {
              name:
                extractionNumber === 1
                  ? "Apurar impostos do trimestre"
                  : "Conferir impostos reextraídos",
              prevision_date: "2026-09-15",
              department_id: "department-one",
              model_id: "model-default",
            },
          ],
        },
      },
    });
  });

  await page.route("**/task/project-wizard/preview", async (route) => {
    const body = route.request().postDataJSON();
    previewRequests.push(body);
    if (
      failFirstModelChoicePreview &&
      body.tasks.some((task) => task.model_id === "model-choice")
    ) {
      failFirstModelChoicePreview = false;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        json: {
          error:
            "Modelo model-choice repetido entre principal 1 (Apuração revisada) e dependência model-choice.",
        },
      });
      return;
    }
    const tasks = body.tasks.map((task) => ({
      ...task,
      status: "A Realizar",
      observation: "Observação do Modelo",
      dependencies:
        task.model_id === "model-choice"
          ? [
              {
                name: "Dependência em espera",
                model_id: "model-default",
                department_id: "department-one",
                status: "Em Espera",
                observation: "Aguardar a tarefa principal",
                responsible_id: "responsible-not-loaded",
              },
            ]
          : task.model_id === "model-default"
            ? [
                {
                  name: "Dependência sem responsável",
                  model_id: "model-empty",
                  department_id: "department-empty",
                  status: "A Realizar",
                  observation: "Iniciar junto da tarefa principal",
                  responsible_id: null,
                },
              ]
            : [],
    }));
    if (body.tasks.some((task) => task.model_id === "model-default")) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { success: true, data: { tasks, revision: `revision-${previewRequests.length}` } },
    });
  });
  await page.route("**/task/project-wizard", async (route) => {
    const request = route.request();
    wizardRequests.push({
      body: request.postDataJSON(),
      key: request.headers()["idempotency-key"],
    });
    if (wizardRequests.length === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        json: { error: "Tente novamente." },
      });
      return;
    }
    if (wizardRequests.length > 2) {
      taskList = [
        existingTask,
        { ...existingTask, id: "task-created-one", name: "Apuração final", isUnassigned: false },
        { ...existingTask, id: "task-created-two", name: "Dependência sem responsável" },
      ];
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      json: {
        success: true,
        data: {
          project: { ...project, id: "project-created" },
          counts:
            wizardRequests.length > 2
              ? { main: 1, dependencies: 1, unassigned: 1 }
              : { main: 0, dependencies: 0, unassigned: 0 },
        },
      },
    });
  });
  await page.route("**/task/list*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        success: true,
        data: {
          data: taskList,
          total: taskList.length,
          hasMore: false,
          summary: { inProgress: 0, billable: 0 },
        },
      },
    }),
  );
}

/**
 * Captura de falha sem vazar a Ata: o trace do Playwright registraria o texto digitado e o vídeo
 * mostraria a digitação, então a evidência é um screenshot com os campos da Ata mascarados.
 * Grava em app/smoke-artifacts/ por padrão; PROJECT_WIZARD_BROWSER_ARTIFACT_DIR muda o destino.
 */
async function captureEvidence(page, name) {
  if (process.env.PROJECT_WIZARD_BROWSER_CAPTURE !== "1") return;
  await mkdir(failureArtifactDir, { recursive: true });
  await page.screenshot({
    path: path.join(failureArtifactDir, `${name}.png`),
    fullPage: true,
    mask: [
      page.getByLabel("Cole a Ata para extrair tarefas"),
      page.getByLabel("Selecione um arquivo .txt, .md, .docx ou .pdf"),
    ],
    maskColor: "#94a3b8",
  });
}

async function captureFailureArtifact(page) {
  try {
    await mkdir(failureArtifactDir, { recursive: true });
    const file = path.join(failureArtifactDir, `project-wizard-failure-${Date.now()}.png`);
    await page.screenshot({
      path: file,
      fullPage: true,
      mask: [
        page.getByLabel("Cole a Ata para extrair tarefas"),
        page.getByLabel("Selecione um arquivo .txt, .md, .docx ou .pdf"),
      ],
      maskColor: "#94a3b8",
    });
    console.error(`Evidência da falha: ${file}`);
  } catch (artifactError) {
    console.error("Não foi possível capturar a evidência da falha.", artifactError);
  }
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
  const previewRequests = [];
  const wizardRequests = [];
  const updateRequests = [];
  const extractionRequests = [];
  const invalidExtractionRequests = [];
  let releaseFirstExtraction;
  const firstExtractionGate = new Promise((resolve) => {
    releaseFirstExtraction = resolve;
  });
  async function expectLockedClient(wizard) {
    await expect(wizard.getByText("Cliente Wizard", { exact: true })).toHaveCount(1);
    await expect(wizard.getByText("Cliente Wizard", { exact: true })).toBeVisible();
    await expect(wizard.getByRole("combobox", { name: "Cliente", exact: true })).toHaveCount(0);
    await expect(wizard.getByRole("button", { name: /cliente/i })).toHaveCount(0);
  }

  try {
    await installApiMocks(
      page,
      previewRequests,
      wizardRequests,
      extractionRequests,
      firstExtractionGate,
      invalidExtractionRequests,
    );
    await page.route("**/project", async (route) => {
      assert.equal(route.request().method(), "PUT");
      updateRequests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        json: { success: true, data: project },
      });
    });

    await page.goto("/projects", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Novo projeto" })).toBeDisabled();

    await page.goto(`/projects?clientId=${clientId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Projetos", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Editar" }).first().click();
    const legacyEditDialog = page.getByRole("dialog", { name: "Editar projeto" });
    await expect(legacyEditDialog.getByLabel("Nome")).toHaveValue(project.name);
    await legacyEditDialog.getByLabel("Data final prevista").fill("2026-08-31");
    await legacyEditDialog.getByRole("button", { name: "Salvar alterações" }).click();
    await expect.poll(() => updateRequests.length).toBe(1);
    assert.deepEqual(updateRequests[0], {
      project_id: project.id,
      name: project.name,
      start_date: project.start_date,
      end_date: "2026-08-31",
      objective: project.objective,
    });
    await expect(legacyEditDialog).not.toBeVisible();
    assert.equal(wizardRequests.length, 0, "Edição deve continuar no PUT direto.");
    await page.getByRole("button", { name: "Novo projeto" }).click();
    const wizard = page.getByRole("dialog", { name: "Novo projeto" });
    await expectLockedClient(wizard);
    await expect(wizard).toHaveAccessibleDescription("Etapa 1 de 3");
    await expect(wizard.getByRole("button", { name: "Fechar", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(wizard.getByLabel("Nome")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(wizard.getByRole("button", { name: "Fechar", exact: true })).toBeFocused();
    await wizard.getByRole("button", { name: "Continuar" }).click();
    await expect(wizard.getByLabel("Nome")).toHaveAttribute("aria-invalid", "true");
    await expect(wizard.getByLabel("Nome")).toHaveAccessibleDescription(
      "Preencha o nome do projeto.",
    );
    await expect(
      wizard.getByRole("alert").filter({ hasText: "Preencha o nome do projeto." }),
    ).toBeVisible();

    await expect(wizard.getByLabel("Data de início")).toHaveAccessibleDescription(
      "Preencha a data de início.",
    );
    await expect(wizard.getByLabel("Objetivo")).toHaveAccessibleDescription(
      "Preencha o objetivo do projeto.",
    );
    await captureEvidence(page, "01-erros-campos-desktop");
    await wizard.getByLabel("Nome").fill("Projeto pelo wizard");
    await expect(wizard.getByLabel("Nome")).toHaveAttribute("aria-invalid", "false");
    await wizard.getByLabel("Data de início").fill("2026-09-10");
    await wizard.getByLabel("Data final prevista").fill("2026-09-09");
    await wizard.getByLabel("Objetivo").fill("Criar sem tarefas.");
    await wizard.getByRole("button", { name: "Continuar" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "A data final não pode ser anterior à data de início." }),
    ).toBeVisible();
    await expect(wizard.getByLabel("Data final prevista")).toHaveAttribute("aria-invalid", "true");
    await expect(wizard.getByLabel("Data final prevista")).toHaveAccessibleDescription(
      "A data final não pode ser anterior à data de início.",
    );
    await expect(wizard.getByText("Etapa 1 de 3", { exact: true })).toBeVisible();

    await wizard.getByLabel("Data final prevista").fill("2026-09-11");
    await expect(wizard.getByRole("alert")).toHaveCount(0);
    await wizard.getByRole("button", { name: "Continuar" }).click();
    await expect(
      wizard.getByText("Nenhuma tarefa será criada nesta etapa.", { exact: true }),
    ).toBeVisible();
    await expectLockedClient(wizard);
    await wizard.getByRole("button", { name: "Pular e revisar" }).click();
    assert.equal(wizardRequests.length, 0, "Pular a etapa 2 não pode criar tarefas nem minutos.");
    await expect.poll(() => previewRequests.length).toBe(1);
    assert.deepEqual(previewRequests[0], { tasks: [] });
    await expect(wizard.getByText("Revisão", { exact: true })).toBeVisible();
    await expectLockedClient(wizard);
    await expect(wizard.getByText("Nome: Projeto pelo wizard", { exact: true })).toBeVisible();
    await wizard.getByRole("button", { name: "Voltar para etapa 1" }).click();
    await expect(wizard.getByLabel("Nome")).toHaveValue("Projeto pelo wizard");
    await wizard.getByRole("button", { name: "Continuar" }).click();
    await wizard.getByRole("button", { name: "Pular e revisar" }).click();
    await wizard.getByRole("button", { name: "Criar projeto" }).click();
    await expect(wizard.getByRole("alert")).toHaveText("Tente novamente.");
    await wizard.getByRole("button", { name: "Criar projeto" }).click();
    await expect.poll(() => wizardRequests.length).toBe(2);
    assert.equal(
      wizardRequests[0].key,
      wizardRequests[1].key,
      "A retentativa deve reutilizar a chave da abertura.",
    );
    assert.notEqual(wizardRequests[0].key, undefined);
    assert.deepEqual(wizardRequests[1].body, {
      client_id: clientId,
      name: "Projeto pelo wizard",
      start_date: "2026-09-10",
      end_date: "2026-09-11",
      objective: "Criar sem tarefas.",
      tasks: [],
      revision: "revision-2",
    });
    await expect(
      page.getByText(
        "Projeto criado com sucesso. Tarefas principais: 0. Dependências: 0. Sem responsável: 0.",
        { exact: true },
      ),
    ).toHaveCount(1);
    await expect(page).toHaveURL(`/tasks?clientId=${clientId}`);
    await expect(page.getByRole("cell", { name: "Tarefa anterior", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Apuração final", exact: true })).toHaveCount(0);
    const cachedTasksAt = Date.now();
    const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);

    await page.goBack();
    await expect(page).toHaveURL(`/projects?clientId=${clientId}`);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin);
    await page.getByRole("button", { name: "Novo projeto" }).click();
    await wizard.getByLabel("Nome").fill("Projeto com tarefas");
    await wizard.getByLabel("Data de início").fill("2026-09-10");
    await wizard.getByLabel("Data final prevista").fill("2026-09-20");
    await wizard.getByLabel("Objetivo").fill("Revisar tarefas manuais.");
    await wizard.getByRole("button", { name: "Continuar" }).click();
    await wizard.getByRole("button", { name: "Adicionar tarefa", exact: true }).click();
    const firstTask = wizard.getByRole("group", { name: "Tarefa 1", exact: true });
    const reviewButton = wizard.getByRole("button", { name: "Revisar tarefas", exact: true });
    await expect(reviewButton).toBeDisabled();
    await firstTask.getByLabel(/^Nome/).fill("Rascunho inicial");
    await expect(reviewButton).toBeDisabled();
    await firstTask.getByLabel(/^Departamento/).selectOption("department-one");
    await expect(reviewButton).toBeDisabled();
    await firstTask.getByLabel(/^Modelo/).selectOption("model-default");
    await expect(firstTask.getByLabel(/^Responsável/)).toHaveValue("ana");
    await firstTask.getByLabel(/^Responsável/).selectOption("bia");
    await firstTask.getByLabel(/^Departamento/).selectOption("department-two");
    await expect(firstTask.getByLabel(/^Modelo/)).toHaveValue("");
    await expect(firstTask.getByLabel(/^Responsável/)).toHaveValue("");
    await expect(reviewButton).toBeDisabled();
    await firstTask.getByLabel(/^Modelo/).selectOption("model-single");
    await expect(firstTask.getByLabel(/^Responsável/)).toHaveValue("caio");
    await expect(firstTask.getByLabel(/^Responsável/)).toBeDisabled();
    await firstTask.getByLabel(/^Departamento/).selectOption("department-one");
    await firstTask.getByLabel(/^Modelo/).selectOption("model-choice");
    await expect(firstTask.getByLabel(/^Responsável/)).toHaveValue("");
    await expect(reviewButton).toBeDisabled();
    await firstTask.getByLabel(/^Responsável/).selectOption("bia");
    await firstTask.getByLabel(/^Nome/).fill("Apuração revisada");
    await firstTask.getByLabel("Prazo", { exact: true }).fill("2026-09-21");
    await expect(firstTask.getByRole("status")).toHaveText("Prazo fora do período do projeto.");
    await expect(firstTask.getByLabel("Prazo", { exact: true })).toHaveAccessibleDescription(
      "Prazo fora do período do projeto.",
    );
    await expect(reviewButton).toBeEnabled();

    await wizard.getByRole("button", { name: "Adicionar tarefa", exact: true }).click();
    const secondTask = wizard.getByRole("group", { name: "Tarefa 2", exact: true });
    await secondTask.getByLabel(/^Nome/).fill("Sem atribuição");
    await secondTask.getByLabel(/^Departamento/).selectOption("department-one");
    await secondTask.getByLabel(/^Modelo/).selectOption("model-choice");
    await secondTask.getByLabel(/^Responsável/).selectOption("ana");
    await expect(reviewButton).toBeDisabled();
    await expect(wizard.getByRole("alert")).toHaveText(
      'O Modelo "Modelo com escolha" já foi usado. Selecione um Modelo diferente para cada tarefa.',
    );
    await wizard.locator("form").evaluate((form) => form.requestSubmit());
    await expect(wizard.getByText("Etapa 2 de 3", { exact: true })).toBeVisible();
    await expect(wizard.getByRole("button", { name: "Criar projeto", exact: true })).toHaveCount(0);
    assert.equal(wizardRequests.length, 2, "Modelo repetido não pode chegar à confirmação.");
    await secondTask.getByLabel(/^Departamento/).selectOption("department-empty");
    await secondTask.getByLabel(/^Modelo/).selectOption("model-empty");
    await expect(wizard.getByRole("alert")).toHaveCount(0);
    await expect(reviewButton).toBeEnabled();
    await expect(secondTask.getByLabel(/^Responsável/)).toHaveValue("");
    await expect(secondTask.getByLabel(/^Responsável/)).toBeDisabled();
    await expect(
      secondTask.getByRole("option", { name: "Sem responsável", exact: true }),
    ).toHaveCount(1);
    await wizard.getByRole("button", { name: "Adicionar tarefa", exact: true }).click();
    const removedTask = wizard.getByRole("group", { name: "Tarefa 3", exact: true });
    await removedTask.getByLabel(/^Nome/).fill("Tarefa removida");
    await removedTask.getByRole("button", { name: "Remover tarefa", exact: true }).click();
    await expect(removedTask).toHaveCount(0);
    await reviewButton.click();
    assert.equal(
      wizardRequests.length,
      2,
      "Rascunhos não podem ser enviados antes da confirmação.",
    );
    await expect(wizard.getByRole("alert")).toHaveText(
      "Modelo model-choice repetido entre principal 1 (Apuração revisada) e dependência model-choice.Tentar gerar prévia",
    );
    await expect(wizard.getByRole("button", { name: "Criar projeto", exact: true })).toHaveCount(0);
    await wizard.getByRole("button", { name: "Tentar gerar prévia", exact: true }).click();
    await expectLockedClient(wizard);
    await expect(wizard.getByRole("textbox")).toHaveCount(0);
    await expect(wizard.getByRole("combobox")).toHaveCount(0);
    const review = wizard.getByRole("table", { name: "Tarefas revisadas", exact: true });
    await expect(review.getByRole("columnheader")).toHaveText([
      "Nome",
      "Prazo",
      "Departamento",
      "Modelo",
      "Responsável",
      "Status",
    ]);
    await expect(review.getByRole("row").nth(1).getByRole("cell")).toHaveText([
      "Apuração revisada",
      // O prazo 21/09 está fora do período 10/09–20/09: o aviso acompanha a confirmação.
      "21/09/2026Prazo fora do período do projeto.",
      "Fiscal",
      "Modelo com escolha",
      "Bia",
      "A Realizar",
    ]);
    await expect(review.getByRole("row").nth(3).getByRole("cell")).toHaveText([
      "Sem atribuição",
      "Não informado",
      "Sem equipe",
      "Modelo sem equipe",
      "Sem responsável",
      "A Realizar",
    ]);
    await expect(review.getByRole("row").nth(2).getByRole("cell")).toHaveText([
      "Dependência em espera Incluída pelo Modelo: Modelo com escolha",
      "Não informado",
      "Fiscal",
      "Modelo padrão",
      "Responsável não carregado (responsible-not-loaded)",
      "Em Espera",
    ]);
    await expect(review.getByRole("row")).toHaveCount(4);
    await expect(review.getByRole("button", { name: /remover dependência/i })).toHaveCount(0);
    assert.deepEqual(previewRequests[3], {
      tasks: [
        {
          name: "Apuração revisada",
          department_id: "department-one",
          model_id: "model-choice",
          responsible_id: "bia",
          prevision_date: "2026-09-21",
        },
        {
          name: "Sem atribuição",
          department_id: "department-empty",
          model_id: "model-empty",
          responsible_id: null,
        },
      ],
    });
    await wizard.getByRole("button", { name: "Voltar para tarefas", exact: true }).click();
    await firstTask.getByLabel(/^Nome/).fill("Apuração final");
    await firstTask.getByLabel(/^Modelo/).selectOption("model-default");
    await secondTask.getByRole("button", { name: "Remover tarefa", exact: true }).click();
    await wizard.locator("form").evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect(firstTask.getByLabel(/^Nome/)).toBeDisabled();
    await expect(firstTask.getByLabel(/^Modelo/)).toBeDisabled();
    await expect(
      firstTask.getByRole("button", { name: "Remover tarefa", exact: true }),
    ).toBeDisabled();
    await expect(
      wizard.getByRole("button", { name: "Adicionar tarefa", exact: true }),
    ).toBeDisabled();
    await expect.poll(() => previewRequests.length).toBe(5);
    assert.equal(previewRequests.length, 5, "Uma prévia pendente não pode aceitar nova revisão.");
    await expect(review.getByRole("cell", { name: "Apuração final", exact: true })).toBeVisible();
    await expect(
      wizard.getByRole("alert", { name: "Dependências atualizadas", exact: true }),
    ).toHaveText("As dependências incluídas pelos Modelos foram atualizadas.");
    await expect(review.getByRole("cell", { name: /Dependência sem responsável/ })).toBeVisible();
    await expect(review.getByRole("cell", { name: "Sem responsável", exact: true })).toBeVisible();
    await wizard.getByRole("button", { name: "Criar projeto", exact: true }).click();
    await expect.poll(() => wizardRequests.length).toBe(3);
    assert.deepEqual(wizardRequests[2].body, {
      client_id: clientId,
      name: "Projeto com tarefas",
      start_date: "2026-09-10",
      end_date: "2026-09-20",
      objective: "Revisar tarefas manuais.",
      tasks: [
        {
          name: "Apuração final",
          department_id: "department-one",
          model_id: "model-default",
          responsible_id: "ana",
          prevision_date: "2026-09-21",
        },
      ],
      revision: "revision-5",
    });
    assert.notEqual(wizardRequests[2].key, wizardRequests[1].key);
    await expect(
      page.getByText(
        "Projeto criado com sucesso. Tarefas principais: 1. Dependências: 1. Sem responsável: 1.",
        { exact: true },
      ),
    ).toHaveCount(1);
    await expect(page).toHaveURL(`/tasks?clientId=${clientId}`);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin);
    assert.ok(
      Date.now() - cachedTasksAt < 60_000,
      "O retorno deve ocorrer antes de expirar o cache de tarefas.",
    );
    await expect(page.getByRole("cell", { name: "Tarefa anterior", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Apuração final", exact: true })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Dependência sem responsável", exact: true }),
    ).toBeVisible();

    await page.goto(`/projects?clientId=${clientId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Editar" }).first().click();
    const editDialog = page.getByRole("dialog", { name: "Editar projeto" });
    await expect(editDialog.getByRole("button", { name: "Salvar alterações" })).toBeVisible();
    await expect(editDialog.getByRole("button", { name: "Continuar" })).toHaveCount(0);
    await editDialog.getByRole("button", { name: "Cancelar" }).click();

    await page.goto(`/projects?clientId=${clientId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Novo projeto" }).click();
    await wizard.getByLabel("Nome").fill("Projeto pela Ata");
    await wizard.getByLabel("Data de início").fill("2026-09-10");
    await wizard.getByLabel("Objetivo").fill("Extrair tarefas da Ata.");
    await wizard.getByRole("button", { name: "Continuar" }).click();

    const extractButton = wizard.getByRole("button", { name: "Extrair tarefas com IA" });
    const minutesField = wizard.getByLabel("Cole a Ata para extrair tarefas");
    const minutesFile = wizard.getByLabel("Selecione um arquivo .txt, .md, .docx ou .pdf");
    await expect(extractButton).toBeDisabled();
    await expect(
      wizard.getByText("Tentativas de extração: 0 de 3.", { exact: true }),
    ).toBeVisible();
    await expect(minutesField).toHaveAccessibleDescription(/processamento pela OpenAI/);
    await minutesFile.setInputFiles({
      name: "ata.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("não enviar"),
    });
    await extractButton.click();
    await expect(wizard.getByRole("alert")).toHaveText("Tipo de arquivo não permitido.");
    assert.equal(
      extractionRequests.length,
      0,
      "Fonte inválida localmente não pode consumir envio.",
    );
    await expect(
      wizard.getByText("Tentativas de extração: 0 de 3.", { exact: true }),
    ).toBeVisible();
    await wizard.getByRole("button", { name: "Remover arquivo" }).click();

    for (const { name, buffer, message } of [
      {
        name: "ata-vazia.txt",
        buffer: Buffer.alloc(0),
        message: "O arquivo da Ata é obrigatório e não pode estar vazio.",
      },
      {
        name: "ata-grande.txt",
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1, "x"),
        message: "Arquivo excede o limite de 10 MB.",
      },
    ]) {
      await minutesFile.setInputFiles({ name, mimeType: "text/plain", buffer });
      await extractButton.click();
      await expect(wizard.getByRole("alert")).toHaveText(message);
      await expect(minutesFile).toHaveAccessibleDescription(
        new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
      await expect(
        wizard.getByText("Tentativas de extração: 0 de 3.", { exact: true }),
      ).toBeVisible();
      assert.equal(extractionRequests.length + invalidExtractionRequests.length, 0);
      await wizard.getByRole("button", { name: "Remover arquivo" }).click();
    }

    await minutesFile.setInputFiles({
      name: "ata-corrompida.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: await readFile(
        path.join(
          appRoot,
          "../services/task-service/src/test/fixtures/meeting-minutes-corrupted.docx",
        ),
      ),
    });
    await extractButton.click();
    await expect(wizard.getByRole("alert")).toHaveText(
      "O arquivo DOCX está corrompido ou não pôde ser lido.",
    );
    await expect(
      wizard.getByText("Tentativas de extração: 0 de 3.", { exact: true }),
    ).toBeVisible();
    assert.equal(invalidExtractionRequests.length, 1);
    assert.equal(extractionRequests.length, 0);
    await wizard.getByRole("button", { name: "Remover arquivo" }).click();
    await minutesFile.setInputFiles({
      name: "ata-digitalizada.pdf",
      mimeType: "application/pdf",
      buffer: await readFile(
        path.join(
          appRoot,
          "../services/task-service/src/test/fixtures/meeting-minutes-scanned.pdf",
        ),
      ),
    });
    await extractButton.click();
    await expect(wizard.getByRole("alert")).toHaveText("O arquivo da Ata não contém texto.");
    await expect(
      wizard.getByText("Tentativas de extração: 0 de 3.", { exact: true }),
    ).toBeVisible();
    await captureEvidence(page, "02-pdf-sem-texto-zero-tentativas");
    assert.equal(invalidExtractionRequests.length, 2);
    assert.equal(extractionRequests.length, 0);
    await wizard.getByRole("button", { name: "Remover arquivo" }).click();

    await minutesField.fill("- Apurar impostos do trimestre\n- Reunir documentos do cliente");
    assert.equal(extractionRequests.length, 0, "A Ata não pode ser enviada antes do clique.");
    await expect(extractButton).toBeEnabled();

    await extractButton.evaluate((button) => {
      button.click();
      button.click();
    });
    await expect.poll(() => extractionRequests.length).toBe(1);
    await expect(
      wizard.getByText("Tentativas de extração: 1 de 3.", { exact: true }),
    ).toBeVisible();
    await expect(wizard.getByRole("status")).toHaveText("Extraindo tarefas da Ata...");
    const wizardOverlay = page.locator('[data-state="open"].fixed.inset-0');
    await expect(wizardOverlay).toBeVisible();
    await wizardOverlay.click({ position: { x: 5, y: 5 }, force: true });
    await expect(wizard).toBeVisible();
    await expect(
      wizard.getByText("Tentativas de extração: 1 de 3.", { exact: true }),
    ).toBeVisible();
    releaseFirstExtraction();
    const firstProposedTask = wizard.getByRole("group", {
      name: "Tarefa 1 (proposta pela IA)",
    });
    await expect(firstProposedTask.getByLabel(/^Nome/)).toHaveValue("Apurar impostos do trimestre");
    await expect(firstProposedTask.getByLabel("Prazo", { exact: true })).toHaveValue("2026-09-15");
    await expect(firstProposedTask.getByLabel(/^Departamento/)).toHaveValue("department-one");
    await expect(firstProposedTask.getByLabel(/^Modelo/)).toHaveValue("model-default");
    await expect(firstProposedTask.getByLabel(/^Responsável/)).toHaveValue("ana");

    await wizard.getByRole("button", { name: "Adicionar tarefa", exact: true }).click();
    const manualTaskBeforeReextraction = wizard.getByRole("group", {
      name: "Tarefa 2",
      exact: true,
    });
    await manualTaskBeforeReextraction.getByLabel(/^Nome/).fill("Tarefa manual preservada");

    await extractButton.click();
    await expect(
      wizard.getByText("Tentativas de extração: 2 de 3.", { exact: true }),
    ).toBeVisible();
    await expect(wizard.getByRole("contentinfo").getByRole("button").last()).toBeDisabled();
    const manualTask = wizard.getByRole("group", { name: "Tarefa 1", exact: true });
    const reextractedTask = wizard.getByRole("group", { name: "Tarefa 2 (proposta pela IA)" });
    await expect(manualTask.getByLabel(/^Nome/)).toHaveValue("Tarefa manual preservada");
    await expect(reextractedTask.getByLabel(/^Nome/)).toHaveValue("Conferir impostos reextraídos");
    await expect(wizard.getByText("Apurar impostos do trimestre", { exact: true })).toHaveCount(0);

    await extractButton.click();
    await expect(
      wizard.getByRole("alert").filter({ hasText: "Nenhuma tarefa foi identificada na Ata." }),
    ).toBeVisible();
    await expect(
      wizard.getByText("Tentativas de extração: 3 de 3.", { exact: true }),
    ).toBeVisible();
    await expect(extractButton).toBeDisabled();
    await captureEvidence(page, "03-limite-reextracao-preservada");
    await expect(
      wizard.getByText(
        "Limite de 3 tentativas atingido. Continue adicionando tarefas manualmente.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(manualTask.getByLabel(/^Nome/)).toHaveValue("Tarefa manual preservada");
    await expect(reextractedTask.getByLabel(/^Nome/)).toHaveValue("Conferir impostos reextraídos");
    assert.equal(extractionRequests.length, 3);
    assert.deepEqual(extractionRequests[0].body, {
      content: "- Apurar impostos do trimestre\n- Reunir documentos do cliente",
      name: "Projeto pela Ata",
      objective: "Extrair tarefas da Ata.",
      start_date: "2026-09-10",
    });
    assert.match(extractionRequests[0].contentType, /^application\/json/);

    await wizard.getByRole("button", { name: "Voltar", exact: true }).click();
    await expect(wizard.getByLabel("Nome")).toHaveValue("Projeto pela Ata");
    await wizard.getByRole("button", { name: "Continuar" }).click();
    await expect(manualTask.getByLabel(/^Nome/)).toHaveValue("Tarefa manual preservada");
    await expect(reextractedTask.getByLabel(/^Nome/)).toHaveValue("Conferir impostos reextraídos");
    await expect(
      wizard.getByText("Tentativas de extração: 3 de 3.", { exact: true }),
    ).toBeVisible();

    await wizard.getByRole("button", { name: "Limpar texto" }).click();
    const sourceChangeConfirmation = page.getByRole("dialog", {
      name: "Descartar propostas da IA?",
    });
    await expect(sourceChangeConfirmation).toBeVisible();
    await expect(sourceChangeConfirmation).toContainText(
      "Trocar a fonte da Ata descartará as propostas da IA atuais. Deseja continuar?",
    );
    await sourceChangeConfirmation.getByRole("button", { name: "Manter fonte" }).click();
    await expect(sourceChangeConfirmation).not.toBeVisible();
    await expect(minutesField).toHaveValue(
      "- Apurar impostos do trimestre\n- Reunir documentos do cliente",
    );
    await expect(reextractedTask).toBeVisible();

    await wizard.getByRole("button", { name: "Limpar texto" }).click();
    await expect(sourceChangeConfirmation).toBeVisible();
    await sourceChangeConfirmation.getByRole("button", { name: "Trocar fonte" }).click();
    await expect(minutesField).toHaveValue("");
    await expect(minutesFile).toBeEnabled();
    await expect(manualTask.getByLabel(/^Nome/)).toHaveValue("Tarefa manual preservada");
    await expect(reextractedTask).toHaveCount(0);
    await expect(
      wizard.getByText("Tentativas de extração: 3 de 3.", { exact: true }),
    ).toBeVisible();
    await minutesFile.setInputFiles({
      name: "ata.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("- Validar importação da Ata"),
    });
    await expect(minutesField).toBeDisabled();
    await expect(wizard.getByText("ata.md", { exact: true })).toBeVisible();
    await expect(extractButton).toBeDisabled();
    await wizard.getByRole("button", { name: "Remover arquivo" }).click();
    await expect(minutesFile).toBeEnabled();
    await minutesField.fill("Nova fonte em texto");
    await manualTask.getByLabel(/^Departamento/).selectOption("department-empty");
    await manualTask.getByLabel(/^Modelo/).selectOption("model-empty");
    await wizard.getByRole("button", { name: "Revisar tarefas" }).click();
    await expect(
      wizard.getByRole("cell", { name: "Tarefa manual preservada", exact: true }),
    ).toBeVisible();
    await expect(wizard.getByRole("button", { name: "Criar projeto" })).toBeEnabled();
    await captureEvidence(page, "06-revisao-manual-apos-limite");
    await wizard.getByRole("button", { name: "Voltar para tarefas" }).click();
    await expect(
      wizard.getByText("Tentativas de extração: 3 de 3.", { exact: true }),
    ).toBeVisible();

    await wizard.getByRole("button", { name: "Cancelar" }).click();
    const draftDiscardConfirmation = page.getByRole("dialog", {
      name: "Descartar rascunho?",
    });
    await expect(draftDiscardConfirmation).toBeVisible();
    await expect(draftDiscardConfirmation).toContainText(
      "Fechar agora vai descartar o rascunho deste projeto. Deseja continuar?",
    );
    await draftDiscardConfirmation.getByRole("button", { name: "Continuar editando" }).click();
    await expect(draftDiscardConfirmation).not.toBeVisible();
    await expect(wizard).toBeVisible();
    await expect(minutesField).toHaveValue("Nova fonte em texto");

    await wizard.getByRole("button", { name: "Fechar" }).click();
    await expect(draftDiscardConfirmation).toBeVisible();
    await draftDiscardConfirmation.getByRole("button", { name: "Continuar editando" }).click();
    await expect(draftDiscardConfirmation).not.toBeVisible();
    await expect(wizard).toBeVisible();

    await page.mouse.click(5, 5);
    await expect(draftDiscardConfirmation).toBeVisible();
    await draftDiscardConfirmation.getByRole("button", { name: "Continuar editando" }).click();
    await expect(draftDiscardConfirmation).not.toBeVisible();
    await expect(wizard).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(draftDiscardConfirmation).toBeVisible();
    await draftDiscardConfirmation.getByRole("button", { name: "Descartar rascunho" }).click();
    await expect(wizard).not.toBeVisible();
    assert.equal(wizardRequests.length, 3, "Cancelar ou fechar não pode confirmar o wizard.");

    const persistedState = await page.evaluate(() => ({
      local: Object.values(localStorage),
      session: Object.values(sessionStorage),
      cookie: document.cookie,
    }));
    assert.doesNotMatch(
      JSON.stringify(persistedState),
      /Nova fonte em texto|Conferir impostos reextraídos|Tarefa manual preservada/,
    );

    await page.getByRole("button", { name: "Novo projeto" }).click();
    await expect(wizard.getByLabel("Nome")).toHaveValue("");
    await wizard.getByLabel("Nome").fill("Projeto após reabertura");
    await wizard.getByLabel("Data de início").fill("2026-09-10");
    await wizard.getByLabel("Objetivo").fill("Comprovar novo estado transitório.");
    await wizard.getByRole("button", { name: "Continuar" }).click();
    await expect(
      wizard.getByText("Tentativas de extração: 0 de 3.", { exact: true }),
    ).toBeVisible();
    await expect(minutesField).toHaveValue("");
    await expect(wizard.getByRole("group", { name: /^Tarefa \d/ })).toHaveCount(0);
    await minutesFile.setInputFiles({
      name: "ata.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("- Validar importação da Ata"),
    });
    await extractButton.click();
    await expect.poll(() => extractionRequests.length).toBe(4);
    await expect(
      wizard.getByText("Tentativas de extração: 1 de 3.", { exact: true }),
    ).toBeVisible();
    assert.match(extractionRequests[3].contentType, /^multipart\/form-data/);
    assert.match(extractionRequests[3].body, /name="file"; filename="ata\.md"/);
    assert.match(extractionRequests[3].body, /- Validar importação da Ata/);
    for (const [field, value] of Object.entries({
      name: "Projeto após reabertura",
      objective: "Comprovar novo estado transitório.",
      start_date: "2026-09-10",
    })) {
      assert.match(extractionRequests[3].body, new RegExp(`name="${field}"[\\s\\S]*${value}`));
    }
    assert.doesNotMatch(extractionRequests[3].body, /content|client_id/);
    await wizard.getByRole("button", { name: "Revisar tarefas" }).click();
    await wizard.getByRole("button", { name: "Criar projeto" }).click();
    await expect.poll(() => wizardRequests.length).toBe(4);
    assert.notEqual(
      wizardRequests[3].key,
      wizardRequests[2].key,
      "Uma nova abertura deve gerar outra Idempotency-Key.",
    );
    await expect(page).toHaveURL(`/tasks?clientId=${clientId}`);

    await page.goto(`/projects?clientId=${clientId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Novo projeto" }).click();
    await wizard.getByLabel("Nome").fill("Rascunho descartado pela recarga");
    await wizard.getByLabel("Data de início").fill("2026-09-10");
    await wizard.getByLabel("Objetivo").fill("Comprovar descarte completo pela recarga.");
    await wizard.getByRole("button", { name: "Continuar" }).click();
    await minutesField.fill("Ata sintética descartada na recarga");
    await extractButton.click();
    await expect(wizard.getByRole("group", { name: "Tarefa 1 (proposta pela IA)" })).toBeVisible();
    await expect(
      wizard.getByText("Tentativas de extração: 1 de 3.", { exact: true }),
    ).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(wizard).not.toBeVisible();
    await page.getByRole("button", { name: "Novo projeto" }).click();
    await expect(wizard.getByLabel("Nome")).toHaveValue("");
    await expect(wizard.getByLabel("Objetivo")).toHaveValue("");
    await expect(wizard.getByLabel("Data de início")).toHaveValue("");
    await wizard.getByLabel("Nome").fill("Novo rascunho após recarga");
    await wizard.getByLabel("Data de início").fill("2026-09-10");
    await wizard.getByLabel("Objetivo").fill("Verificar estado inicial da etapa 2.");
    await wizard.getByRole("button", { name: "Continuar" }).click();
    await expect(minutesField).toHaveValue("");
    await expect(wizard.getByRole("group", { name: /^Tarefa \d/ })).toHaveCount(0);
    await expect(
      wizard.getByText("Tentativas de extração: 0 de 3.", { exact: true }),
    ).toBeVisible();
    await wizard.getByRole("button", { name: "Cancelar" }).click();
    await page
      .getByRole("dialog", { name: "Descartar rascunho?" })
      .getByRole("button", { name: "Descartar rascunho" })
      .click();

    for (const level of [0, 1]) {
      smokeUser.type = "user";
      smokeUser.modules.integracao = level;
      await page.goto(`/projects?clientId=${clientId}`, { waitUntil: "domcontentloaded" });
      if (level === 1)
        await expect(page.getByRole("heading", { name: "Projetos", level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: "Novo projeto" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Criar projeto" })).toHaveCount(0);
      assert.equal(wizardRequests.length, 4);
    }
    for (const [type, level] of [
      ["user", 2],
      ["user", 3],
      ["owner", 0],
    ]) {
      smokeUser.type = type;
      smokeUser.modules.integracao = level;
      await page.goto(`/projects?clientId=${clientId}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Novo projeto" }).click();
      await wizard.getByLabel("Nome").fill(`Projeto ${type} nível ${level}`);
      await wizard.getByLabel("Data de início").fill("2026-09-10");
      await wizard.getByLabel("Objetivo").fill("Validar autorização para criar projeto.");
      await wizard.getByRole("button", { name: "Continuar" }).click();
      await expect(wizard).toHaveAccessibleDescription("Etapa 2 de 3");
      await wizard.getByRole("button", { name: "Pular e revisar" }).click();
      await expect(wizard).toHaveAccessibleDescription("Etapa 3 de 3");
      if (type === "user" && level === 2) {
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(wizard.getByRole("button", { name: "Criar projeto" })).toBeInViewport();
        assert.equal(
          await wizard.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
          true,
        );
        await captureEvidence(page, "04-revisao-mobile");
        await page.evaluate(() => document.documentElement.classList.add("dark"));
        await captureEvidence(page, "05-revisao-mobile-dark");
        await page.evaluate(() => document.documentElement.classList.remove("dark"));
        await page.setViewportSize({ width: 1440, height: 900 });
      }
      const before = wizardRequests.length;
      await wizard.getByRole("button", { name: "Criar projeto" }).click();
      await expect.poll(() => wizardRequests.length).toBe(before + 1);
      await expect(page).toHaveURL(`/tasks?clientId=${clientId}`);
    }
  } catch (error) {
    await captureFailureArtifact(page);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function withNextServer(run) {
  if (configuredBaseUrl) return run();
  const nextCli = createRequire(import.meta.url).resolve("next/dist/bin/next");
  const server = spawn(process.execPath, [nextCli, "dev", "--webpack", "--port", PORT], {
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
    const startedAt = Date.now();
    while (Date.now() - startedAt < 45_000) {
      if (server.exitCode !== null) throw new Error(`Next dev encerrou antes do smoke.\n${output}`);
      try {
        const response = await fetch(baseUrl);
        if (response.ok || response.status < 500) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    // Compile both browser routes before checking UI timings in development mode.
    for (const route of ["/projects", "/tasks"]) {
      const response = await fetch(`${baseUrl}${route}`, {
        headers: { Cookie: "cw.session=opaque-test-session" },
        signal: AbortSignal.timeout(120_000),
      });
      assert.equal(response.status, 200, `Next must serve ${route} before the smoke.`);
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

execFileSync(
  process.execPath,
  ["--experimental-vm-modules", "--test", path.join(appRoot, "scripts/wizard-evidence.test.mjs")],
  { stdio: "inherit" },
);
await withNextServer(runBrowserProof);
console.log("PASS wizard revisa tarefas manuais, aceita lista vazia e preserva edição direta");
console.log("PASS wizard limita extração, preserva estado transitório e confirma descartes");
