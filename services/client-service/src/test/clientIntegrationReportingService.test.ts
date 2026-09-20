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
    ).resolves.toEqual({
      rows: [{ name: "Cliente seguro", status: "Ativo" }],
      reachedLimit: false,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { name: true, status: true },
      take: 11,
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

  it("processa query pelo callback e preserva reachedLimit do resultado", async () => {
    const records = Array.from({ length: 150 }, (_, index) => ({
      name: `Cliente ${String(index).padStart(3, "0")}`,
    }));
    const service = new ClientIntegrationReportingService({
      $transaction: async function (read: (transaction: unknown) => Promise<unknown>) {
        return read(this);
      },
      client: {
        findMany: async ({ take, skip = 0 }: { take: number; skip?: number }) =>
          records.slice(skip, skip + take),
      },
    } as never);

    await expect(
      service.extract({
        organizationId,
        source: "integracao.clients",
        fields: ["name"],
        limit: 1,
        query: { order_by: [{ field: "name", direction: "desc" }] },
      }),
    ).resolves.toEqual({
      rows: [{ name: "Cliente 149" }],
      reachedLimit: true,
    });
  });
});
