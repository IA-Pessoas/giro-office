import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function readOptional(path) {
  try {
    return read(path);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const dashboardComponent = read("../../shared/components/newLayout/Dashboard.tsx");
const dashboardService = read("./services/dashboardService.ts");
const dashboardHook = read("./hooks/useDashboard.ts");
const dashboardTypes = read("./types/index.ts");
const activityTimeSource = readOptional("./utils/activityTime.ts");
const activityClockSource = readOptional("./hooks/useActivityClock.ts");
const appShell = read("../../pages/_app.tsx");
const activityTimeModule = activityTimeSource ? await import("./utils/activityTime.ts") : null;

runTest("new layout dashboard consumes the real dashboard hook", () => {
  assert.match(dashboardComponent, /useDashboard/);
  assert.doesNotMatch(dashboardComponent, /const\s+activities\s*=\s*\[/);
  assert.doesNotMatch(dashboardComponent, /const\s+tasks\s*=\s*\[/);
  assert.doesNotMatch(dashboardComponent, /const\s+revenueData\s*=\s*\[/);
  assert.doesNotMatch(dashboardComponent, /const\s+projectsData\s*=\s*\[/);
  assert.doesNotMatch(dashboardComponent, /const\s+performanceData\s*=\s*\[/);
});

runTest("dashboard service only uses the real stats endpoint", () => {
  assert.match(dashboardService, /api\.get\(["']\/dashboard\/stats["']\)/);
  assert.doesNotMatch(dashboardService, /getMockStats/);
  assert.doesNotMatch(dashboardService, /Dashboard API not available, using mock data/);
  assert.doesNotMatch(dashboardService, /Math\.random/);
});

runTest("dashboard hook keeps cached data isolated and refreshes it in the background", () => {
  assert.match(dashboardHook, /useQuery/);
  assert.match(dashboardHook, /interface\s+UseDashboardResult/);
  assert.match(dashboardHook, /useDashboard\s*=\s*\(\):\s*UseDashboardResult/);
  assert.match(dashboardHook, /refetch:\s*\(\)\s*=>\s*Promise<void>/);
  assert.match(
    dashboardHook,
    /user\?\.organization_id\s*\?\?\s*user\?\.id\s*\?\?\s*["']anonymous["']/,
  );
  assert.match(dashboardHook, /refetchInterval:\s*60_000/);
  assert.match(dashboardHook, /gcTime:\s*Infinity/);
  assert.match(dashboardHook, /stats:\s*query\.data\s*\?\?\s*null/);
  assert.doesNotMatch(dashboardHook, /useState|useEffect/);
});

runTest("dashboard distinguishes loading, retry and an empty activity feed", () => {
  assert.match(dashboardComponent, /Carregando dashboard/);
  assert.match(dashboardComponent, /Não foi possível carregar o dashboard/);
  assert.match(dashboardComponent, /Nenhum indicador disponível/);
  assert.match(dashboardComponent, /Carregando atividades/);
  assert.match(dashboardComponent, /Tentar novamente/);
  assert.match(dashboardComponent, /Nenhuma atividade recente/);
});

runTest("dashboard only renders recent activity for owners and platform super-admins", () => {
  assert.match(dashboardComponent, /isOrganizationOwner\(user\)/);
  assert.match(
    dashboardComponent,
    /user\?\.auth_kind === "platform" && user\.platform_role === "super_admin"/,
  );
  const cardStart = dashboardComponent.indexOf("{canViewRecentActivity ? (");
  const cardEnd = dashboardComponent.indexOf("Ações Rápidas", cardStart);
  assert.ok(cardStart >= 0 && cardEnd > cardStart);
  const gatedCard = dashboardComponent.slice(cardStart, cardEnd);
  assert.match(gatedCard, /Atividade Recente/);
  assert.match(gatedCard, /\) : null\}/);
});

runTest("dashboard documents real financial, commercial and department indicators", () => {
  assert.match(dashboardTypes, /paidCertificateReceipts/);
  assert.match(dashboardTypes, /activeProspects/);
  assert.match(dashboardTypes, /DashboardDepartmentSummary/);
  assert.match(dashboardComponent, /Recebimentos de certificados/);
  assert.match(dashboardComponent, /Pipeline comercial/);
  assert.match(dashboardComponent, /Indicadores por departamento/);
  assert.doesNotMatch(dashboardComponent, /Receitas vs Despesas/);
});

runTest("dashboard derives activity time from createdAt and a local clock", () => {
  assert.match(dashboardTypes, /createdAt:\s*string\s*\|\s*null/);
  assert.match(dashboardComponent, /formatActivityTime/);
  assert.match(dashboardComponent, /useActivityClock/);
  assert.match(dashboardComponent, /activity\.createdAt/);
  assert.doesNotMatch(dashboardComponent, /activity\.time/);
  assert.match(activityClockSource, /30_000/);
  assert.match(activityClockSource, /clearInterval/);
});

runTest("activity time formatter advances deterministically", () => {
  assert.ok(activityTimeModule);
  const now = new Date("2026-07-23T12:00:00.000Z").getTime();
  const { formatActivityTime } = activityTimeModule;

  assert.equal(formatActivityTime("2026-07-23T11:59:30.000Z", now), "agora");
  assert.equal(formatActivityTime("2026-07-23T11:55:00.000Z", now), "há 5 min");
  assert.equal(formatActivityTime("2026-07-23T10:00:00.000Z", now), "há 2 horas");
  assert.equal(formatActivityTime("2026-07-21T12:00:00.000Z", now), "há 2 dias");
  assert.equal(formatActivityTime("invalid", now), "agora");
  assert.equal(formatActivityTime("2026-07-23T12:01:00.000Z", now), "agora");
});

runTest("authenticated app shell does not mount legacy chat globally", () => {
  assert.doesNotMatch(appShell, /ChatProvider/);
  assert.doesNotMatch(appShell, /ChatControllerUI/);
});


runTest("dashboard last update shows when the data was fetched, in pt-BR 24h", () => {
  // #1371: o updatedAt do servidor é o último dado alterado e parecia painel desatualizado.
  assert.match(dashboardHook, /fetchedAt:\s*query\.dataUpdatedAt/);
  assert.match(dashboardComponent, /formatDateTime\(fetchedAt \? new Date\(fetchedAt\) : null, "Sem atualização"\)/);
  assert.doesNotMatch(dashboardComponent, /stats\?\.updatedAt/);
  assert.doesNotMatch(dashboardComponent, /const\s+now\s*=\s*new Date\(\)/);
});

runTest("dashboard charts render the loaded values without an entry animation", () => {
  const series = dashboardComponent.match(/<(Area|Bar|Pie)\s[^>]*>/gs) ?? [];
  assert.ok(series.length >= 4);
  for (const element of series) {
    assert.match(element, /isAnimationActive=\{false\}/, element.slice(0, 60));
  }
});

runTest("dashboard charts show a message instead of an empty chart", () => {
  assert.match(dashboardComponent, /Sem dados no período\./);
  for (const flag of ["hasReceiptsData", "hasProjectsData", "hasPerformanceData"]) {
    assert.match(dashboardComponent, new RegExp(`\\{${flag} \\? \\(`), flag);
  }
});

runTest("dashboard hides the urgent notifications badge at zero", () => {
  assert.match(dashboardComponent, /\{notificationSummary\.urgent > 0 \? \(/);
});

runTest("dashboard lists only departments with data behind a show-all toggle", () => {
  assert.match(dashboardComponent, /departmentSummary\.filter\(hasTaskData\)/);
  assert.match(dashboardComponent, /Mostrar todos \(\$\{departmentSummary\.length\}\)/);
  assert.match(dashboardComponent, /visibleDepartments\.map/);
});

// #1369: resposta parcial ou fora do formato derrubava o dashboard; o erro remontava o app e
// todo o shell era buscado de novo, multiplicando as requisições.
const { normalizeDashboardStats } = await import("./services/dashboardStats.ts");

runTest("dashboard stats are normalized so a partial response cannot crash the page", () => {
  const fromArray = normalizeDashboardStats([]);
  assert.equal(fromArray.totalClients, 0);
  assert.deepEqual(fromArray.tasks, { today: 0, completedToday: 0, pending: 0, urgent: 0 });
  assert.deepEqual(fromArray.notifications, { total: 0, urgent: 0, pending: 0 });
  assert.deepEqual(fromArray.recentClients, []);
  assert.equal(fromArray.updatedAt, null);

  const partial = normalizeDashboardStats({ totalClients: 4, tasks: { today: 2 }, projects: null });
  assert.equal(partial.totalClients, 4);
  assert.deepEqual(partial.tasks, { today: 2, completedToday: 0, pending: 0, urgent: 0 });
  assert.deepEqual(partial.projects, { active: 0, completed: 0, inProgress: 0, delayed: 0, waiting: 0 });
  assert.deepEqual(partial.commercial.billing, { pending: 0, contracted: 0, notContracted: 0 });
  assert.deepEqual(partial.departments, []);
});

runTest("dashboard stats drop activities that are raw API routes (#1371)", () => {
  const activity = { user: "Ana", avatar: "A", tone: "blue", createdAt: null };
  const stats = normalizeDashboardStats({
    activities: [
      { ...activity, action: "acessou", item: "/user/me" },
      { ...activity, action: "/clients", item: "registro" },
      { ...activity, action: "cadastrou", item: "um novo cliente" },
      null,
    ],
  });
  assert.deepEqual(
    stats.activities.map((item) => `${item.action} ${item.item}`),
    ["cadastrou um novo cliente"],
  );
});

runTest("dashboard service normalizes the stats payload", () => {
  assert.match(dashboardService, /normalizeDashboardStats\(/);
});
