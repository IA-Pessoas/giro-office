import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { ClientIntegrationReportingService } from "../services/clientIntegrationReportingService.js";

const organizationId = "00000000-0000-4000-8000-000000000002";

describe("ClientIntegrationReportingService", () => {
  it("consulta somente a organização do grant, sem filtrar dominio_code", async () => {
    const findMany = vi.fn().mockResolvedValue([{ name: "Cliente seguro", status: "Ativo" }]);
    const service = new ClientIntegrationReportingService({ client: { findMany } } as never);

    await expect(
      service.extract({
        organizationId,
        source: "integracao.clients",
        fields: ["name", "status"],
        limit: 10,
      }),
    ).resolves.toEqual([{ name: "Cliente seguro", status: "Ativo" }]);

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { name: true, status: true },
      take: 10,
    });
  });

  it("recusa documento normalizado como campo publicável", async () => {
    const findMany = vi.fn();
    const service = new ClientIntegrationReportingService({ client: { findMany } } as never);

    await expect(
      service.extract({
        organizationId,
        source: "integracao.clients",
        fields: ["cpf_cnpj"],
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(ServiceError);

    expect(findMany).not.toHaveBeenCalled();
  });
});
