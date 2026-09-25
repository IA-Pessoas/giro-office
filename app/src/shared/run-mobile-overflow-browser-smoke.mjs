import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

import { chromium } from "@playwright/test";

// #1372: roteiro principal em celular (375×812) e tablet (768×1024), contra um app já no ar
// (`next start`), com a API mockada por dados realistas (nomes e e-mails longos, listas
// paginadas). Grava prints e falha se:
//   - a página rolar na horizontal (documento mais largo que a janela); ou
//   - algum conteúdo passar da borda direita dentro de um contêiner que corta sem rolar
//     (overflow-x hidden/clip), ou seja, texto/botão cortado em silêncio.
//
// Como rodar (a partir da raiz do repositório):
//   1. NEXT_PUBLIC_API_URL=/api pnpm --dir app run build
//   2. NEXT_PUBLIC_API_URL=/api API_INTERNAL_URL=http://127.0.0.1:9 \
//        pnpm --dir app exec next start -p 5177 -H 127.0.0.1
//   3. pnpm --dir app run test:mobile-overflow
// Variáveis: MOBILE_SMOKE_BASE_URL (padrão http://127.0.0.1:5177) e MOBILE_SMOKE_EVIDENCE_DIR
// (pasta dos prints; padrão output/playwright/mobile-1372, relativa ao diretório atual).
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

const LONG_COMPANY = "Castelo Contabilidade, Consultoria e Assessoria Empresarial de Longa Denominação Ltda";
const LONG_EMAIL = "departamento.financeiro.e.contabilidade@castelocontabilidadeconsultoriaeassessoria.com.br";

const smokeUser = {
  id: "user-mobile-smoke",
  name: "Maria Aparecida dos Santos Figueiredo de Albuquerque",
  login: LONG_EMAIL,
  permission: 3,
  organization_id: "org-smoke",
  department_id: "department-smoke",
  status: "Ativo",
  version: 1,
  type: "owner",
  modules: Object.fromEntries(MODULE_KEYS.map((moduleKey) => [moduleKey, 3])),
};

const clientRows = Array.from({ length: 57 }, (_, index) => {
  const long = index % 3 === 0;
  const suffix = String(index + 1).padStart(2, "0");
  return {
    id: index === 0 ? "client-mobile-smoke" : `client-mobile-smoke-${suffix}`,
    dominio_code: `10${suffix}`,
    name: long ? `${LONG_COMPANY} ${suffix}` : `Cliente ${suffix} Comércio`,
    company_name: long ? `${LONG_COMPANY} — Filial ${suffix}` : `Cliente ${suffix} Comércio Ltda`,
    fantasy_name: long ? "Castelo Assessoria Empresarial Integrada" : `Cliente ${suffix}`,
    cpf_cnpj: `11222333000${String(100 + index).slice(-3)}`,
    status: ["Ativo", "Prospect", "Inativo", "Fechado"][index % 4],
    type: "PJ",
    email: LONG_EMAIL,
  };
});
const smokeClient = {
  ...clientRows[0],
  responsible: "Maria Aparecida dos Santos Figueiredo de Albuquerque",
  number: "(11) 98765-4321",
  address: "Avenida Brigadeiro Faria Lima, 3477, Torre Norte, Conjunto 142",
  neighborhood: "Itaim Bibi",
  city: "São Paulo",
  state: "SP",
  cep: "04538-133",
};

const taskRows = Array.from({ length: 8 }, (_, index) => ({
  id: `task-mobile-${index + 1}`,
  isOwn: index % 2 === 0,
  isUnassigned: index % 2 === 1,
  name:
    index % 2 === 0
      ? "Conferência da apuração mensal de impostos federais e obrigações acessórias do período"
      : `Tarefa ${index + 1}`,
  client_name: `${LONG_COMPANY} ${index + 1}`,
  project_name: "Projeto de migração contábil e fiscal da carteira de clientes 2026",
  status: ["Em Andamento", "Pendente", "Concluída"][index % 3],
  billing: "Não Realizar",
  charge_comercial: false,
  charge_financeiro: false,
  hiring_status: null,
  payment: null,
  billing_description: null,
}));

