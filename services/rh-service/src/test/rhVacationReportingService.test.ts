import { describe, expect, it, vi } from "vitest";
import { InternalReportingService } from "../reporting/internalReportingService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";

describe("InternalReportingService para histórico de férias", () => {
  it("filtra pela organização, colaborador e projeta períodos e usos sem anexos", async () => {
    const periods = [
      {
        id: "period-1",
        organization_id: organizationId,
        period_start: new Date("2024-01-01T00:00:00.000Z"),
        period_end: new Date("2024-12-31T00:00:00.000Z"),
        acquisition_start: new Date("2024-01-01T00:00:00.000Z"),
        acquisition_end: new Date("2024-12-31T00:00:00.000Z"),
        employee: { organization_id: organizationId, name: "Ana Souza" },
        usages: [
          {
            start_date: new Date("2025-02-01T00:00:00.000Z"),
            end_date: new Date("2025-02-15T00:00:00.000Z"),
            observation: "Férias anuais",
          },
        ],
      },
      {
        id: "period-foreign",
        organization_id: "20000000-0000-4000-8000-000000000002",
        period_start: new Date("2024-01-01T00:00:00.000Z"),
        employee: {
          organization_id: "20000000-0000-4000-8000-000000000002",
          name: "Ana Souza",
        },
        usages: [],
      },
      {
        id: "period-same-organization-other-employee",
        organization_id: organizationId,
        period_start: new Date("2023-01-01T00:00:00.000Z"),
        employee: { organization_id: organizationId, name: "Bruno Lima" },
        usages: [],
      },
    ];
    const findMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
      const where = args.where as {
        organization_id: string;
        employee: { organization_id: string };
      };
      return periods.filter(
        (period) =>
          period.organization_id === where.organization_id &&
          period.employee.organization_id === where.employee.organization_id,
      );
    });
    const service = new InternalReportingService(
      {
        rhVacationPeriod: { findMany },
      } as never,
      true,
    );

    const result = await service.extract({
      organizationId,
      source: "rh.vacationHistory",
      fields: ["employee_name", "period_start", "period_end", "uses"],
      limit: 10,
      query: {
        filters: [
          {
            field: "employee_name",
            operator: "contains",
            parameter: "employee_name_filter",
            value: "Ana",
          },
        ],
      },
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: organizationId, employee: { organization_id: organizationId } },
      }),
    );
    expect(JSON.stringify(findMany.mock.calls[0]?.[0])).not.toContain("attachment");
    expect(result.rows).toEqual([
      {
        employee_name: "Ana Souza",
        period_start: new Date("2024-01-01T00:00:00.000Z"),
        period_end: new Date("2024-12-31T00:00:00.000Z"),
        uses: "01/02/2025 a 15/02/2025 — Férias anuais",
      },
    ]);
  });

  it("retorna lista vazia e rejeita campos privados antes de consultar", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new InternalReportingService(
      {
        rhVacationPeriod: { findMany },
      } as never,
      true,
    );

    await expect(
      service.extract({
        organizationId,
        source: "rh.vacationHistory",
        fields: ["employee_name"],
        limit: 20,
      }),
    ).resolves.toEqual({ rows: [], reachedLimit: false });
    await expect(
      service.extract({
        organizationId,
        source: "rh.vacationHistory",
        fields: ["id"],
        limit: 20,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
