import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

import { browserSmokeEnv } from "../../shared/testing/browserSmokeEnv.mjs";

const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const baseUrl = process.env.REPORTS_BROWSER_BASE_URL || "http://127.0.0.1:3122";
const evidenceDir = process.env.REPORTS_EVIDENCE_DIR;
const letterhead = { id: "approved-letterhead", label: "Timbrado aprovado", kind: "organization", sha256: "a".repeat(64) };
const user = {
  id: "reports-fixture-user",
  login: "reports.fixture",
  name: "Pessoa de teste",
  type: "user",
  permission: 1,
  organization_id: "reports-fixture-org",
  department_id: "reports-fixture-department",
  modules: { integracao: 1, fiscal: 1, pessoal: 1 },
};
const field = (key, label) => ({
  key,
  label,
  value_type: "string",
  filter_operators: ["eq", "neq", "in"],
  aggregations: ["count"],
  groupable: true,
  sortable: true,
});
const pessoalFieldLabels = {
  client_name: "Cliente",
  responsible_name: "Responsável",
  union_name: "Sindicato",
  group_name: "Grupo",
  group_state: "Estado do grupo",
  competence: "Competência",
  group_snapshot_name: "Grupo registrado",
  group_snapshot_policy: "Política do grupo registrada",
  group_snapshot_state: "Estado do grupo registrado",
  advance: "Adiantamento",
  advance_type: "Tipo de adiantamento",
  advance_amount: "Valor do adiantamento",
  onvio: "Envio via Onvio",
  vt: "Vale-transporte",
  vt_value: "Valor do vale-transporte",
  vt_type: "Tipo do vale-transporte",
  va: "Vale-alimentação",
  assistance_fee: "Taxa assistencial",
  bem_mais: "Bem Mais",
  bsf: "BSF",
  reinf: "Reinf",
  employees: "Quantidade de empregados",
  status: "Status",
  title: "Título",
  registration_date: "Data de registro",
  completion_date: "Data de conclusão",
  payroll: "Folha",
  charges: "Encargos",
};
const pessoalField = (key) => field(key, pessoalFieldLabels[key] ?? key);
const items = [
  {
    key: "integracao.projects",
    label: "Projetos",
    module: "integracao",
    department_label: "Integração",
    description: "Acompanhe projetos, prazos e responsáveis.",
    fields: [field("name", "Nome"), field("status", "Situação")],
  },
  {
    key: "integracao.clients",
    label: "Clientes",
    module: "integracao",
    department_label: "Integração",
    description: "Consulte informações dos clientes.",
    fields: [field("name", "Nome"), field("email", "E-mail")],
  },
  {
    key: "integracao.tasks",
    label: "Tarefas de Integração",
    module: "integracao",
    department_label: "Integração",
    fields: [field("department", "Departamento")],
  },
  {
    key: "fiscal.tax",
    label: "Tributos",
    module: "fiscal",
    department_label: "Fiscal",
    description: "Consulte tributos e suas competências.",
    fields: [field("period", "Competência")],
  },
  {
    key: "pessoal.payroll",
    label: "Configuração de folha de Departamento Pessoal",
    module: "pessoal",
    department_label: "Departamento Pessoal",
    fields: [
      "client_code",
      "client_name",
      "client_document",
      "client_status",
      "responsible_name",
      "union_name",
      "group_name",
      "group_state",
      "previous",
      "info",
      "contact",
      "advance",
      "advance_type",
      "advance_amount",
      "onvio",
      "vt",
      "vt_value",
      "vt_type",
      "va",
      "assistance_fee",
      "bem_mais",
      "bsf",
      "reinf",
      "employees",
    ].map(pessoalField),
  },
  {
    key: "pessoal.situations",
    label: "Situações de Departamento Pessoal",
    module: "pessoal",
    department_label: "Departamento Pessoal",
    fields: ["status", "title", "registration_date", "completion_date"].map(pessoalField),
  },
  {
    key: "pessoal.obligations",
    label: "Obrigações de Departamento Pessoal",
    module: "pessoal",
    department_label: "Departamento Pessoal",
    fields: [
      "competence",
      "client_name",
      "responsible_name",
      "group_snapshot_name",
      "group_snapshot_policy",
      "group_snapshot_state",
      "advance",
      "payroll",
      "charges",
      "assistance_fee",
      "bem_mais",
      "bsf",
      "va",
      "vt",
    ].map(pessoalField),
  },
];

