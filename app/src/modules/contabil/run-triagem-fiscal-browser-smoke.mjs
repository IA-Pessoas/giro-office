import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

import { EMPTY_SOLICITATION_INDICATORS } from "../triagem/triagemSmokeFixtures.mjs";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3125").replace(/\/$/, "");
const screenshotPath =
  process.env.TRIAGE_BROWSER_SCREENSHOT_PATH ??
  "output/playwright/issue-1149-triagem-fiscal.png";
const portfolioScreenshotDir = process.env.TRIAGE_PORTFOLIO_SCREENSHOT_DIR;
const clientId = "c1000000-0000-4000-8000-000000000001";
const accountingMonthlyId = "m1000000-0000-4000-8000-000000000001";
const fiscalMonthlyId = "m2000000-0000-4000-8000-000000000001";
const competence = "2026-09";
const accountingFields = [
  "financial_transactions",
  "triaged_transactions",
  "inventory_control",
  "accounts_payable_report",
  "accounts_receivable_report",
  "card_statements",
  "loan_agreements",
  "bank_reconciliation",
  "bank_investments",
  "card_sales_report",
];
const fiscalChecklistFields = [
  "inbound_report",
  "outbound_report",
  "nfse_provided",
  "nfse_received",
  "cte_documents",
  "mei_documents",
  "nfce_documents",
  "sped_fiscal",
  "sped_contributions",
  "nfce_received",
  "model_21_invoice",
  "cte_as_issuer",
  "services_provided_as_mei",
];
const fiscalFields = [...fiscalChecklistFields, "billing_amount"];

function createFixture(id, type, fields) {
  return {
    id,
    client_id: clientId,
    competence,
    type,
    billing_amount: type === "FISCAL" ? "12500,00" : null,
    checklist: Object.fromEntries(fields.map((field) => [field, "PENDING"])),
    item_notes: Object.fromEntries(
      fields.map((field) => [
        field,
        {
          note: null,
          justification: null,
          ...(type === "FISCAL"
            ? { required: true, priority: "MEDIUM", delivery_method: "EMAIL" }
            : {}),
        },
      ]),
    ),
    summary: {
      applicable: fields.length,
      completed: 0,
      attention: 0,
      pending: fields.length,
      notApplicable: 0,
      notPresent: 0,
      percentage: 0,
    },
  };
}

const accountingFixture = createFixture(
  accountingMonthlyId,
  "CONTABIL",
  accountingFields,
);
const fiscalSpecialConfig = { client_id: clientId, type: "FISCAL", configured: true, active_items: ["sped_fiscal"] };
const fiscalSettings = { client_id: clientId, priority: true, delivery_method: "EMAIL" };
const fiscalFixture = createFixture(
  fiscalMonthlyId,
  "FISCAL",
  fiscalChecklistFields,
);
const user = {
  id: "c0000000-0000-4000-8000-000000000001",
  name: "Analista Fiscal",
  login: "analista",
  permission: 2,
  organization_id: "a0000000-0000-4000-8000-000000000001",
  type: "admin",
  modules: { triagem: 2, contabil: 2, fiscal: 2 },
};

function json(route, data, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
}

function recomputeSummary(fixture) {
  const values = Object.values(fixture.checklist);
  const completed = values.filter((value) => value === "COMPLETED").length;
  const attention = values.filter(
    (value) => value === "ATTENTION" || value === "UNDER_REVIEW",
  ).length;
  const pending = values.filter((value) => value === "PENDING").length;
  const notApplicable = values.filter((value) => value === "NOT_APPLICABLE").length;
  const notPresent = values.filter((value) => value === "NOT_PRESENT").length;
  const applicable = values.length - notApplicable - notPresent;
  fixture.summary = {
    applicable,
    completed,
    attention,
    pending,
    notApplicable,
    notPresent,
    percentage: applicable === 0 ? 0 : Math.round((completed / applicable) * 100),
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL: baseUrl,
  viewport: { width: 1440, height: 1200 },
});
await context.addCookies([
  {
    name: "cw.session",
    value: "fixture-session",
    url: baseUrl,
    httpOnly: true,
    sameSite: "Lax",
  },
  {
    name: "cw.csrf",
    value: "fixture-csrf",
    url: baseUrl,
    sameSite: "Lax",
  },
]);

