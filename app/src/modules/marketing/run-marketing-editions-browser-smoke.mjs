import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";

import { browserSmokeEnv } from "../../shared/testing/browserSmokeEnv.mjs";

const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const baseUrl = process.env.MARKETING_EDITIONS_BASE_URL || "http://127.0.0.1:3116";
const outputDirectory = path.resolve(appRoot, "../output/playwright");
const event = {
  id: "72b62514-602b-4c63-b6af-5f75a18cebd2",
  name: "Encontro de validação",
  logo: "",
  status: "Em andamento",
  priority: "Alta",
  objective: "Validar o relatório da edição.",
  audience: "Comunidade local",
};
const feedback = { rating: 4, observation: "Boa participação e organização.", evaluatedAt: "2026-09-29T13:00:00.000Z" };
let edition = {
  id: "b0b3982b-8d0c-4f85-8832-c11238a58988",
  eventId: event.id,
  name: "Edição de setembro",
  date: "2026-09-20",
  place: "Centro de Eventos",
  budgetItems: [{ id: "budget-item-1", name: "Locação", amount: "120.00", position: 0 }],
  budgetTotal: "120.00",
  partnerships: ["Parceiro Alfa"],
  organizingTeam: ["Equipe de produção"],
  logistics: { fornecedores: ["Fornecedor confirmado"], cronograma: [], registro: [], transporte: [], acomodacoes: [] },
  marketingCommunication: { abertura: [], divulgacao: ["Boletim da comunidade"], acessoria: [], site: [] },
  duringEvent: { recepcao: [], staff: [], programacao: ["Abertura às 9h"], feedback: [] },
  afterEvent: { avaliacao: [], agradecimento: [], relatorio: [], followup: [] },
  notes: "Levar material de sinalização.",
  feedbackPeriodStart: null,
  feedbackPeriodEnd: null,
  feedback: null,
};
const dashboard = {
  requests: { active: { total: 0, rh: 0, ti: 0 }, new: { total: 0, rh: 0, ti: 0 }, urgent: { total: 0, rh: 0, ti: 0 } },
  birthdays: {
    clients: { total: 0, items: [] },
    employees: { total: 0, items: [] },
    companies: { total: 0, items: [] },
  },
  alerts: [],
};
const user = {
  id: "marketing-editions-user",
  login: "marketing.editions",
  name: "Pessoa de teste",
  type: "user",
  permission: 1,
  organization_id: "marketing-editions-org",
  department_id: "marketing-editions-department",
  modules: { marketing: 2 },
};

