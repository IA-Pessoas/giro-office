import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { chromium } from "@playwright/test";

// Roda contra um app já no ar (`next start`), como o smoke do modal de certificados (#1367).
const baseUrl = process.env.FORM_A11Y_SMOKE_BASE_URL || "http://127.0.0.1:5177";
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

const MODULE_KEYS = [
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pessoal",
  "regularize",
  "rh",
  "ti",
  "triagem",
];

const smokeUser = {
  id: "user-form-a11y-smoke",
  name: "Form A11y Smoke",
  login: "form.a11y@castelo.test",
  permission: 3,
  organization_id: "org-smoke",
  department_id: "department-smoke",
  status: "Ativo",
  version: 1,
  type: "owner",
  modules: Object.fromEntries(MODULE_KEYS.map((moduleKey) => [moduleKey, 3])),
};

const SMOKE_CLIENT = {
  id: "client-form-a11y-smoke",
  name: "Cliente A11y",
  company_name: "Cliente A11y",
  cpf_cnpj: "00.000.000/0001-00",
};

function mockData(url) {
  if (url.includes("/user/me")) return smokeUser;
  if (new URL(url).pathname.endsWith(`/client/${SMOKE_CLIENT.id}`)) return SMOKE_CLIENT;
  if (new URL(url).pathname.endsWith(`/organizations/${smokeUser.organization_id}`)) {
    return {
      id: smokeUser.organization_id,
      name: "Castelo Contabilidade",
      cnpj: "11222333000181",
      status: "active",
      subscription_plan: "pro",
      logo_url: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
  }
  if (url.includes("/task/list")) {
    return { data: [], total: 0, hasMore: false, summary: { inProgress: 0, billable: 0 } };
  }
  if (url.includes("/client/list")) {
    return { items: [SMOKE_CLIENT], total: 1, page: 1, pageSize: 50, hasMore: false };
  }
  return [];
}

async function installApiMocks(page) {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: mockData(route.request().url()) }),
    });
  });
  await page.route("**/socket.io/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
  });
}

/** axe sem violação crítica/séria e todo controle visível com rótulo associado. */
async function assertAccessibleForm(page, name, scopeSelector) {
  await page.addScriptTag({ content: axeSource });
  const report = await page.evaluate(async (selector) => {
    const scope = document.querySelector(selector);
    const result = await window.axe.run(scope, { resultTypes: ["violations"] });
    const violations = result.violations
      .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
      .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
    // O axe aceita um <label> que envolve o campo mesmo quando ele rotula outro controle
    // (ex.: botão de ajuda antes do input); `labels` confere a associação que o navegador usa.
    const controls = [...scope.querySelectorAll("input:not([type=hidden]), select, textarea")].filter(
      (element) => element.offsetParent !== null,
    );
    const unlabeled = controls
      .filter(
        (element) =>
          element.labels.length === 0 &&
          !element.getAttribute("aria-label") &&
          !element.getAttribute("aria-labelledby"),
      )
      .map((element) => element.outerHTML.slice(0, 120));
    return { violations, unlabeled, controls: controls.length };
  }, scopeSelector);

  assert.ok(report.controls > 0, `${name}: nenhum campo encontrado para auditar.`);
  assert.deepEqual(report.violations, [], `${name}: violações axe críticas/sérias.`);
  assert.deepEqual(report.unlabeled, [], `${name}: campos sem rótulo associado.`);
  console.log(`PASS ${name}: ${report.controls} campos com rótulo, axe sem violação crítica`);
}

/** Erro abaixo do campo, anunciado: aria-invalid e aria-describedby apontando para o texto. */
async function assertFieldError(scope, label, message) {
  // Campos obrigatórios somam "campo obrigatório" (texto só para leitor de tela) ao nome.
  const escaped = label.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const name = new RegExp(`^${escaped}( campo obrigatório)?$`);
  const field = scope.getByRole("textbox", { name }).or(scope.getByRole("combobox", { name }));
  assert.equal(await field.getAttribute("aria-invalid"), "true", `${label}: aria-invalid`);
  const describedBy = await field.getAttribute("aria-describedby");
  assert.ok(describedBy, `${label}: o campo com erro precisa de aria-describedby.`);
  const texts = await Promise.all(
    describedBy.split(" ").map((id) => scope.page().locator(`[id="${id}"]`).innerText()),
  );
  assert.ok(texts.includes(message), `${label}: esperava "${message}", veio ${JSON.stringify(texts)}.`);
}

