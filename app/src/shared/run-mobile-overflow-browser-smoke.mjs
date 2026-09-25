import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

import { chromium } from "@playwright/test";

// #1372: roteiro principal em celular (375×812) e tablet (768×1024), contra um app já no ar
// (`next start`), com a API mockada. Grava prints e falha se a página rolar na horizontal.
const baseUrl = process.env.MOBILE_SMOKE_BASE_URL || "http://127.0.0.1:5177";
const evidenceDir = process.env.MOBILE_SMOKE_EVIDENCE_DIR || "output/playwright/mobile-1372";

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
  id: "user-mobile-smoke",
  name: "Mobile Smoke",
  login: "mobile.smoke@castelo.test",
  permission: 3,
  organization_id: "org-smoke",
  department_id: "department-smoke",
  status: "Ativo",
  version: 1,
  type: "owner",
  modules: Object.fromEntries(MODULE_KEYS.map((moduleKey) => [moduleKey, 3])),
};

const smokeClient = {
  id: "client-mobile-smoke",
  name: "Castelo Contabilidade de Teste",
  company_name: "Castelo Contabilidade de Teste Ltda",
  cpf_cnpj: "11.222.333/0001-81",
  status: "Ativo",
  type: "PJ",
};

const dashboardStats = {
  updatedAt: "2026-09-24T12:00:00.000Z",
  totalClients: 1,
  clientsByService: { contabil: 1, fiscal: 0, pessoal: 0, infoproduto: 0, consultoria: 0, castelo_med: 0 },
  monthlyTrends: [{ month: "2026-09", newClients: 1 }],
  financial: { paidCertificateReceipts: 0, unpaidCertificates: 0, monthlyPaidCertificateReceipts: [] },
  commercial: {
    activeProspects: 0,
    closedThisMonth: 0,
    byStatus: [],
    billing: { pending: 0, contracted: 0, notContracted: 0 },
  },
  departments: [{ id: "dep-1", name: "Contábil", openTasks: 3, completedTasks: 1, urgentTasks: 1 }],
  recentClients: [
    {
      id: smokeClient.id,
      name: smokeClient.company_name,
      status: "Ativo",
      segmento: "Contábil",
      entryDate: "2026-09-01",
    },
  ],
  insights: [],
  tasks: { today: 2, completedToday: 1, pending: 3, urgent: 1 },
  notifications: { total: 1, urgent: 1, pending: 0 },
  projects: { active: 1, completed: 0, inProgress: 1, delayed: 0, waiting: 0 },
  performance: [],
  pendingTasks: [],
  activities: [],
};

function mockData(pathname) {
  if (pathname.endsWith("/user/me")) return smokeUser;
  if (pathname.endsWith("/dashboard/stats")) return dashboardStats;
  if (pathname.endsWith(`/client/${smokeClient.id}`)) return smokeClient;
  if (pathname.endsWith("/client/list")) {
    return { items: [smokeClient], total: 1, page: 1, pageSize: 50, hasMore: false };
  }
  if (pathname.endsWith("/task/list")) {
    return { data: [], total: 0, hasMore: false, summary: { inProgress: 0, billable: 0 } };
  }
  return [];
}

const VIEWPORTS = [
  { name: "celular", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
];

const SCREENS = [
  { name: "login", path: "/login", authenticated: false },
  { name: "dashboard", path: "/dashboard", authenticated: true },
  { name: "clientes", path: "/clients", authenticated: true },
  { name: "cliente-detalhe", path: `/clients/${smokeClient.id}`, authenticated: true },
  { name: "tarefas", path: `/tasks?clientId=${smokeClient.id}`, authenticated: true },
  { name: "certificados", path: "/certificados", authenticated: true },
];

mkdirSync(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  for (const viewport of VIEWPORTS) {
    for (const screen of SCREENS) {
      const context = await browser.newContext({
        baseURL: baseUrl,
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.name === "celular",
        hasTouch: true,
      });
      try {
        if (screen.authenticated) {
          await context.addCookies([
            { name: "cw.session", value: "opaque-test-session", url: baseUrl, httpOnly: true, sameSite: "Lax" },
          ]);
        }
        const page = await context.newPage();
        await page.route("**/api/**", async (route) => {
          const pathname = new URL(route.request().url()).pathname.replace(/^\/api/, "");
          if (!screen.authenticated && pathname.endsWith("/me")) {
            await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true, data: mockData(pathname) }),
          });
        });
        await page.route("**/socket.io/**", async (route) => {
          await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
        });

        await page.goto(screen.path, { waitUntil: "networkidle", timeout: 120_000 });
        await page.waitForTimeout(800);

        // Scroll horizontal da página: o documento mais largo que a janela. Elementos que rolam
        // por dentro (tabelas com overflow-x-auto) não contam, só a página em si.
        const overflow = await page.evaluate(() => {
          const width = window.innerWidth;
          const docWidth = document.documentElement.scrollWidth;
          const offenders = [...document.querySelectorAll("body *")]
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              if (rect.width === 0 || rect.right <= width + 1) return false;
              // Ignora o que está dentro de um contêiner que rola na horizontal.
              for (let parent = element.parentElement; parent; parent = parent.parentElement) {
                const style = getComputedStyle(parent);
                if (/(auto|scroll|hidden)/.test(style.overflowX)) return false;
              }
              return true;
            })
            .slice(0, 5)
            .map((element) => {
              const className = typeof element.className === "string" ? element.className : "";
              return `${element.tagName.toLowerCase()}.${className.split(" ").slice(0, 4).join(".")} (${Math.round(element.getBoundingClientRect().right)}px)`;
            });
          return { width, docWidth, offenders };
        });

        const shot = `${evidenceDir}/${viewport.name}-${viewport.width}x${viewport.height}-${screen.name}.png`;
        await page.screenshot({ path: shot, fullPage: true });

        const label = `${screen.name} em ${viewport.width}×${viewport.height}`;
        if (overflow.docWidth > overflow.width + 1) {
          failures.push(`${label}: página com ${overflow.docWidth}px numa janela de ${overflow.width}px — ${overflow.offenders.join(", ")}`);
          console.log(`FAIL ${label}: scroll horizontal (${overflow.docWidth}px > ${overflow.width}px)`);
        } else {
          console.log(`PASS ${label}: sem scroll horizontal (print: ${shot})`);
        }
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

assert.deepEqual(failures, [], "Telas com scroll horizontal na página.");
