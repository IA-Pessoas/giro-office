import { describe, expect, it, vi } from "vitest";

import type { ProjectWizardIntegration } from "../integrations/projectWizard.js";
import { ProjectWizardService } from "../services/projectWizardService.js";

const request = {
  userId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  organizationId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  integracaoLevel: 2 as const,
  idempotencyKey: "wizard-open-1",
  client_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  name: "Novo projeto",
  start_date: new Date("2026-09-01T00:00:00.000Z"),
  objective: "Objetivo do projeto",
};

describe("ProjectWizardService", () => {
  it("cria projeto e retorna contadores zerados", async () => {
    const integration: ProjectWizardIntegration = {
      createProject: vi.fn(async () => ({ id: "project-1", name: "Novo projeto" })),
    };

    const result = await new ProjectWizardService(integration).create(request);

    expect(integration.createProject).toHaveBeenCalledWith(request);
    expect(result).toEqual({
      project: { id: "project-1", name: "Novo projeto" },
      counters: { main: 0, dependencies: 0, unassigned: 0 },
    });
  });

  it("bloqueia nível 1 antes de chamar o project-service", async () => {
    const integration: ProjectWizardIntegration = { createProject: vi.fn() };

    await expect(
      new ProjectWizardService(integration).create({ ...request, integracaoLevel: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(integration.createProject).not.toHaveBeenCalled();
  });

  it("permite owner sem nível de Integração", async () => {
    const integration: ProjectWizardIntegration = {
      createProject: vi.fn(async () => ({ id: "project-1" })),
    };

    await expect(
      new ProjectWizardService(integration).create({
        ...request,
        integracaoLevel: 0,
        isOwner: true,
        userType: "owner",
      }),
    ).resolves.toMatchObject({ project: { id: "project-1" } });
  });
});
