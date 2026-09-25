import assert from "node:assert/strict";

import { chromium } from "@playwright/test";

// Roda contra um app já no ar (`next start`), como o smoke do modal de certificados (#1369).
const baseUrl = process.env.SHELL_REQUESTS_SMOKE_BASE_URL || "http://127.0.0.1:5177";

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
  id: "user-shell-requests-smoke",
  name: "Shell Smoke",
  login: "shell.smoke@castelo.test",
  permission: 3,
  organization_id: "org-smoke",
  department_id: "department-smoke",
  status: "Ativo",
  version: 1,
  type: "owner",
  modules: Object.fromEntries(MODULE_KEYS.map((moduleKey) => [moduleKey, 3])),
};

const dashboardStats = {
  updatedAt: "2026-09-24T12:00:00.000Z",
  totalClients: 0,
  clientsByService: { contabil: 0, fiscal: 0, pessoal: 0, infoproduto: 0, consultoria: 0, castelo_med: 0 },
  monthlyTrends: [],
  financial: { paidCertificateReceipts: 0, unpaidCertificates: 0, monthlyPaidCertificateReceipts: [] },
  commercial: {
    activeProspects: 0,
    closedThisMonth: 0,
    byStatus: [],
    billing: { pending: 0, contracted: 0, notContracted: 0 },
  },
  departments: [],
  recentClients: [],
  insights: [],
  tasks: { today: 0, completedToday: 0, pending: 0, urgent: 0 },
  notifications: { total: 0, urgent: 0, pending: 0 },
  projects: { active: 0, completed: 0, inProgress: 0, delayed: 0, waiting: 0 },
  performance: [],
  pendingTasks: [],
  activities: [],
};

// Dados globais do shell: cada um no máximo uma vez por navegação.
const GLOBAL_ENDPOINTS = [
  "/user/me",
  "/task/notifications",
  "/rh/notifications",
  "/ti/requests/list",
  "/department/list",
];

function mockData(pathname, { malformedStats }) {
  if (pathname.endsWith("/user/me")) return smokeUser;
  // Resposta fora do formato derrubava o dashboard; o app remontava e o shell inteiro era
  // buscado de novo (a cascata de dezenas de chamadas vista em produção).
  if (pathname.endsWith("/dashboard/stats")) return malformedStats ? [] : dashboardStats;
  if (pathname.endsWith("/client/list")) {
    return { items: [], total: 0, page: 1, pageSize: 50, hasMore: false };
  }
  if (pathname.endsWith("/task/list")) {
    return { data: [], total: 0, hasMore: false, summary: { inProgress: 0, billable: 0 } };
  }
  return [];
}

const browser = await chromium.launch({ headless: true });

async function runScenario({ label, malformedStats }) {
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
  let requests = [];

  try {
    await context.addCookies([
      { name: "cw.session", value: "opaque-test-session", url: baseUrl, httpOnly: true, sameSite: "Lax" },
    ]);
    const page = await context.newPage();
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const pathname = url.pathname.replace(/^\/api/, "");
      requests.push(`${route.request().method()} ${pathname}`);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: mockData(pathname, { malformedStats }) }),
      });
    });
    await page.route("**/socket.io/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
    });

    async function measure(name, action) {
      requests = [];
      await action();
      await page.waitForLoadState("networkidle");
      // Folga para efeitos que disparam depois do primeiro paint.
      await page.waitForTimeout(1000);
      const counts = new Map();
      for (const request of requests) counts.set(request, (counts.get(request) ?? 0) + 1);
      const repeatedGlobals = [...counts]
        .filter(([request, count]) => count > 1 && GLOBAL_ENDPOINTS.some((endpoint) => request.endsWith(endpoint)))
        .map(([request, count]) => `${count}x ${request}`);
      assert.deepEqual(repeatedGlobals, [], `${name}: endpoint global chamado mais de uma vez.`);
      console.log(`PASS [${label}] ${name}: ${requests.length} requisições, nenhum endpoint global repetido`);
      return counts;
    }

    const sidebarLink = (name) => page.locator("aside").getByRole("link", { name, exact: true });

    const dashboard = await measure("dashboard (carga)", () =>
      page.goto("/dashboard", { waitUntil: "networkidle", timeout: 120_000 }),
    );
    assert.equal(dashboard.get("GET /user/me"), 1, "A sessão deve ser lida uma vez só na carga.");

    await measure("dashboard -> clientes", () => sidebarLink("Clientes").click());
    await measure("clientes -> projetos", () => sidebarLink("Projetos").click());
    await measure("projetos -> dashboard", () => sidebarLink("Dashboard").click());

    const administration = await measure("dashboard -> administração", () =>
      sidebarLink("Administração").click(),
    );
    assert.equal(
      administration.get("GET /user/me") ?? 0,
      0,
      "Administração usa a organização da sessão em vez de ler /user/me de novo.",
    );
  } finally {
    await context.close();
  }
}

try {
  await runScenario({ label: "stats ok", malformedStats: false });
  await runScenario({ label: "stats fora do formato", malformedStats: true });
} finally {
  await browser.close();
}