const page = await context.newPage();
// A competência inicial é a do relógio; fixar o mês mantém o smoke estável fora de 2026-09.
await page.clock.setFixedTime(new Date("2026-09-15T12:00:00-03:00"));
page.on("pageerror", (error) => console.error("[triagem-fiscal browser]", error));
page.on("console", (message) => {
  if (message.type() === "error") console.error("[triagem-fiscal console]", message.text());
});
const requests = [];
let holdFiscalMonthly = true;
let releaseFiscalMonthly;
const fiscalMonthlyGate = new Promise((resolve) => {
  releaseFiscalMonthly = resolve;
});
let failNextMutation = false;

await page.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const apiPath = url.pathname.startsWith("/api/")
    ? url.pathname.slice("/api".length)
    : url.port === "3010"
      ? url.pathname
      : null;
  if (!apiPath) return route.continue();

  requests.push(request.method() + " " + apiPath + url.search);
  if (request.method() === "GET" && apiPath === "/user/me") return json(route, user);
  if (request.method() === "GET" && apiPath === "/triagem/overview") {
    return json(route, {
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
      indicators: { urgent_open: 0, routine_pending: 0, bank_pending: 0, complete: 0, no_applicable_items: 0 },
    });
  }
  if (request.method() === "GET" && apiPath === "/triagem/catalogs") {
    return json(route, url.searchParams.get("kind") === "DELIVERY_METHOD" ? [
      { id: "delivery-email", code: "EMAIL", label: "E-mail" },
      { id: "delivery-portal", code: "PORTAL", label: "Portal" },
    ] : []);
  }
  if (apiPath === "/triagem/config" && url.searchParams.get("type") === "FISCAL") {
    return json(route, fiscalSpecialConfig);
  }
  if (request.method() === "PUT" && apiPath === "/triagem/config") {
    const body = request.postDataJSON();
    if (body.type === "FISCAL") fiscalSpecialConfig.active_items = body.active_items;
    return json(route, { ...fiscalSpecialConfig, ...body });
  }
  if (apiPath === "/triagem/fiscal-settings") {
    if (request.method() === "PUT") Object.assign(fiscalSettings, request.postDataJSON());
    return json(route, fiscalSettings);
  }
  if (request.method() === "GET" && apiPath === "/client/list") {
    return json(route, {
      items: [
        {
          id: clientId,
          name: "Cliente Demonstração",
          company_name: "Cliente Demonstração",
          cpf_cnpj: "00.000.000/0001-00",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    });
  }
  if (request.method() === "GET" && apiPath === "/triagem/competencies") {
    return json(route, [
      {
        id: "t1000000-0000-4000-8000-000000000001",
        client_id: clientId,
        competence,
        configuration_snapshot: {},
        responsible_snapshot: {},
        archived_at: null,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      },
    ]);
  }
  if (request.method() === "GET" && apiPath === "/triagem/editability") {
    return json(route, { can_edit: true });
  }
  if (request.method() === "GET" && apiPath === "/triagem/fiscal-portfolio") {
    return json(route, {
      competence,
      items: [
        {
          client_id: clientId,
          legal_name: "Cliente Demonstração",
          cpf_cnpj: "00000000000100",
          regime: "MEI",
          responsible_id: user.id,
          responsible_name: user.name,
          priority: fiscalSettings.priority,
          delivery_method: fiscalSettings.delivery_method,
          can_edit: true,
          has_competence: true,
          planned_checklist: null,
          monthly: {
            id: fiscalMonthlyId,
            checklist: fiscalFixture.checklist,
            item_notes: fiscalFixture.item_notes,
          },
        },
        {
          client_id: "c1000000-0000-4000-8000-000000000002",
          legal_name: "Empresa sem rotina",
          cpf_cnpj: "11111111000111",
          regime: "Lucro Presumido",
          responsible_id: null,
          responsible_name: null,
          can_edit: false,
          has_competence: false,
          planned_checklist: null,
          monthly: null,
        },
      ],
    });
  }
  if (request.method() === "GET" && apiPath === "/triagem/monthly") {
    if (url.searchParams.get("type") === "FISCAL") {
      if (holdFiscalMonthly) await fiscalMonthlyGate;
      return json(route, fiscalFixture);
    }
    return json(route, accountingFixture);
  }
  if (request.method() === "GET" && apiPath === "/triagem/statements") return json(route, []);
  if (request.method() === "GET" && apiPath === "/triagem/closing") {
    return json(route, {
      id: "cl1000000-0000-4000-8000-000000000001",
      client_id: clientId,
      competence,
      status: "RECEIVED",
    });
  }
  if (
    request.method() === "PATCH" &&
    apiPath === "/triagem/monthly/" + fiscalMonthlyId + "/item"
  ) {
    const body = request.postDataJSON();
    if (failNextMutation) {
      failNextMutation = false;
      return route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ error: "Falha de validação da rotina fiscal." }),
      });
    }
    if (body.field === "billing_amount") {
      fiscalFixture.billing_amount = body.value;
    } else {
      fiscalFixture.checklist[body.field] =
        body.status ?? fiscalFixture.checklist[body.field];
      fiscalFixture.item_notes[body.field] = {
        ...fiscalFixture.item_notes[body.field],
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.justification !== undefined ? { justification: body.justification } : {}),
        ...(body.delivery_method !== undefined
          ? { delivery_method: body.delivery_method }
          : {}),
      };
    }
    recomputeSummary(fiscalFixture);
    return json(route, fiscalFixture);
  }
  if (request.method() === "GET" && apiPath === "/triagem/solicitations/indicators") {
    return json(route, EMPTY_SOLICITATION_INDICATORS);
  }
  return json(route, []);
});