async function openDialog(page, buttonName) {
  await page.getByRole("button", { name: buttonName, exact: true }).first().click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
  // Com o fade-in em curso o axe mede o contraste com opacidade parcial e acusa falso positivo.
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
}

async function goto(page, path, ready) {
  await page.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
  await ready.waitFor({ state: "visible", timeout: 60_000 });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });

try {
  await context.addCookies([
    { name: "cw.session", value: "opaque-test-session", url: baseUrl, httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  await installApiMocks(page);

  await goto(page, "/clients", page.getByRole("button", { name: "Novo cliente", exact: true }));
  await openDialog(page, "Novo cliente");
  await assertAccessibleForm(page, "Clientes: Novo cliente", '[role="dialog"]');

  // Enviar vazio: o erro aparece abaixo do campo e é anunciado por aria-describedby.
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await assertFieldError(dialog, "CNPJ", "Informe o CNPJ.");
  await assertFieldError(dialog, "Razão social", "Informe a razão social.");
  // Novo cliente PF, a primeira evidência da issue.
  await dialog.getByLabel("Tipo de pessoa").selectOption("PF");
  await assertAccessibleForm(page, "Clientes: Novo cliente PF", '[role="dialog"]');
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await assertFieldError(dialog, "Nome", "Informe o nome.");
  await assertFieldError(dialog, "CPF", "Informe o CPF.");
  console.log("PASS Clientes: Novo cliente PJ e PF mostram o erro abaixo do campo");
  await page.keyboard.press("Escape");

  await goto(page, "/clients/integration/new", page.getByRole("button", { name: "Salvar", exact: true }));
  await assertAccessibleForm(page, "Clientes: Nova integração", "main");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await assertFieldError(page.locator("main"), "CNPJ", "Informe o CNPJ.");
  await assertFieldError(page.locator("main"), "Razão Social", "Informe a razão social.");
  console.log("PASS Clientes: Nova integração mostra o erro abaixo do campo");

  // Nova tarefa só habilita com cliente escolhido.
  await goto(
    page,
    `/tasks?clientId=${SMOKE_CLIENT.id}`,
    page.getByRole("button", { name: "Nova tarefa", exact: true }),
  );
  await openDialog(page, "Nova tarefa");
  await assertAccessibleForm(page, "Tarefas: Nova tarefa", '[role="dialog"]');
  await page.getByRole("dialog").getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await assertFieldError(page.getByRole("dialog"), "Projeto", "Selecione o projeto.");
  console.log("PASS Tarefas: Nova tarefa mostra o erro abaixo do campo");
  await page.keyboard.press("Escape");

  await goto(page, "/certificados", page.getByRole("button", { name: "Novo PJ", exact: true }));
  await openDialog(page, "Novo PJ");
  await assertAccessibleForm(page, "Certificados: Novo PJ", '[role="dialog"]');
  await page.getByRole("button", { name: "Criar certificado", exact: true }).click();
  await assertFieldError(page.getByRole("dialog"), "Nome", "Informe o nome do cliente.");
  console.log("PASS Certificados: Novo PJ mostra o erro abaixo do campo");
  // Clicar no rótulo foca o campo: antes o botão de ajuda dentro do <label> ficava com o rótulo.
  await page.getByRole("dialog").locator("label", { hasText: "Situação Castelo" }).click();
  assert.equal(
    await page.evaluate(() => document.activeElement?.tagName),
    "SELECT",
    "Clicar em 'Situação Castelo' deve focar o select.",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "PF", exact: true }).click();
  await openDialog(page, "Novo PF");
  await assertAccessibleForm(page, "Certificados: Novo PF", '[role="dialog"]');
  await page.keyboard.press("Escape");

  await goto(page, "/configuracoes", page.getByRole("button", { name: "Editar dados de acesso" }));
  await openDialog(page, "Editar dados de acesso");
  await assertAccessibleForm(page, "Configurações: dados de acesso", '[role="dialog"]');
  await page.keyboard.press("Escape");
  await openDialog(page, "Editar organização");
  await assertAccessibleForm(page, "Configurações: organização", '[role="dialog"]');
} finally {
  await context.close();
  await browser.close();
}
