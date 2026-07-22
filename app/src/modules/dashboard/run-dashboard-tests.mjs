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
