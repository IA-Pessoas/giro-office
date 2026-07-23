import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
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
const appShell = read("../../pages/_app.tsx");

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
  assert.match(dashboardComponent, /Carregando atividades/);
  assert.match(dashboardComponent, /Tentar novamente/);
  assert.match(dashboardComponent, /Nenhuma atividade recente/);
});

runTest("authenticated app shell does not mount legacy chat globally", () => {
  assert.doesNotMatch(appShell, /ChatProvider/);
  assert.doesNotMatch(appShell, /ChatControllerUI/);
});


runTest("dashboard last update uses the backend updatedAt timestamp", () => {
  assert.match(dashboardComponent, /stats\?\.updatedAt/);
  assert.doesNotMatch(dashboardComponent, /const\s+now\s*=\s*new Date\(\)/);
});


runTest("dashboard last update rejects future timestamps", () => {
  assert.match(dashboardComponent, /date\.getTime\(\) > Date\.now\(\)/);
  assert.match(dashboardComponent, /Sem atualização/);
});
