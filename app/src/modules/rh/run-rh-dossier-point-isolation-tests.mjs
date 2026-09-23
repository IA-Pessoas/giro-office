import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const shell = read("src/shared/components/newLayout/RH.tsx");
const dossier = read("src/modules/rh/components/RhDossierSection.tsx");
const dossierHook = read("src/modules/rh/hooks/useRhProfile.ts");
const dossierService = read("src/modules/rh/services/rhProfileService.ts");
const dashboard = read("src/modules/rh/components/RhDashboardSection.tsx");
const point = read("src/modules/rh/components/RhPointSection.tsx");
const pointSummary = read("src/modules/rh/components/RhPointSummaryCards.tsx");
const pointHook = read("src/modules/rh/hooks/useRhPoint.ts");
const calendarHook = read("src/modules/rh/hooks/useRhCalendar.ts");

assert.match(shell, /canViewRhDashboard && activeTab === "dashboard" \?\s*\(\s*<RhDashboardSection/);
assert.match(shell, /activeTab === "dossier" \? <RhDossierSection \/> : null/);
assert.match(shell, /activeTab === "point" \? <RhPointSection \/> : null/);

for (const [name, source] of [
  ["componente do dossiê", dossier],
  ["hook do dossiê", dossierHook],
  ["serviço do dossiê", dossierService],
]) {
  assert.doesNotMatch(
    source,
    /useRhPoint|useRhTimeSheets|rhPointService|rhCalendarService|RH_ENDPOINTS\.(?:pointConfig|pointSummary|timeSheets)/,
    `${name} não deve depender de consultas de ponto ou folha`,
  );
}

assert.match(point, /useRhPointConfig\(/);
assert.match(pointHook, /RH_POINT_QUERY_KEY/);
assert.match(calendarHook, /"calendar",\s*"timesheets"/);
assert.match(pointSummary, /Cadastre a configuração de ponto para visualizar o resumo\./);
assert.doesNotMatch(dossier, /Cadastre a configuração de ponto/);
assert.doesNotMatch(dashboard, /Cadastre a configuração de ponto/);

console.log("RH dossier point isolation: 3 checks passed");
