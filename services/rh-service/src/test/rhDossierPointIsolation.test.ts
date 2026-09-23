import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
const readAppSource = (path: string) =>
  readFileSync(resolve(repositoryRoot, "app/src", path), "utf8");

describe("isolamento entre Dossiê e ponto no portal RH", () => {
  it("monta Dossiê, dashboard e ponto apenas na aba correspondente", () => {
    const shell = readAppSource("shared/components/newLayout/RH.tsx");

    expect(shell).toMatch(/canViewRhDashboard && activeTab === "dashboard" \?\s*\(\s*<RhDashboardSection/);
    expect(shell).toMatch(/activeTab === "dossier" \? <RhDossierSection \/> : null/);
    expect(shell).toMatch(/activeTab === "point" \? <RhPointSection \/> : null/);
  });

  it("mantém queries de ponto/folha fora do componente, hook e serviço do Dossiê", () => {
    const sources = [
      ["componente", readAppSource("modules/rh/components/RhDossierSection.tsx")],
      ["hook", readAppSource("modules/rh/hooks/useRhProfile.ts")],
      ["serviço", readAppSource("modules/rh/services/rhProfileService.ts")],
    ] as const;

    for (const [name, source] of sources) {
      expect(source, name).not.toMatch(
        /useRhPoint|useRhTimeSheets|rhPointService|rhCalendarService|RH_ENDPOINTS\.(?:pointConfig|pointSummary|timeSheets)/,
      );
    }
  });

  it("reserva a mensagem de configuração ausente ao resumo da aba de ponto", () => {
    const point = readAppSource("modules/rh/components/RhPointSection.tsx");
    const pointSummary = readAppSource("modules/rh/components/RhPointSummaryCards.tsx");
    const dossier = readAppSource("modules/rh/components/RhDossierSection.tsx");
    const dashboard = readAppSource("modules/rh/components/RhDashboardSection.tsx");

    expect(point).toContain("useRhPointConfig(");
    expect(pointSummary).toContain("Cadastre a configuração de ponto para visualizar o resumo.");
    expect(dossier).not.toContain("Cadastre a configuração de ponto");
    expect(dashboard).not.toContain("Cadastre a configuração de ponto");
  });
});