await mkdir(outputDirectory, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 1000 } });
  const apiRequests = [];
  await context.addCookies([
    { name: "cw.session", value: "opaque-marketing-editions-fixture", url: baseUrl, httpOnly: true, sameSite: "Lax" },
    { name: "cw.csrf", value: "M".repeat(43), url: baseUrl, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  page.on("pageerror", (error) => apiRequests.push(`pageerror:${error.message}`));
  await page.route("**/socket.io/**", (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "ok" }));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname.replace(/^\/api/, "");
    const method = request.method();
    let data = [];
    let status = 200;
    apiRequests.push(`${method} ${pathname}`);

    if (pathname.endsWith("/user/me")) data = user;
    else if (pathname.endsWith("/marketing/dashboard")) data = dashboard;
    else if (pathname.endsWith("/marketing/events/list")) data = [event];
    else if (pathname.endsWith(`/marketing/events/${event.id}/editions`) && method === "GET") data = [edition];
    else if (pathname.endsWith(`/marketing/events/${event.id}/editions/${edition.id}`) && method === "PUT") {
      const payload = request.postDataJSON();
      assert.equal(request.headers()["x-csrf-token"], "M".repeat(43), "edition update must include CSRF protection");
      edition = {
        ...edition,
        ...payload,
        budgetItems: payload.budgetItems.map((item, index) => ({
          ...item,
          id: edition.budgetItems[index]?.id ?? `budget-item-${index + 1}`,
          position: index,
        })),
      };
      data = edition;
    } else if (pathname.endsWith(`/marketing/events/${event.id}/editions/${edition.id}/feedback`) && method === "POST") {
      const payload = request.postDataJSON();
      assert.equal(request.headers()["x-csrf-token"], "M".repeat(43), "feedback creation must include CSRF protection");
      assert.equal(payload.rating, 4);
      assert.equal(payload.observation, "Boa participação e organização.");
      edition = { ...edition, feedback };
      data = feedback;
      status = 201;
    } else if (pathname.endsWith(`/marketing/events/${event.id}/editions/${edition.id}/report`) && method === "GET") {
      data = { event, edition };
    } else if (pathname.endsWith("/departments")) data = [];
    else {
      return route.fulfill({ status: 404, json: { success: false, error: `Unexpected smoke request: ${method} ${pathname}` } });
    }

    await route.fulfill({ status, json: { success: true, data } });
  });

  try {
    const response = await page.goto("/marketing", { waitUntil: "networkidle", timeout: 120_000 });
    assert.equal(response?.status(), 200, "/marketing should render successfully");
    await page.getByRole("row", { name: /Encontro de validação/ }).waitFor();
    await page.getByRole("button", { name: "Ver edições de Encontro de validação" }).click();
    const editionsDialog = page.getByRole("dialog", { name: /Edições · Encontro de validação/ });
    await editionsDialog.getByRole("row", { name: /Edição de setembro/ }).waitFor();
    await editionsDialog.getByRole("button", { name: "Editar edição Edição de setembro" }).click();
    await editionsDialog.getByLabel("Início", { exact: false }).fill("2026-09-21T09:00");
    await editionsDialog.getByLabel("Fim", { exact: false }).fill("2026-09-30T18:00");
    await editionsDialog.getByRole("button", { name: "Salvar edição" }).click();
    await editionsDialog.getByRole("button", { name: "Avaliar" }).waitFor();
    assert.equal(edition.feedbackPeriodStart, "2026-09-21T09:00:00.000Z");
    assert.equal(edition.feedbackPeriodEnd, "2026-09-30T18:00:00.000Z");

    await editionsDialog.getByRole("button", { name: "Avaliar" }).click();
    await editionsDialog.getByLabel("Nota (1 a 5").selectOption("4");
    await editionsDialog.getByLabel("Observação").fill(feedback.observation);
    await editionsDialog.getByRole("button", { name: "Salvar avaliação" }).click();
    await expect(editionsDialog.getByText("Avaliada: 4/5")).toBeVisible();
    await page.screenshot({ path: path.join(outputDirectory, "issue-1544-feedback-editions.png"), fullPage: true });

    await editionsDialog.getByRole("button", { name: "Relatório" }).click();
    const report = editionsDialog.locator("#marketing-event-edition-report");
    await expect(report.getByRole("heading", { name: "Edição de setembro" })).toBeVisible();
    await expect(report.getByRole("heading", { name: "Antes do evento · marketing e comunicação" })).toBeVisible();
    await expect(report.getByText("Locação")).toBeVisible();
    await expect(report.getByText("Fornecedor confirmado")).toBeVisible();
    await expect(report.getByText("Boa participação e organização.")).toBeVisible();
    await expect(report.getByText("21/09/2026, 09:00 – 30/09/2026, 18:00")).toBeVisible();
    await page.evaluate(() => {
      window.print = () => {};
      for (let element = document.querySelector("#marketing-event-edition-report"); element; element = element.parentElement) {
        element.scrollTop = element.scrollHeight;
      }
    });
    await report.getByRole("button", { name: "Imprimir relatório" }).evaluate((button) => button.click());
    await page.emulateMedia({ media: "print" });
    const printLayout = await page.evaluate(() => {
      const reportRoot = document.querySelector("#marketing-event-edition-report");
      const dialog = reportRoot?.closest('[role="dialog"]');
      const dialogBody = dialog?.querySelector(":scope > div");
      return {
        reportVisibility: reportRoot ? getComputedStyle(reportRoot).visibility : null,
        reportPosition: reportRoot ? getComputedStyle(reportRoot).position : null,
        reportTop: reportRoot?.getBoundingClientRect().top ?? null,
        reportWidth: reportRoot?.getBoundingClientRect().width ?? null,
        scrollContainers: (() => {
          const result = [];
          for (let element = reportRoot; element; element = element.parentElement) {
            if (element.scrollHeight > element.clientHeight) {
              result.push({ tag: element.tagName, id: element.id, scrollTop: element.scrollTop });
            }
          }
          return result;
        })(),
        dialogOverflow: dialog ? getComputedStyle(dialog).overflow : null,
        dialogBodyOverflow: dialogBody ? getComputedStyle(dialogBody).overflow : null,
        dialogBodyScrollTop: dialogBody ? dialogBody.scrollTop : null,
        dialogHeaderDisplay: dialog?.querySelector(":scope > header") ? getComputedStyle(dialog.querySelector(":scope > header")).display : null,
      };
    });
    const { scrollContainers, ...visiblePrintLayout } = printLayout;
    assert.deepEqual(visiblePrintLayout, {
      reportVisibility: "visible",
      reportPosition: "relative",
      reportTop: 0,
      reportWidth: 1440,
      dialogOverflow: "visible",
      dialogBodyOverflow: "visible",
      dialogBodyScrollTop: 0,
      dialogHeaderDisplay: "none",
    });
    assert.ok(scrollContainers.every(({ scrollTop }) => scrollTop === 0), "print layout must start at the top of every scroll container");
    await page.screenshot({ path: path.join(outputDirectory, "issue-1544-printable-edition-report.png"), fullPage: true });
    assert.ok(apiRequests.includes(`POST /marketing/events/${event.id}/editions/${edition.id}/feedback`));
    assert.ok(apiRequests.includes(`GET /marketing/events/${event.id}/editions/${edition.id}/report`));
    assert.deepEqual(apiRequests.filter((entry) => entry.startsWith("pageerror:")), []);
    console.log("PASS /marketing: período, avaliação única e relatório autorizado na UI");
    console.log("PASS relatório em media=print: conteúdo visível, chrome do diálogo oculto e sem recorte");
    console.log(`Screenshots: ${path.join(outputDirectory, "issue-1544-feedback-editions.png")}`);
    console.log(`            ${path.join(outputDirectory, "issue-1544-printable-edition-report.png")}`);
  } catch (error) {
    await page.screenshot({ path: path.join(outputDirectory, "issue-1544-feedback-editions-failure.png"), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "3121", "--hostname", "127.0.0.1"],
  { cwd: appRoot, env: browserSmokeEnv(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
let output = "";
server.stdout.on("data", (chunk) => { output += chunk; });
server.stderr.on("data", (chunk) => { output += chunk; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(output);
    try {
      if ((await fetch(`${baseUrl}/login`)).status < 500) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, `Next dev server did not start. Output: ${output}`);
  await run();
} finally {
  server.kill();
}
