import { describe, expect, it, vi } from "vitest";
import { InternalReportingService } from "../reporting/internalReportingService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";

type UserRow = {
  id: string;
  name: string;
  status: string;
  birth_date: Date | null;
  department: { name: string };
};

function createUserPrisma(rows: readonly UserRow[]) {
  const findMany = vi.fn(
    async (input: {
      where: { organization_id: string; status?: string };
      select: Record<string, unknown>;
      take: number;
      cursor?: { id: string };
      skip?: number;
    }) => {
      const eligible = rows.filter(
        (row) =>
          input.where.organization_id === organizationId &&
          (!input.where.status || row.status === input.where.status),
      );
      const cursorIndex = input.cursor
        ? eligible.findIndex((row) => row.id === input.cursor?.id)
        : -1;
      const start = cursorIndex >= 0 ? cursorIndex + (input.skip ?? 0) : (input.skip ?? 0);
      return eligible.slice(start, start + input.take).map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        birth_date: row.birth_date,
        department: row.department,
      }));
    },
  );
  const prisma: Record<string, unknown> = {
    user: { findMany },
    rhRequest: { findMany: vi.fn().mockResolvedValue([]) },
    holidays: { findMany: vi.fn().mockResolvedValue([]) },
    point: { findMany: vi.fn().mockResolvedValue([]) },
    timeSheets: { findMany: vi.fn().mockResolvedValue([]) },
    timeBankReleases: { findMany: vi.fn().mockResolvedValue([]) },
    timeClockRequest: { findMany: vi.fn().mockResolvedValue([]) },
  };
  prisma.$transaction = vi.fn(async (read: (client: unknown) => Promise<unknown>) => read(prisma));
  return { prisma, findMany };
}

const rows = Array.from(
  { length: 205 },
  (_, index): UserRow => ({
    id: `employee-${String(index).padStart(3, "0")}`,
    name: `Colaborador ${index}`,
    status: index % 3 === 0 ? "inactive" : "active",
    birth_date: new Date(Date.UTC(1990, index % 12, (index % 27) + 1)),
    department: { name: index % 2 === 0 ? "Comercial" : "Financeiro" },
  }),
);

describe("relatórios de colaboradores RH", () => {
  it("mantém filtros de status, departamento e mês após ler todas as páginas", async () => {
    const { prisma, findMany } = createUserPrisma(rows);
    const result = await new InternalReportingService(prisma as never).extract({
      organizationId,
      source: "rh.employees",
      fields: ["name", "status", "department", "birth_month"],
      limit: 150,
      query: {
        filters: [
          { field: "status", operator: "eq", parameter: "status_filter", value: "active" },
          {
            field: "department",
            operator: "eq",
            parameter: "department_filter",
            value: "Financeiro",
          },
          { field: "birth_month", operator: "eq", parameter: "month_filter", value: 7 },
        ],
      },
    });

    expect(result.rows).toEqual(
      rows
        .filter(
          (row) =>
            row.status === "active" &&
            row.department.name === "Financeiro" &&
            row.birth_date?.getUTCMonth() === 6,
        )
        .map((row) => ({
          name: row.name,
          status: row.status,
          department: row.department.name,
          birth_month: 7,
        })),
    );
    expect(findMany.mock.calls.length).toBeGreaterThan(2);
    expect(
      findMany.mock.calls.every(([input]) => input.where.organization_id === organizationId),
    ).toBe(true);
  });

  it("restringe aniversariantes a ativos e retorna estado vazio sem perder o contrato", async () => {
    const inactiveOnly = rows.map((row) => ({ ...row, status: "inactive" }));
    const { prisma, findMany } = createUserPrisma(inactiveOnly);
    const result = await new InternalReportingService(prisma as never).extract({
      organizationId,
      source: "rh.birthdays",
      fields: ["name", "department", "birth_day", "birth_month"],
      limit: 50,
      query: {
        filters: [{ field: "birth_month", operator: "eq", parameter: "month_filter", value: 7 }],
      },
    });

    expect(findMany.mock.calls[0]?.[0].where).toEqual({
      organization_id: organizationId,
      status: "active",
      birth_date: { not: null },
    });
    expect(result).toEqual({ rows: [], reachedLimit: false });
  });
});