try {
  assert.equal(fiscalFields.length, 14);
  assert.equal(fiscalChecklistFields.length, 13);
  await page.goto("/triagem", { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.getByRole("heading", { name: "Triagem Fiscal mensal" })).toBeVisible();
  await expect(page.getByLabel("Competência da Triagem Fiscal (mês)")).toHaveValue("09");
  await expect(page.getByLabel("Competência da Triagem Fiscal (ano)")).toHaveValue("2026");
  await expect(page.getByText("Empresa sem rotina")).toBeVisible();
  if (portfolioScreenshotDir) {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const section = page.locator('section[aria-labelledby="fiscal-triage-portfolio-title"]');
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${portfolioScreenshotDir}/00-contexto-office.png` });
    await section.screenshot({ path: `${portfolioScreenshotDir}/01-carteira-mensal.png` });
  }
  await page.getByLabel("Cliente Demonstração: Relatório de entradas").selectOption("COMPLETED");
  await expect.poll(() => fiscalFixture.checklist.inbound_report).toBe("COMPLETED");
  if (portfolioScreenshotDir) {
    const section = page.locator('section[aria-labelledby="fiscal-triage-portfolio-title"]');
    await expect(page.getByLabel("Cliente Demonstração: Relatório de entradas")).toHaveValue("COMPLETED");
    await section.screenshot({ path: `${portfolioScreenshotDir}/02-baixa-registrada.png` });
    await page.getByLabel("Filtrar status documental").selectOption("COMPLETED");
    await section.screenshot({ path: `${portfolioScreenshotDir}/03-filtro-concluidos.png` });
    await page.getByLabel("Filtrar status documental").selectOption("");
    const scroller = section.locator(".overflow-x-auto");
    await scroller.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await section.screenshot({ path: `${portfolioScreenshotDir}/04-colunas-finais.png` });
    await scroller.evaluate((element) => { element.scrollLeft = 0; });
  }
  await page.getByLabel("Filtrar prioridade").selectOption("yes");
  await expect(page.getByText("Empresa sem rotina")).toHaveCount(0);
  await expect(page.getByText("Cliente Demonstração").first()).toBeVisible();
  await page.getByLabel("Filtrar prioridade").selectOption("");
  await page.getByLabel("Filtrar meio de envio").selectOption("none");
  await expect(page.getByText("Empresa sem rotina")).toBeVisible();
  await expect(page.getByLabel("Cliente Demonstração: Relatório de entradas")).toHaveCount(0);
  await page.getByLabel("Filtrar meio de envio").selectOption("");
  await page.getByLabel("Filtrar responsável").selectOption("none");
  await page.getByLabel("Filtrar justificativa").selectOption("without");
  await expect(page.getByText("Empresa sem rotina")).toBeVisible();
  await expect(page.getByLabel("Cliente Demonstração: Relatório de entradas")).toHaveCount(0);
  await page.getByLabel("Filtrar responsável").selectOption("");
  await page.getByLabel("Filtrar justificativa").selectOption("");
  await expect(page.getByLabel("Cliente Demonstração: Relatório de entradas")).toHaveCount(1);
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV" }).click();
  const csv = await csvDownload;
  assert.equal(csv.suggestedFilename(), `triagem-fiscal-${competence}.csv`);
  assert.match(readFileSync(await csv.path(), "utf8"), /Empresa sem rotina/);
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Imprimir / PDF" }).click();
  const pdfPage = await popup;
  await expect(pdfPage.getByRole("heading", { name: `Triagem Fiscal · ${competence}` })).toBeVisible();
  await pdfPage.close();
  await page.bringToFront();
  await page.getByRole("button", { name: "Selecionar cliente" }).click();
  await page.getByRole("option", { name: /Cliente Demonstração/ }).click();
  await expect(page.getByText("Carregando pendências").first()).toBeVisible();
  releaseFiscalMonthly();

  await expect(page.getByRole("heading", { name: "Pendências documentais" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pendências fiscais" })).toBeVisible();
  await expect(page.locator('select[aria-label$=" status"]')).toHaveCount(23);
  await expect(page.getByLabel("Faturamento fiscal")).toHaveCount(1);
  await expect(page.getByLabel("Cliente prioritário")).toHaveValue("yes");
  await expect(page.getByLabel("Meio de envio do cliente")).toHaveValue("EMAIL");
  await page.getByLabel("Cliente prioritário").selectOption("no");
  await page.getByLabel("Meio de envio do cliente").selectOption("PORTAL");
  await page.getByRole("button", { name: "Salvar prioridade e meio de envio" }).click();
  await expect.poll(() => fiscalSettings).toMatchObject({ priority: false, delivery_method: "PORTAL" });
  await expect(page.getByLabel("Documento especial: SPED Fiscal")).toBeChecked();
  await page.getByLabel("Documento especial: Nota fiscal modelo 21").check();
  await page.getByRole("button", { name: "Salvar documentos especiais" }).click();
  await expect
    .poll(() => fiscalSpecialConfig.active_items)
    .toEqual(["sped_fiscal", "model_21_invoice"]);
  await expect(page.getByLabel("Movimentações financeiras Método de entrega")).toHaveCount(0);

  await page.getByLabel("Faturamento fiscal").fill("13000,00");
  await page.getByRole("button", { name: "Salvar faturamento" }).click();
  await page.getByLabel("Relatório de entradas status").selectOption("UNDER_REVIEW");
  await page
    .getByLabel("Relatório de entradas Método de entrega")
    .selectOption("PORTAL");
  await page.waitForTimeout(1000);
  await expect(page.getByText(/1 em atenção/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel("Cliente Demonstração: Relatório de entradas")).toHaveValue(
    "UNDER_REVIEW",
  );

  const reviewRequest = requests.find(
    (request) => request === "PATCH /triagem/monthly/" + fiscalMonthlyId + "/item",
  );
  assert.ok(reviewRequest);

  failNextMutation = true;
  await page.getByLabel("Relatório de saídas Nota").fill("Valor inválido");
  await page.getByRole("button", { name: "Salvar observações de Relatório de saídas" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Falha de validação da rotina fiscal." }),
  ).toContainText("Falha de validação da rotina fiscal.");

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(
    JSON.stringify({
      url: page.url(),
      title: await page.title(),
      accountingDocuments: await page
        .locator(
          'section[aria-labelledby="triage-contabil-documents-title"] select[aria-label$=" status"]',
        )
        .count(),
      fiscalDocuments: await page
        .locator(
          'section[aria-labelledby="triage-fiscal-documents-title"] select[aria-label$=" status"]',
        )
        .count(),
      requestCount: requests.length,
      alert: await page
        .getByRole("alert")
        .filter({ hasText: "Falha de validação da rotina fiscal." })
        .innerText(),
    }),
  );
} finally {
  await browser.close();
}