const certificateBase = {
  client_castelo_status: true,
  client_focus_status: false,
  model: "A1",
  expiration_date: "2026-12-31",
  notes: "Renovar com antecedência; cliente pede contato por e-mail e confirmação por telefone.",
  was_paid: false,
  payment_date: null,
  payment_amount: null,
  contact_info: LONG_EMAIL,
  has_certificate: true,
  organization_id: "org-smoke",
};
const certificatesPj = Array.from({ length: 6 }, (_, index) => ({
  ...certificateBase,
  id: `cert-pj-${index + 1}`,
  name: `${LONG_COMPANY} ${index + 1}`,
  cnpj: `11.222.333/0001-${String(10 + index)}`,
  responsible: "Maria Aparecida dos Santos Figueiredo de Albuquerque",
  legal_nature: "Sociedade Empresária Limitada",
}));
const certificatesPf = Array.from({ length: 6 }, (_, index) => ({
  ...certificateBase,
  id: `cert-pf-${index + 1}`,
  name: `José Roberto de Oliveira Figueiredo Albuquerque Neto ${index + 1}`,
  cpf: `123.456.789-0${index}`,
  enterprise: LONG_COMPANY,
  cnpj: "11.222.333/0001-81",
}));

const dashboardStats = {
  updatedAt: "2026-09-24T12:00:00.000Z",
  totalClients: clientRows.length,
  clientsByService: { contabil: 40, fiscal: 10, pessoal: 5, infoproduto: 1, consultoria: 1, castelo_med: 0 },
  monthlyTrends: [
    { month: "2026-07", newClients: 4 },
    { month: "2026-08", newClients: 7 },
    { month: "2026-09", newClients: 3 },
  ],
  financial: { paidCertificateReceipts: 0, unpaidCertificates: 0, monthlyPaidCertificateReceipts: [] },
  commercial: {
    activeProspects: 0,
    closedThisMonth: 0,
    byStatus: [],
    billing: { pending: 0, contracted: 0, notContracted: 0 },
  },
  departments: [
    { id: "dep-1", name: "Contábil", openTasks: 3, completedTasks: 1, urgentTasks: 1 },
    { id: "dep-2", name: "Departamento Pessoal e Recursos Humanos", openTasks: 12, completedTasks: 40, urgentTasks: 2 },
  ],
  recentClients: clientRows.slice(0, 5).map((client) => ({
    id: client.id,
    name: client.company_name,
    status: client.status,
    segmento: "Contábil",
    entryDate: "2026-09-01",
  })),
  insights: [],
  tasks: { today: 2, completedToday: 1, pending: 3, urgent: 1 },
  notifications: { total: 1, urgent: 1, pending: 0 },
  projects: { active: 1, completed: 0, inProgress: 1, delayed: 0, waiting: 0 },
  performance: [],
  pendingTasks: [],
  activities: [],
};

function mockData(url) {
  const pathname = url.pathname.replace(/^\/api/, "");
  if (pathname.endsWith("/user/me")) return smokeUser;
  if (pathname.endsWith("/dashboard/stats")) return dashboardStats;
  if (pathname.endsWith("/client/list")) {
    const page = Number(url.searchParams.get("page")) || 1;
    const pageSize = Number(url.searchParams.get("limit")) || 20;
    const items = clientRows.slice((page - 1) * pageSize, page * pageSize);
    return { items, total: clientRows.length, page, pageSize, hasMore: page * pageSize < clientRows.length };
  }
  if (/\/client\/client-mobile-smoke[^/]*$/.test(pathname)) return smokeClient;
  if (pathname.endsWith("/task/list")) {
    return { data: taskRows, total: 30, hasMore: true, summary: { inProgress: 12, billable: 3 } };
  }
  if (pathname.endsWith("/certificate/pj/list")) return certificatesPj;
  if (pathname.endsWith("/certificate/pf/list")) return certificatesPf;
  if (pathname.endsWith("/project/list")) {
    return [{ id: "project-one", name: "Projeto de migração contábil e fiscal da carteira de clientes 2026" }];
  }
  if (pathname.endsWith("/department/list")) {
    return [{ id: "department-smoke", name: "Departamento Pessoal e Recursos Humanos", status: "Ativo" }];
  }
  return [];
}

