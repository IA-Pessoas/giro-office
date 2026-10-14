import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseUrl = (process.env.COMMERCIAL_SMOKE_BASE_URL || "http://localhost:3174").replace(
  /\/$/u,
  "",
);
const evidenceDir = process.env.COMMERCIAL_SMOKE_EVIDENCE_DIR || "output/playwright/issue-1891";
const csrf = "A".repeat(43);
const jwtSecret = "commercial-smoke-jwt-secret";
const user = {
  id: "user-commercial-contract-smoke",
  name: "Comercial Smoke",
  login: "commercial.smoke",
  organization_id: "organization-commercial-smoke",
  permission: 2,
  type: "admin",
  modules: { comercial: 2, integracao: 2 },
};
const client = {
  id: "b0000000-0000-4000-8000-000000000001",
  status: "Ativo",
  prospecting_status: "Fechado",
  dominio_code: null,
  name: "Cliente Smoke",
  company_name: "Empresa Smoke Ltda.",
  cpf_cnpj: "12345678000190",
  address: "Rua Teste, 100",
  neighborhood: "Centro",
  city: "Feira de Santana",
  state: "BA",
  cep: "44000-000",
  number: "75999999999",
  email: "contato@smoke.test",
  responsible: "Representante Smoke",
  cpf_responsible: "12345678901",
  regime: "Simples Nacional",
  contabil: true,
  fiscal: false,
  pessoal: true,
  tecnologia: true,
};

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sessionToken() {
  const header = base64url({ alg: "HS256", typ: "JWT" });
  const payload = base64url({
    user_id: user.id,
    organization_id: user.organization_id,
    permission: user.permission,
    type: user.type,
    modules: user.modules,
    session_id: "commercial-contract-smoke",
    session_version: 1,
    csrf_hash: createHash("sha256").update(csrf).digest("hex"),
  });
  const signature = createHmac("sha256", jwtSecret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function run() {
  await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const writes = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    if (request.method() !== "GET" && new URL(request.url()).pathname.startsWith("/api/")) {
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });

  try {
    const anonymousContext = await browser.newContext({ baseURL: baseUrl });
    const anonymousResponse = await anonymousContext.request.get(
      `/clients/${client.id}/contract`,
      { maxRedirects: 0 },
    );
    assert.equal(anonymousResponse.status(), 307, "acesso sem sessão deve ser redirecionado");
    assert.equal(anonymousResponse.headers().location, "/login");
    await anonymousContext.close();
    await context.addCookies([
      { name: "cw.session", value: sessionToken(), url: baseUrl, httpOnly: true },
      { name: "cw.csrf", value: csrf, url: baseUrl, httpOnly: false },
    ]);
    const json = (route, data) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data }),
      });
    await page.route(/\/user\/me(?:\?.*)?$/u, (route) => json(route, user));
    await page.route("**/api/task/notifications", (route) => json(route, []));
    await page.route("**/api/client/list**", (route) =>
      json(route, {
        items: [client],
        total: 1,
        page: 1,
        pageSize: 20,
        hasMore: false,
      }),
    );
    await page.route("**/api/task/list**", (route) =>
      json(route, {
        data: [],
        total: 0,
        hasMore: false,
        summary: { inProgress: 0, billable: 0 },
      }),
    );
    await page.route(`**/api/client/${client.id}`, (route) => json(route, client));

    await page.goto(`/clients/${client.id}/contract`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    assert.equal(
      (await page.request.get("/commercial-contract-template.html")).status(),
      404,
      "modelo com dados do representante não pode ser público",
    );
    await page.getByRole("heading", { name: "Contrato comercial", exact: true }).waitFor();
    const staticScripts = await page
      .locator("script[src]")
      .evaluateAll((scripts) => [
        ...new Set(
          scripts
            .map((script) => script.src)
            .filter((src) => src.includes("/_next/static/") && src.endsWith(".js")),
        ),
      ]);
    assert.ok(staticScripts.length > 0, "a tela deve ter chunks públicos para verificar");
    for (const scriptUrl of staticScripts) {
      const script = await (await page.request.get(scriptUrl)).text();
      assert.doesNotMatch(
        script,
        /798\.194\.605-06|965921760/,
        "dados da contratada não podem estar nos chunks públicos do browser",
      );
    }
    assert.equal(
      new URL(page.url()).search,
      "",
      "URL não deve conter dados pessoais ou parâmetros",
    );
    assert.match(page.url(), new RegExp(`/clients/${client.id}/contract$`, "u"));
    await page.getByLabel("Cliente / razão social").waitFor();
    assert.equal(
      await page.getByLabel("Cliente / razão social").inputValue(),
      client.company_name,
    );
    assert.equal(await page.getByLabel("Regime tributário").inputValue(), client.regime);
    await page.getByLabel("Cliente / razão social").fill("Nome informado pelo operador");
    assert.equal(
      await page.getByLabel("Cliente / razão social").inputValue(),
      "Nome informado pelo operador",
      "o formulário deve manter a alteração informada pelo operador",
    );
    await page.getByLabel("Cliente / razão social").fill(client.company_name);
    await page.getByLabel("Simples Nacional (%)").fill("25,2");
    await page.getByLabel("Data do contrato").fill("2026-10-14");
    await page.getByLabel("Primeiro vencimento").fill("2026-11-15");
    await page.getByLabel("Regularize", { exact: true }).check();

    const frame = page.frameLocator('iframe[title="Prévia do contrato comercial"]');
    await frame
      .getByRole("heading", {
        name: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CONTABILIDADE",
        exact: true,
      })
      .waitFor();
    await frame.getByText("Empresa Smoke Ltda.", { exact: true }).first().waitFor();
    await frame.getByText("25,2% do salário mínimo vigente", { exact: false }).waitFor();
    const contractText = await frame.locator("body").innerText();
    assert.match(contractText, /ANEXO I – TERMO DE ADESÃO/u);
    assert.match(contractText, /25,2% do salário mínimo vigente/u);
    await page.screenshot({ path: `${evidenceDir}/contract-review.png`, fullPage: true });
    await frame
      .locator("#carde")
      .first()
      .screenshot({ path: `${evidenceDir}/contract-page-1.png` });
    await frame
      .locator("#carde")
      .last()
      .screenshot({ path: `${evidenceDir}/contract-annex.png` });

    const printPage = await context.newPage();
    const documentHtml = await frame.locator("html").evaluate((element) => element.outerHTML);
    await printPage.setContent(documentHtml.replace("<head>", `<head><base href="${baseUrl}/">`));
    await printPage.emulateMedia({ media: "print" });
    await printPage
      .locator(".contract-letterhead")
      .first()
      .evaluate((image) => image.decode());
    assert.equal(
      await printPage.locator(".contract-letterhead").first().evaluate((image) => image.naturalWidth > 0),
      true,
      "papel timbrado deve carregar como imagem de primeiro plano na impressão",
    );
    await printPage
      .locator("#carde")
      .first()
      .screenshot({
        path: `${evidenceDir}/contract-print-page-1.png`,
      });
    await printPage.pdf({
      path: `${evidenceDir}/contract-preview.pdf`,
      format: "A4",
      printBackground: false,
    });
    await printPage.close();

    await frame.locator("body").evaluate(() => {
      window.__printCalls = 0;
      window.print = () => {
        window.__printCalls += 1;
      };
    });
    await page.getByRole("button", { name: "Imprimir / salvar em PDF", exact: true }).click();
    await frame.locator("body").waitFor();
    await page.waitForTimeout(100);
    assert.equal(await frame.locator("body").evaluate(() => window.__printCalls), 1);
    assert.deepEqual(writes, [], "rascunho não pode ser persistido automaticamente");
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