async function run() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.REPORTS_BROWSER_CHANNEL
      ? { channel: process.env.REPORTS_BROWSER_CHANNEL }
      : {}),
  });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies([
    {
      name: "cw.session",
      value: "opaque-report-fixture",
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
    { name: "cw.csrf", value: "A".repeat(43), url: baseUrl, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const definitions = [];
  let reviewFailure = false;
  let catalogRequests = 0;
  let catalogMode = "ready";
  let reviewGate;
  const previews = [];
  let previewFailure = 0;
  let generatedJob;
  const models = [];
  let modelVersionId = "reports-fixture-model-version";
  let staleSavedModel = false;
  let jobPolls = 0;
  const exportRequests = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("**/socket.io/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body:
        route.request().method() === "POST"
          ? "ok"
          : '0{"sid":"reports-fixture","upgrades":[],"pingInterval":25000,"pingTimeout":20000}',
    }),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    if (path === "/reports/jobs" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON();
      assert.equal(route.request().headers()["x-csrf-token"], "A".repeat(43));
      if (staleSavedModel) {
        assert.ok(
          payload.definition,
          `A stale saved model must generate from the sanitized definition: ${JSON.stringify(payload)}`,
        );
        const clientsArea = payload.definition.areas.find(
          (area) => area.source === "integracao.clients",
        );
        assert.deepEqual(clientsArea.aggregations ?? [], []);
        staleSavedModel = false;
      }
      assert.ok(
        payload.modelVersionId === modelVersionId || payload.definition?.version === 2,
        "Generation must use a validated definition or a saved model version",
      );
      generatedJob = { id: "reports-fixture-job", status: "queued", error_message: null };
      jobPolls = 0;
      return route.fulfill({ status: 201, json: { success: true, data: generatedJob } });
    }
    if (path === "/reports/models" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON();
      assert.equal(route.request().headers()["x-csrf-token"], "A".repeat(43));
      assert.equal(payload.definition.version, 2);
      assert.ok(payload.name);
      assert.ok(payload.description);
      const model = {
        id: "reports-fixture-model",
        organization_id: user.organization_id,
        name: payload.name,
        description: payload.description,
        version: 1,
        version_id: modelVersionId,
        definition: payload.definition,
      };
      models.splice(0, models.length, model);
      return route.fulfill({ status: 201, json: { success: true, data: model } });
    }
    if (path === "/reports/models/reports-fixture-model" && route.request().method() === "GET") {
      const staleModel = structuredClone(models[0]);
      const clientsArea = staleModel.definition.areas.find(
        (area) => area.source === "integracao.clients",
      );
      clientsArea.fields = ["email"];
      clientsArea.aggregations = [{ field: "name", function: "count" }];
      staleSavedModel = true;
      return route.fulfill({ json: { success: true, data: staleModel } });
    }
    if (path === "/reports/jobs/reports-fixture-job" && route.request().method() === "GET") {
      if (generatedJob?.status === "queued") {
        jobPolls += 1;
        generatedJob.status = "processing";
      } else if (generatedJob?.status === "processing") {
        generatedJob.status = "completed";
      }
      return route.fulfill({ json: { success: true, data: generatedJob } });
    }
    if (path === "/reports/jobs/reports-fixture-job/cancel" && route.request().method() === "POST") {
      generatedJob = { ...generatedJob, status: "cancelled" };
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/reports/jobs/reports-fixture-job/snapshot" && route.request().method() === "GET") {
      return route.fulfill({
        json: {
          success: true,
          data: {
            snapshot: { id: "reports-fixture-snapshot", created_at: "2026-09-09T12:00:00.000Z" },
            rows: [],
            nextCursor: null,
            blocks: [
              {
                source: "integracao.projects",
                label: "Projetos",
                columns: [{ key: "name", label: "Nome" }, { key: "status", label: "Situação" }, { key: "category", label: "Categoria" }, { key: "status_count", label: "Contagem de Situação", hidden: true }],
                rowCount: 5,
                rows: [
                  { row_number: 1, values: { name: "Projeto gerado", status: "A", category: "Um", status_count: 7 } },
                  { row_number: 2, values: { name: "Projeto gerado", status: "B", category: "Dois", status_count: 3 } },
                  { row_number: 3, values: { name: "Outro projeto", status: "A", category: "Três", status_count: 2 } },
                  { row_number: 4, values: { name: "Sem categoria", status: "A", category: null, status_count: 4 } },
                  { row_number: 5, values: { name: "Categoria literal", status: "B", category: "Sem valor", status_count: 5 } },
                ],
                nextCursor: null,
              },
              {
                source: "integracao.clients",
                label: "Clientes",
                columns: [{ key: "email", label: "E-mail" }],
                rowCount: 0,
                rows: [],
                nextCursor: null,
              },
            ],
          },
        },
      });
    }
    if (path === "/reports/snapshots/reports-fixture-snapshot/export") {
      const format = new URL(route.request().url()).searchParams.get("format");
      exportRequests.push(format);
      return route.fulfill({
        contentType: format === "pdf" ? "application/pdf" : "application/zip",
        headers: { "content-disposition": `attachment; filename="report-fixture.${format === "pdf" ? "pdf" : "zip"}"` },
        body: format === "pdf" ? "%PDF-fixture" : "PK\u0003\u0004fixture",
      });
    }
    if (path === "/reports/preview") {
      assert.equal(route.request().headers()["x-csrf-token"], "A".repeat(43));
      const payload = route.request().postDataJSON();
      previews.push(payload.definition);
      if (previewFailure)
        return route.fulfill({
          status: previewFailure,
          json: { success: false, error: "internal.secret_identifier", code: "INVALID" },
        });
      return route.fulfill({
        json: {
          success: true,
          data: {
            blocks: payload.definition.areas.map((area, index) => ({
              source: area.source,
              label: items.find((item) => item.key === area.source).label,
              rows: area.source === "integracao.tasks"
                ? [
                    { department: "Fiscal", department_count: 2 },
                    { department: "Pessoal", department_count: 1 },
                  ]
                : index
                  ? []
                  : [{ name: area.filters?.[0]?.value ?? "Projeto de exemplo", name_count: 7 }],
              presentation: {
                columns: area.source === "integracao.tasks"
                  ? [
                      { key: "department", label: "Departamento" },
                      { key: "department_count", label: "Contagem de Departamento" },
                    ]
                  : [
                      { key: index ? "email" : "name", label: index ? "E-mail" : "Nome" },
                      ...(!index && area.aggregations?.length
                        ? [{ key: "name_count", label: "Contagem de Nome" }]
                        : []),
                    ],
              },
              limit: 100,
              hasMore: false,
            })),
          },
        },
      });
    }
    if (path === "/reports/definitions/validate") {
      const payload = route.request().postDataJSON();
      assert.equal(route.request().headers()["x-csrf-token"], "A".repeat(43));
      definitions.push(payload.definition);
      assert.ok(
        payload.definition.areas.every((area) => !("catalog" in area)),
        "Catalog metadata must stay outside definition",
      );
      if (reviewGate) await reviewGate;
      return route.fulfill({
        status: reviewFailure ? 403 : 200,
        json: reviewFailure
          ? { success: false, error: "internal.secret_identifier", code: "FORBIDDEN" }
          : { success: true, data: payload },
      });
    }
    if (path === "/reports/catalog") catalogRequests++;
    const data =
      path === "/user/me"
        ? user
          : path === "/reports/catalog"
            ? { items: catalogMode === "empty" ? [] : catalogMode === "invalid" ? null : items,
                letterheads: { personal: [letterhead], shared: [] } }
            : path === "/reports/models/list"
              ? { items: models }
              : path === "/reports/models/shared/list"
                ? { items: [] }
          : [];
    await route.fulfill({ status: 200, json: { success: true, data } });
  });
  async function screenshot(name) {
    if (!evidenceDir) return;
    await mkdir(evidenceDir, { recursive: true });
    await page.screenshot({
      path: `${evidenceDir}/${name}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  async function screenshotRegion(name, locator) {
    if (!evidenceDir) return;
    await mkdir(evidenceDir, { recursive: true });
    await page.waitForTimeout(1800);
    await locator.screenshot({
      path: `${evidenceDir}/${name}.png`,
      animations: "disabled",
    });
  }
  async function checkLanguage() {
    assert.doesNotMatch(
      await page.getByRole("tabpanel").innerText(),
      /integracao\.|fiscal\.|\b(?:source|snapshot|job|inner|left|join|alias|predicado|descritor)\b|internal.secret_identifier/i,
    );
  }
  try {
    await page.goto("/relatorios", { waitUntil: "domcontentloaded" });
    const panel = page.getByRole("tabpanel");
    await panel.getByRole("button", { name: "Quantidade de tarefas por departamento" }).click();
    await expect(panel.getByRole("group", { name: "Campos de Tarefas de Integração" })
      .getByRole("checkbox", { name: "Departamento" })).toBeChecked();
    await panel.getByRole("button", { name: "3. Definir critérios" }).click();
    await panel.getByText("Mais opções").click();
    await expect(panel.getByRole("group", { name: "Agrupamento" })
      .getByRole("checkbox", { name: "Departamento" })).toBeChecked();
    await expect(panel.getByLabel("Resumo de Departamento")).toHaveValue("count");
    await screenshot("00-tarefas-por-departamento");
    await panel.getByRole("button", { name: "4. Revisar relatório" }).click();
    assert.deepEqual(definitions[0], {
      version: 2,
      areas: [{
        source: "integracao.tasks",
        fields: ["department"],
        groupBy: ["department"],
        aggregations: [{ field: "department", function: "count" }],
        filters: [],
      }],
    });
    await panel.getByRole("button", { name: "Visualizar prévia" }).click();
    const taskResults = panel.getByRole("region", { name: "Dados de Tarefas de Integração" });
    await expect(taskResults).toContainText("Fiscal");
    await expect(taskResults).toContainText("Pessoal");
    await expect(taskResults.getByRole("row")).toHaveCount(3);
    await screenshot("00-tarefas-por-departamento-resultado");
    definitions.length = 0;
    previews.length = 0;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(panel.getByRole("button", { name: "Ficha completa", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Ficha completa", exact: true }).click();
    await expect(
      panel.getByRole("group", {
        name: "Campos de Configuração de folha de Departamento Pessoal",
        exact: true,
      }),
    ).toBeVisible();
    await screenshot("00-pessoal-ficha-completa");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(panel.getByRole("checkbox", { name: "Projetos", exact: true })).toBeVisible();
    await panel.getByRole("checkbox", { name: "Projetos", exact: true }).check();
    await panel.getByRole("checkbox", { name: "Clientes", exact: true }).check();
    await expect(panel.getByText("2 áreas selecionadas", { exact: true })).toBeVisible();
    await expect(
      panel.getByRole("group", { name: "Integração", exact: true }).getByRole("checkbox"),
    ).toHaveCount(3);
    await expect(
      panel.getByRole("group", { name: "Fiscal", exact: true }).getByRole("checkbox"),
    ).toHaveCount(1);
    await checkLanguage();
    await screenshot("01-areas-desktop");
    await panel.getByRole("button", { name: "Escolher campos", exact: true }).click();
    const projects = panel.getByRole("group", { name: "Campos de Projetos", exact: true });
    const clients = panel.getByRole("group", { name: "Campos de Clientes", exact: true });
    await expect(projects.getByRole("checkbox", { checked: true })).toHaveCount(0);
    await expect(clients.getByRole("checkbox", { checked: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "4. Revisar relatório", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Escolha ao menos um campo");
    await expect(panel.getByRole("alert")).toBeFocused();
    await screenshot("02-campos-vazios");
    await projects.getByRole("checkbox", { name: "Nome", exact: true }).check();
    await clients.getByRole("button", { name: "Selecionar todos", exact: true }).click();
    await expect(clients.getByRole("checkbox", { checked: true })).toHaveCount(2);
    await screenshot("03-campos-selecionados");
    await clients.getByRole("button", { name: "Limpar todos", exact: true }).click();
    await expect(clients.getByRole("checkbox", { checked: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "Remover Clientes", exact: true }).click();
    await expect(projects.getByRole("checkbox", { name: "Nome", exact: true })).toBeChecked();
    await panel.getByRole("button", { name: "4. Revisar relatório", exact: true }).click();
    await expect(
      panel.getByRole("heading", { name: "Revisar relatório", exact: true }),
    ).toBeVisible();
    assert.deepEqual(definitions[0], {
      version: 2,
      areas: [{ source: "integracao.projects", fields: ["name"], filters: [] }],
    });
    await panel.getByLabel("Timbrado do PDF").selectOption(letterhead.id);
    await screenshotRegion("01-timbrado-selecionado", panel.getByLabel("Timbrado do PDF").locator(".."));
    await panel.getByRole("button", { name: "3. Definir critérios", exact: true }).click();
    await panel.getByRole("button", { name: "4. Revisar relatório", exact: true }).click();
    assert.deepEqual(definitions.at(-1).letterhead, { id: letterhead.id, sha256: letterhead.sha256 });
    await panel.getByLabel("Timbrado do PDF").selectOption("");
    await checkLanguage();
    await page.evaluate(() => {
      document.documentElement.classList.replace("light", "dark");
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await screenshot("04-revisao-dark");
    await page.evaluate(() => {
      document.documentElement.classList.replace("dark", "light");
      document.documentElement.setAttribute("data-theme", "light");
    });
    await panel.getByRole("button", { name: "1. Escolher áreas", exact: true }).click();
    await panel.getByRole("checkbox", { name: "Clientes", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(panel.getByRole("checkbox", { name: "Clientes", exact: true })).toBeChecked();
    await panel.getByRole("button", { name: "Escolher campos", exact: true }).click();
    await expect(clients.getByRole("checkbox", { checked: true })).toHaveCount(0);
    await clients.getByRole("checkbox", { name: "E-mail", exact: true }).check();
    reviewFailure = true;
    const previousCatalogRequests = catalogRequests;
    await panel.getByRole("button", { name: "4. Revisar relatório", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Seu acesso mudou");
    await expect.poll(() => catalogRequests).toBeGreaterThan(previousCatalogRequests);
    await expect(projects.getByRole("checkbox", { name: "Nome", exact: true })).toBeChecked();
    await checkLanguage();
    reviewFailure = false;
    await panel.getByRole("button", { name: "1. Escolher áreas", exact: true }).click();
    let finishReview;
    reviewGate = new Promise((resolve) => {
      finishReview = resolve;
    });
    await panel.getByRole("button", { name: "4. Revisar relatório", exact: true }).click();
    await expect(panel.getByRole("checkbox", { name: "Projetos", exact: true })).toBeDisabled();
    await expect(
      panel.getByRole("button", { name: "Remover Clientes", exact: true }),
    ).toBeDisabled();
    finishReview();
    reviewGate = undefined;
    await expect(
      panel.getByRole("heading", { name: "Revisar relatório", exact: true }),
    ).toBeVisible();
    assert.deepEqual(definitions.at(-1).areas, [
      { source: "integracao.projects", fields: ["name"], filters: [] },
      { source: "integracao.clients", fields: ["email"], filters: [] },
    ]);
    assert.equal(previews.length, 0, "Review never requires preview");
    await panel.getByRole("button", { name: "3. Definir critérios", exact: true }).click();
    const criteria = panel.getByRole("group", { name: "Projetos", exact: true });
    const clientCriteria = panel.getByRole("group", { name: "Clientes", exact: true });
    await clientCriteria.getByText("Mais opções", { exact: true }).click();
    await expect(clientCriteria.getByLabel("Resumo de E-mail")).toBeVisible();
    await expect(clientCriteria.getByLabel("Resumo de Nome")).toHaveCount(0);
    await clientCriteria.getByLabel("Resumo de E-mail").selectOption("count");
    await panel.getByRole("button", { name: "2. Escolher campos", exact: true }).click();
    await clients.getByRole("checkbox", { name: "E-mail", exact: true }).uncheck();
    await clients.getByRole("checkbox", { name: "Nome", exact: true }).check();
    await panel.getByRole("button", { name: "3. Definir critérios", exact: true }).click();
    const updatedClientCriteria = panel.getByRole("group", { name: "Clientes", exact: true });
    await updatedClientCriteria.getByText("Mais opções", { exact: true }).click();
    await expect(updatedClientCriteria.getByLabel("Resumo de E-mail")).toHaveCount(0);
    await expect(updatedClientCriteria.getByLabel("Resumo de Nome")).toHaveValue("");
    await panel.getByRole("button", { name: "2. Escolher campos", exact: true }).click();
    await clients.getByRole("checkbox", { name: "Nome", exact: true }).uncheck();
    await clients.getByRole("checkbox", { name: "E-mail", exact: true }).check();
    await panel.getByRole("button", { name: "3. Definir critérios", exact: true }).click();
    const restoredClientCriteria = panel.getByRole("group", { name: "Clientes", exact: true });
    await restoredClientCriteria.getByText("Mais opções", { exact: true }).click();
    await expect(restoredClientCriteria.getByLabel("Resumo de E-mail")).toHaveValue("");
    await expect(criteria.locator("details")).not.toHaveAttribute("open", "");
    await criteria.getByRole("button", { name: "Adicionar critério" }).click();
    await panel.getByRole("button", { name: "4. Revisar relatório", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Preencha Nome");
    await criteria.getByLabel("Valor do critério 1", { exact: true }).fill("Projeto de exemplo");
    await criteria.getByLabel("Combinar critérios").selectOption("or");
    await screenshot("01-criterios-desktop");
    await criteria.getByText("Mais opções", { exact: true }).click();
    await criteria.getByLabel("Ordenar por Situação").selectOption("asc");
    await criteria
      .getByRole("group", { name: "Agrupamento" })
      .getByLabel("Nome", { exact: true })
      .check();
    await criteria.getByLabel("Resumo de Nome").selectOption("count");
    await panel.getByRole("button", { name: "4. Revisar relatório", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText(
      "remova a ordenação de campos não agrupados",
    );
    await criteria.getByLabel("Ordenar por Situação").selectOption("");
    await criteria.getByLabel("Ordenar por Nome").selectOption("desc");
    await screenshot("02-opcoes-desktop");
    await panel.getByRole("button", { name: "4. Revisar relatório", exact: true }).click();
    await expect(panel.getByText("Pelo menos um critério", { exact: true })).toBeVisible();
    await expect(panel.getByText("Contagem de Nome", { exact: true })).toBeVisible();
    assert.equal(previews.length, 0);
    await screenshot("03-revisao-desktop");
    await panel.getByRole("button", { name: "Visualizar prévia", exact: true }).click();
    assert.deepEqual(previews.at(-1).areas[1].aggregations, []);
    await expect(
      panel.getByRole("region", { name: "Prévia de Projetos", exact: true }),
    ).toContainText("Projeto de exemplo");
    await expect(
      panel.getByRole("region", { name: "Prévia de Projetos", exact: true }),
    ).toContainText("7");
    await expect(
      panel.getByRole("region", { name: "Prévia de Clientes", exact: true }),
    ).toContainText("Nenhum registro encontrado");
    assert.equal(previews.at(-1).areas[0].filterLogic, "or");
    assert.deepEqual(previews.at(-1).areas[0].orderBy, [{ field: "name", direction: "desc" }]);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await screenshot("04-previa-dark");
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await panel.getByRole("button", { name: "3. Definir critérios", exact: true }).click();
    await criteria.getByLabel("Valor do critério 1", { exact: true }).fill("Outro projeto");
    await expect(panel.getByText(/A amostra está desatualizada/)).toBeVisible();
    await panel.getByRole("button", { name: "4. Revisar relatório", exact: true }).click();
    previewFailure = 422;
    await panel.getByRole("button", { name: "Visualizar prévia", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("capacidade");
    await checkLanguage();
    previewFailure = 403;
    const catalogBeforePreviewError = catalogRequests;
    await panel.getByRole("button", { name: "Visualizar prévia", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Seu acesso mudou");
    await expect.poll(() => catalogRequests).toBeGreaterThan(catalogBeforePreviewError);
    await expect(
      panel.getByRole("region", { name: "Prévia de Projetos", exact: true }),
    ).toHaveCount(0);
    previewFailure = 0;
    await panel.getByRole("button", { name: "Visualizar prévia", exact: true }).click();
    await expect(
      panel.getByRole("region", { name: "Prévia de Projetos", exact: true }),
    ).toBeVisible();
    await panel.getByRole("button", { name: "Gerar relatório", exact: true }).click();
    await expect(panel.getByText("Relatório aguardando na fila", { exact: true })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Gerando relatório", exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(panel.getByRole("heading", { name: "Relatório pronto", exact: true })).toBeVisible({
      timeout: 10000,
    });
    await expect(
      panel.getByRole("region", { name: "Resultado de Projetos", exact: true }),
    ).toContainText("Projeto gerado");
    const chartResult = panel.getByRole("region", { name: "Resultado de Projetos", exact: true });
    const chartType = chartResult.locator('section[aria-label="Visualização gráfica"] select').first();
    await chartType.selectOption("line");
    await expect(chartResult.getByRole("alert")).toContainText("dimensão de data ou número");
    await chartType.selectOption("bar");
    await expect(chartResult.getByRole("option", { name: "Contagem de Situação" })).toBeAttached();
    await expect(chartResult.getByRole("alert")).toContainText("mesma categoria e série");
    await chartResult.locator('section[aria-label="Visualização gráfica"] select').nth(3).selectOption("status");
    await expect(chartResult.getByRole("img", { name: /Gráfico de barras/ })).toBeVisible();
    await screenshotRegion("04-grafico-barras", chartResult.locator('section[aria-label="Visualização gráfica"]'));
    await expect(chartResult.getByRole("table").first()).toContainText("Projeto gerado");
    await chartResult.getByText("Ver valores do gráfico", { exact: true }).click();
    await expect(chartResult.getByRole("table").first()).toContainText("7");
    await chartType.selectOption("pie");
    await chartResult.locator('section[aria-label="Visualização gráfica"] select').nth(1).selectOption("category");
    await expect(chartResult.getByRole("img", { name: /Gráfico de setores/ })).toBeVisible();
    await screenshotRegion("05-grafico-setores", chartResult.locator('section[aria-label="Visualização gráfica"]'));
    const chartValues = chartResult.locator('section[aria-label="Visualização gráfica"] details');
    if (!(await chartValues.evaluate((element) => element.open))) {
      await chartValues.getByText("Ver valores do gráfico").click();
    }
    await expect(chartValues.getByRole("table")).toContainText("Sem valor (ausente)");
    await expect(chartValues.getByRole("table")).toContainText("Sem valor (texto)");
    await expect(
      panel.getByRole("region", { name: "Resultado de Clientes", exact: true }),
    ).toContainText("Nenhum registro encontrado");
    const csvDownload = page.waitForEvent("download");
    await panel.getByRole("button", { name: "Baixar resultado em CSV", exact: true }).click();
    assert.equal((await csvDownload).suggestedFilename(), "report-fixture.zip");
    assert.deepEqual(exportRequests, ["csv"]);
    await expect(page.getByText("CSV pronto para download.", { exact: true })).toBeVisible();
    await checkLanguage();
    await screenshot("05-resultado-desktop");
    await panel.getByRole("button", { name: "Salvar para usar novamente", exact: true }).click();
    const saveDialog = page.getByRole("dialog");
    await saveDialog.getByLabel("Nome", { exact: true }).fill("Projetos acompanhados");
    await saveDialog.getByLabel(/Descrição/).fill("Modelo para acompanhar projetos com clientes.");
    await saveDialog.getByRole("button", { name: "Salvar modelo", exact: true }).click();
    await expect(page.getByText("Modelo salvo para usar novamente.")).toBeVisible();
    await page.getByRole("tab", { name: "Modelos", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Projetos acompanhados", exact: true })).toBeVisible();
    await expect(page.getByText("Modelo para acompanhar projetos com clientes.", { exact: true })).toBeVisible();
    await screenshot("07-modelos-salvos-desktop");
    await page.getByRole("button", { name: "Abrir modelo", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Revisar relatório", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Gerar relatório", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Relatório pronto", exact: true })).toBeVisible({ timeout: 10000 });
    await panel.getByRole("button", { name: "Gerar relatório", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Cancelar geração", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Cancelar geração", exact: true }).click();
    await expect(panel.getByRole("heading", { name: "Geração cancelada", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await checkLanguage();
    await screenshot("06-resultado-mobile");
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      "Layout não deve transbordar no mobile",
    );
    await panel.getByRole("button", { name: "Remover Projetos", exact: true }).click();
    await expect(clients.getByRole("checkbox", { name: "E-mail", exact: true })).toBeChecked();
    await panel.getByRole("button", { name: "Remover Clientes", exact: true }).click();
    await panel.getByRole("button", { name: "4. Revisar relatório", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Escolha ao menos uma área");
    catalogMode = "empty";
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(panel.getByRole("status")).toContainText("Nenhuma área está disponível");
    catalogMode = "invalid";
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(panel.getByRole("alert")).toContainText("Não foi possível carregar as áreas", {
      timeout: 15000,
    });
    await checkLanguage();
    catalogMode = "ready";
    await panel.getByRole("button", { name: "Tentar novamente", exact: true }).click();
    await expect(panel.getByRole("checkbox", { name: "Projetos", exact: true })).toBeVisible();
    assert.deepEqual(pageErrors, []);
    items[0].parameters = [{ key: "period", label: "Competência", type: "date", required: true }];
    await page.reload({ waitUntil: "domcontentloaded" });
    await panel.getByRole("checkbox", { name: "Projetos", exact: true }).check();
    await panel.getByRole("button", { name: "Escolher campos", exact: true }).click();
    await projects.getByRole("checkbox", { name: "Nome", exact: true }).check();
    await panel.getByRole("button", { name: "4. Revisar relatório", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Preencha Competência");
    await panel.getByRole("button", { name: "3. Definir critérios", exact: true }).click();
    await criteria.getByLabel("Competência (obrigatório)", { exact: true }).fill("2026-09-01");
    await panel.getByRole("button", { name: "4. Revisar relatório", exact: true }).click();
    await expect(
      panel.getByRole("heading", { name: "Revisar relatório", exact: true }),
    ).toBeVisible();
    assert.deepEqual(definitions.at(-1).areas[0].parameterValues, { period: "2026-09-01" });
    await panel.getByRole("button", { name: "2. Escolher campos", exact: true }).click();
    await projects.getByRole("checkbox", { name: "Situação", exact: true }).check();
    await panel.getByRole("button", { name: "3. Definir critérios", exact: true }).click();
    await panel.getByRole("checkbox", { name: /Organizar relações entre campos/ }).check();
    await expect(panel.getByRole("group", { name: "Relações entre campos" })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await screenshotRegion("02-relacoes-lista-agrupada", panel.getByRole("group", { name: "Relações entre campos" }));
    await panel.getByRole("button", { name: "4. Revisar relatório", exact: true }).click();
    await expect(panel.getByRole("heading", { name: "Revisar relatório", exact: true })).toBeVisible();
    assert.equal(definitions.at(-1).version, 3);
    assert.deepEqual(definitions.at(-1).areas[0].dimensions, ["name"]);
    assert.deepEqual(definitions.at(-1).areas[0].details, ["status"]);
    await panel.getByRole("button", { name: "3. Definir critérios", exact: true }).click();
    const relationships = panel.getByRole("group", { name: "Relações entre campos" });
    await relationships.getByLabel("Apresentação desta área").selectOption("summary");
    await relationships.getByText("Colunas visíveis", { exact: true }).locator("..").getByRole("checkbox", { name: "Nome" }).uncheck();
    await expect(relationships).toContainText("grupos diferentes podem parecer linhas iguais");
    await screenshotRegion("03-relacoes-resumo", relationships);
    const unexpectedConsoleErrors = consoleErrors.filter(
      (message) =>
        !message.includes("403 (Forbidden)") && !message.includes("422 (Unprocessable Entity)"),
    );
    assert.deepEqual(unexpectedConsoleErrors, []);
    console.log(
      "PASS áreas/campos/revisão: agrupamento, múltiplas escolhas, vazios, remoção, preservação, teclado/foco, linguagem, CSRF, atualização do catálogo, desktop/mobile/dark e console",
    );
  } catch (error) {
    await screenshot("failure");
    throw error;
  } finally {
    await browser.close();
  }
}

await readFile(`${appRoot}/.next/BUILD_ID`, "utf8");
if (process.env.REPORTS_BROWSER_BASE_URL) {
  await run();
} else {
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", "3122", "--hostname", "127.0.0.1"],
    {
      cwd: appRoot,
      env: browserSmokeEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  console.log(`Next compilado PID=${server.pid} porta=3122 worktree=${appRoot}`);
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk;
  });
  server.stderr.on("data", (chunk) => {
    output += chunk;
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error(output);
      try {
        if ((await fetch(`${baseUrl}/login`)).status < 500) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(ready, "Next compilado não iniciou");
    await run();
  } finally {
    server.kill();
  }
}
