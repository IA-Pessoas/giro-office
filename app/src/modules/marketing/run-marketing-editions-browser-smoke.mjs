import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";

import { browserSmokeEnv } from "../../shared/testing/browserSmokeEnv.mjs";

const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const baseUrl = process.env.MARKETING_EDITIONS_BASE_URL || "http://127.0.0.1:3121";
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
  birthdayMonth: "2026-10",
  requests: { active: { total: 0, rh: 0, ti: 0 }, new: { total: 0, rh: 0, ti: 0 }, urgent: { total: 0, rh: 0, ti: 0 } },
  birthdays: {
    clients: { total: 1, items: [{ id: "birthday-client", name: "Cliente PF", date: "01/10", day: 1 }] },
    employees: {
      total: 10,
      items: Array.from({ length: 10 }, (_, index) => ({
        id: `birthday-employee-${index + 1}`,
        name: `Colaborador ${String(index + 1).padStart(2, "0")}`,
        date: `${String(index + 1).padStart(2, "0")}/10`,
        day: index + 1,
        department: "RH",
      })),
    },
    companies: { total: 0, items: [] },
  },
  aiUsage: { competence: "2026-10", pendingKnowledge: 0 },
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
  modules: { marketing: process.env.MARKETING_DEPARTMENTS_ONLY === "1" ? 3 : 2 },
};
const dashboardMonthRequests = [];
let department = {
  id: "marketing-departments-dep",
  name: "Operações",
  color: "#2563eb",
  status: "Ativo",
  solution: false,
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
  page.on("console", (message) => {
    if (message.type() === "error") apiRequests.push(`console:${message.text()}`);
  });
  await page.route("**/socket.io/**", (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "ok" }));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname.replace(/^\/api/, "");
    const method = request.method();
    let data = [];
    let status = 200;
    apiRequests.push(`${method} ${pathname}${url.search}`);

    if (pathname.endsWith("/user/me")) data = user;
    else if (pathname.endsWith("/department/list")) data = [department];
    else if (pathname.endsWith("/department") && method === "PUT") {
      const payload = request.postDataJSON();
      assert.deepEqual(Object.keys(payload).sort(), ["color", "dep_id"]);
      assert.equal(payload.dep_id, department.id);
      assert.equal(request.headers()["x-csrf-token"], "M".repeat(43));
      department = { ...department, color: payload.color };
      data = department;
    } else if (pathname.endsWith("/marketing/dashboard")) {
      const month = url.searchParams.get("month");
      dashboardMonthRequests.push(month);
      const monthNumber = month?.slice(5) ?? dashboard.birthdayMonth.slice(5);
      const formatDate = (item) => `${String(item.day).padStart(2, "0")}/${monthNumber}`;
      data = {
        ...dashboard,
        birthdayMonth: month ?? dashboard.birthdayMonth,
        birthdays: {
          ...dashboard.birthdays,
          clients: { ...dashboard.birthdays.clients, items: dashboard.birthdays.clients.items.map((item) => ({ ...item, date: formatDate(item) })) },
          employees: { ...dashboard.birthdays.employees, items: dashboard.birthdays.employees.items.map((item) => ({ ...item, date: formatDate(item) })) },
        },
      };
    }
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
    const birthdaySection = page.locator("#marketing-birthday-report");
    await expect(page.getByText("Cliente PF", { exact: true })).toBeVisible();
    await expect(page.getByText(/Colaborador 10/)).toBeVisible();
    await expect(birthdaySection.getByRole("listitem")).toHaveCount(11);
    await page.getByLabel("Mês dos aniversários").fill("2024-02");
    await expect.poll(() => dashboardMonthRequests.at(-1)).toBe("2024-02");
    await expect(page.getByText("fevereiro de 2024", { exact: true })).toBeVisible();
    await expect(birthdaySection.getByText("01/02", { exact: true })).toHaveCount(2);
    const csvDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar CSV" }).click();
    assert.equal((await csvDownload).suggestedFilename(), "aniversarios-2024-02.csv");
    await birthdaySection.screenshot({ path: path.join(outputDirectory, "issue-1676-marketing-birthdays.png") });
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("heading", { name: "Solicitações existentes" })).not.toBeVisible();
    await birthdaySection.screenshot({ path: path.join(outputDirectory, "issue-1676-marketing-birthdays-print.png") });
    await page.emulateMedia({ media: "screen" });
    const departments = page.getByRole("region", { name: "Departamentos da organização" });
    await expect(departments.getByText("Operações", { exact: true })).toBeVisible();
    if (process.env.MARKETING_DEPARTMENTS_ONLY === "1") {
      await departments.getByRole("button", { name: "Selecionar cor Verde" }).click();
      await departments.getByRole("button", { name: "Salvar cor" }).click();
      await expect(departments.getByText("Cor salva.")).toBeVisible();
      assert.equal(department.color, "#059669");
    } else {
      await expect(departments.getByText("Cor: #2563eb")).toBeVisible();
      await expect(departments.getByRole("button", { name: "Salvar cor" })).toHaveCount(0);
    }
    await departments.screenshot({ path: path.join(outputDirectory, "issue-1675-marketing-departments.png") });
    if (process.env.MARKETING_DEPARTMENTS_ONLY === "1") {
      assert.deepEqual(apiRequests.filter((entry) => entry.startsWith("pageerror:")), []);
      assert.ok(apiRequests.includes("GET /department/list"));
      assert.ok(apiRequests.includes("GET /department/list?marketing=true"));
      console.log("PASS departamentos Marketing: listagem scoped e atualização exclusiva de cor");
      console.log(`Screenshot: ${path.join(outputDirectory, "issue-1675-marketing-departments.png")}`);
      return;
    }
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
    assert.ok(apiRequests.includes("GET /department/list"));
    assert.ok(apiRequests.some((entry) => entry.startsWith("GET /department/list?marketing=true")));
    console.log("PASS /marketing: departamentos no escopo da organização e edição isolada da cor");
    console.log("PASS /marketing: período, avaliação única e relatório autorizado na UI");
    console.log("PASS relatório em media=print: conteúdo visível, chrome do diálogo oculto e sem recorte");
    console.log(`Screenshots: ${path.join(outputDirectory, "issue-1675-marketing-departments.png")}`);
    console.log(`            ${path.join(outputDirectory, "issue-1544-feedback-editions.png")}`);
    console.log(`            ${path.join(outputDirectory, "issue-1544-printable-edition-report.png")}`);
  } catch (error) {
    console.error(apiRequests.filter((entry) => entry.startsWith("pageerror:") || entry.startsWith("console:")));
    await page.screenshot({ path: path.join(outputDirectory, "issue-1544-feedback-editions-failure.png"), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

if (process.env.MARKETING_EDITIONS_EXTERNAL_SERVER === "1") {
  await run();
} else {
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
}