// Os dois tamanhos emulam aparelho de toque (isMobile + hasTouch), como os descritores de
// iPhone/iPad do Playwright. Com isMobile o Chromium respeita a meta viewport e pode alargar a
// viewport de layout (window.innerWidth) quando o conteúdo estoura; por isso a comparação é
// sempre contra a largura fixa abaixo, nunca contra innerWidth.
const VIEWPORTS = [
  { name: "celular", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
];

const byHeading = (name) => (page) => page.getByRole("heading", { level: 1, name });

const SCREENS = [
  {
    name: "login",
    path: "/login",
    authenticated: false,
    ready: (page) => page.getByRole("button", { name: "Entrar no Office" }),
  },
  {
    name: "dashboard",
    path: "/dashboard",
    ready: byHeading("Dashboard"),
    // Menu lateral aberto pelo botão hambúrguer (só existe abaixo de lg).
    states: [
      {
        name: "menu-aberto",
        open: async (page) => {
          await page.getByRole("button", { name: "Abrir menu" }).click();
          const sidebar = page.locator("aside").first();
          await page.waitForFunction(() => document.querySelector("aside")?.getBoundingClientRect().left === 0);
          return sidebar;
        },
      },
    ],
  },
  {
    name: "clientes",
    path: "/clients",
    ready: byHeading("Clientes"),
    states: [
      {
        name: "novo-cliente",
        open: async (page) => {
          await page.getByRole("button", { name: "Novo cliente" }).click();
          return page.getByRole("dialog", { name: "Cadastrar novo cliente" });
        },
      },
    ],
  },
  { name: "cliente-detalhe", path: `/clients/${smokeClient.id}`, ready: byHeading(smokeClient.name) },
  {
    name: "tarefas",
    path: `/tasks?clientId=${smokeClient.id}`,
    ready: byHeading("Tarefas"),
    states: [
      {
        name: "nova-tarefa",
        open: async (page) => {
          const button = page.getByRole("button", { name: "Nova tarefa" });
          await button.and(page.locator(":enabled")).waitFor();
          await button.click();
          return page.getByRole("dialog", { name: "Nova tarefa" });
        },
      },
    ],
  },
  { name: "certificados", path: "/certificados", ready: byHeading("Certificados") },
];

// Roda no navegador. `viewportWidth` é a largura fixa do contexto.
function measureOverflow(viewportWidth) {
  const docWidth = document.documentElement.scrollWidth;
  const describe = (element) => {
    const className = typeof element.className === "string" ? element.className : "";
    const text = (element.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const classes = className.split(" ").filter(Boolean).slice(0, 4).join(".");
    return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}${text ? ` "${text}"` : ""} (${Math.round(element.getBoundingClientRect().right)}px)`;
  };

  const pageOffenders = [];
  const clipped = [];
  for (const element of document.querySelectorAll("body *")) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0) continue;

    // Contêiner mais próximo que mexe no overflow horizontal. Elemento absolute escapa de
    // ancestrais que não são o seu bloco de contenção, por isso a busca segue offsetParent.
    // ponytail: fixed dentro de ancestral com transform não é tratado; refinar se der falso positivo.
    let clipper = null;
    const position = getComputedStyle(element).position;
    if (position !== "fixed") {
      const containing = position === "absolute" ? element.offsetParent : null;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (containing && parent !== containing && !parent.contains(containing)) continue;
        if (getComputedStyle(parent).overflowX !== "visible") {
          clipper = parent;
          break;
        }
      }
    }
    // Pai já reportado: reporta só o elemento mais externo.
    const alreadyReported = () => [...pageOffenders, ...clipped].some((offender) => offender.contains(element));

    if (!clipper) {
      // Sem contêiner que corte: passar da janela alarga o documento (mesmo invisível ou fora da tela).
      if (rect.right > viewportWidth + 1 && !alreadyReported()) pageOffenders.push(element);
      continue;
    }

    // Borda visível do contêiner (nunca além da janela).
    const clipperRect = clipper.getBoundingClientRect();
    const visibleRight = Math.min(clipperRect.right, viewportWidth);
    if (rect.right <= visibleRight + 1) continue;

    // Rolagem horizontal intencional (tabela em overflow-x-auto): ok. Já um corpo de diálogo com
    // só overflow-y-auto também computa overflow-x "auto", mas ninguém espera rolar para o lado
    // ali; então só aceita rolagem quando a classe pede o eixo x (ou ambos) ou dentro de tabela.
    // ponytail: depende das classes Tailwind; contêiner com overflow via CSS próprio cai como corte.
    const overflowX = getComputedStyle(clipper).overflowX;
    const scrollsOnPurpose =
      /(auto|scroll)/.test(overflowX) &&
      (element.closest("table") !== null ||
        /(^|\s)overflow-(x-)?(auto|scroll)(\s|$)/.test(typeof clipper.className === "string" ? clipper.className : ""));
    if (scrollsOnPurpose) continue;

    // Daqui para baixo, só vale como "cortado" o que o usuário deveria ver.
    // Área 1×1 (sr-only) não é conteúdo visível.
    if (rect.width <= 1 || rect.height <= 1) continue;
    // Totalmente fora da tela ou do contêiner = escondido de propósito (sidebar com
    // -translate-x-full, drawer fechado, slide fora do carrossel).
    if (rect.left >= visibleRight || rect.right <= Math.max(clipperRect.left, 0)) continue;
    // Invisível por display/visibility/opacity no próprio elemento ou em ancestral.
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    // Enfeite sem texto nem mídia (bolhas de fundo do login) pode ser cortado de propósito.
    const hasContent =
      (element.innerText || "").trim() !== "" ||
      element.matches("img, video, canvas, input, select, textarea, button, a");
    if (!hasContent || alreadyReported()) continue;
    clipped.push(element);
  }

  return {
    docWidth,
    pageOffenders: pageOffenders.slice(0, 5).map(describe),
    clipped: clipped.slice(0, 5).map(describe),
  };
}

// Espera animações/transições CSS (Radix, sidebar) terminarem, sem timeout fixo.
async function settle(locator) {
  await locator.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {}))),
  );
}

async function check(page, viewport, label, shot, failures, fullPage = true) {
  const result = await page.evaluate(measureOverflow, viewport.width);
  await page.screenshot({ path: shot, fullPage });
  const problems = [];
  if (result.docWidth > viewport.width + 1) {
    problems.push(`página com ${result.docWidth}px numa janela de ${viewport.width}px — ${result.pageOffenders.join(", ")}`);
  }
  if (result.clipped.length > 0) {
    problems.push(`conteúdo cortado sem rolagem horizontal — ${result.clipped.join(", ")}`);
  }
  if (problems.length > 0) {
    for (const problem of problems) failures.push(`${label}: ${problem}`);
    console.log(`FAIL ${label}: ${problems.join(" | ")} (print: ${shot})`);
  } else {
    console.log(`PASS ${label}: sem scroll horizontal nem corte (print: ${shot})`);
  }
}

mkdirSync(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  for (const viewport of VIEWPORTS) {
    for (const screen of SCREENS) {
      const authenticated = screen.authenticated !== false;
      const context = await browser.newContext({
        baseURL: baseUrl,
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: true,
        hasTouch: true,
      });
      try {
        if (authenticated) {
          await context.addCookies([
            { name: "cw.session", value: "opaque-test-session", url: baseUrl, httpOnly: true, sameSite: "Lax" },
          ]);
        }
        const page = await context.newPage();
        await page.route("**/api/**", async (route) => {
          const url = new URL(route.request().url());
          if (!authenticated && url.pathname.endsWith("/me")) {
            await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true, data: mockData(url) }),
          });
        });
        await page.route("**/socket.io/**", async (route) => {
          await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
        });

        await page.goto(screen.path, { waitUntil: "networkidle", timeout: 120_000 });
        await screen.ready(page).waitFor({ timeout: 30_000 });
        await page.waitForLoadState("networkidle");

        const prefix = `${evidenceDir}/${viewport.name}-${viewport.width}x${viewport.height}-${screen.name}`;
        const label = `${screen.name} em ${viewport.width}×${viewport.height}`;
        await check(page, viewport, label, `${prefix}.png`, failures);

        // Estados interativos só no celular, onde menu e diálogos mais apertam. Print só da janela:
        // menu e diálogos são fixed e somem num print de página inteira.
        if (viewport.name !== "celular") continue;
        for (const state of screen.states ?? []) {
          const target = await state.open(page);
          await target.waitFor();
          await settle(target);
          await page.waitForLoadState("networkidle");
          await check(page, viewport, `${label} [${state.name}]`, `${prefix}-${state.name}.png`, failures, false);
          await page.keyboard.press("Escape");
        }
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

assert.deepEqual(failures, [], "Telas com scroll horizontal ou conteúdo cortado.");
