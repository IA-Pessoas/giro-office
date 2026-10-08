import "./envBootstrap.js";

import {
  MAX_REPORTING_QUERY_BYTES,
  MAX_REPORTING_QUERY_ROWS,
  REPORTING_QUERY_BYTE_LIMIT_CODE,
  REPORTING_QUERY_ROW_LIMIT_CODE,
  REPORTING_QUERY_ROW_LIMIT_MESSAGE,
} from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../reporting/internalReportingService.js";

const organizationId = "00000000-0000-4000-8000-000000000002";

describe("pessoal internal reporting service", () => {
  it.each([
    100, 101, 102,
  ])("extrai todos os %i registros ao redor do limite antigo", async (count) => {
    const records = Array.from({ length: count }, (_, index) => ({
      id: `row-${String(index).padStart(3, "0")}`,
      type: `value-${index}`,
    }));
    const findMany = vi.fn().mockResolvedValue(records);
    const transactionClient = { lddPessoal: { findMany } };
    const transaction = vi.fn(async (read: (client: unknown) => Promise<unknown>) =>
      read(transactionClient),
    );
    const service = new InternalReportingService({
      ...transactionClient,
      $transaction: transaction,
    } as never);

    const result = await service.extract({
      organizationId,
      source: "pessoal.ldd",
      fields: ["type"],
      limit: 1000,
    });

    expect(result.rows).toHaveLength(count);
    expect(result.rows[0]).toEqual({ type: "value-0" });
    expect(result.rows[count - 1]).toEqual({ type: `value-${count - 1}` });
    expect(result.reachedLimit).toBe(false);
    expect(findMany).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
      maxWait: 5000,
      timeout: 30000,
    });
  });

  it.each([
    ["pessoal.ldd", "type"],
    ["pessoal.obligations", "competence"],
    ["pessoal.payroll", "advance"],
    ["pessoal.situations", "status"],
    ["pessoal.unions", "name"],
  ])("pagina %s em lotes ordenados e remove o cursor da projeção", async (source, field) => {
    const records = Array.from({ length: 1002 }, (_, index) => ({
      id: `row-${String(index).padStart(4, "0")}`,
      [field]: source === "pessoal.payroll" ? index % 2 === 0 : `value-${index}`,
    }));
    const findMany = vi
      .fn()
      .mockImplementation((input: { cursor?: { id: string }; skip?: number; take: number }) => {
        const cursorIndex = input.cursor
          ? records.findIndex((row) => row.id === input.cursor?.id)
          : -1;
        const start = cursorIndex < 0 ? 0 : cursorIndex + (input.skip ?? 0);
        return Promise.resolve(records.slice(start, start + input.take));
      });
    const delegateBySource = {
      "pessoal.ldd": { lddPessoal: { findMany } },
      "pessoal.obligations": { obrigationsPessoal: { findMany } },
      "pessoal.payroll": { payroll: { findMany } },
      "pessoal.situations": { situationsPessoal: { findMany } },
      "pessoal.unions": { unionPessoal: { findMany } },
    };
    const transactionClient = delegateBySource[source as keyof typeof delegateBySource];
    const transaction = vi.fn(
      async (read: (client: unknown) => Promise<unknown>, _options: unknown) =>
        read(transactionClient),
    );
    const service = new InternalReportingService({
      ...transactionClient,
      $transaction: transaction,
    } as never);

    const result = await service.extract({
      organizationId,
      source: source as never,
      fields: [field],
      limit: 1001,
    });

    expect(result.rows).toHaveLength(1001);
    expect(result.rows[0]).toEqual({ [field]: records[0]?.[field] });
    expect(result.rows[result.rows.length - 1]).toEqual({ [field]: records[1000]?.[field] });
    expect(result.reachedLimit).toBe(true);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
      maxWait: 5000,
      timeout: 30000,
    });
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: { id: "row-0999" },
        skip: 1,
        orderBy: { id: "asc" },
        take: 2,
        select: { [field]: true, id: true },
      }),
    );
  });

  it("paginates consultas filtradas com cursor estável sem expor o ID", async () => {
    const records = Array.from({ length: 1002 }, (_, index) => ({
      id: `ldd-${String(index).padStart(4, "0")}`,
      type: `value-${index}`,
    }));
    const findMany = vi
      .fn()
      .mockImplementation((input: { cursor?: { id: string }; skip?: number; take: number }) => {
        const cursorIndex = input.cursor
          ? records.findIndex((row) => row.id === input.cursor?.id)
          : -1;
        const start = cursorIndex < 0 ? (input.skip ?? 0) : cursorIndex + (input.skip ?? 0);
        return Promise.resolve(records.slice(start, start + input.take));
      });
    const transaction = vi.fn(
      async (read: (client: unknown) => Promise<unknown>, _options: unknown) =>
        read({ lddPessoal: { findMany } }),
    );
    const service = new InternalReportingService({ $transaction: transaction } as never);

    const result = await service.extract({
      organizationId,
      source: "pessoal.ldd",
      fields: ["type"],
      limit: 1000,
      query: {
        filters: [{ field: "type", operator: "eq", parameter: "target", value: "value-1001" }],
      },
    });

    expect(result).toEqual({ rows: [{ type: "value-1001" }], reachedLimit: false });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
      maxWait: 5000,
      timeout: 30000,
    });
    expect(findMany).toHaveBeenCalledTimes(11);
    const queries = findMany.mock.calls.map(([query]) => query);
    expect(queries[0]).toMatchObject({
      orderBy: { id: "asc" },
      take: 101,
      select: { id: true, type: true },
    });
    expect(queries[0]?.cursor).toBeUndefined();
    expect(queries.slice(1).every((query) => query.skip === 1 && query.cursor?.id)).toBe(true);
    expect(queries.slice(1).map((query) => query.cursor?.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => records[(index + 1) * 100 - 1]?.id),
    );
    expect(result.rows.some((row) => "id" in row)).toBe(false);
  });

  it("filtra LDD por organização, limita a origem e projeta somente campos publicados", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { type: "FGTS", id: "hidden-id", status: "Regular" },
      { type: "INSS", id: "hidden-id-2", status: "Pendente" },
    ]);
    const service = new InternalReportingService({ lddPessoal: { findMany } } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.ldd",
        fields: ["type", "status"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ type: "FGTS", status: "Regular" }],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { type: true, status: true },
      take: 2,
    });
  });

  it("rejeita campo LDD que não foi publicado", async () => {
    const findMany = vi.fn();
    const service = new InternalReportingService({ lddPessoal: { findMany } } as never);

    await expect(
      service.extract({ organizationId, source: "pessoal.ldd", fields: ["id"], limit: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("extrai payroll filtrado por organização e projeta somente os campos publicados", async () => {
    const payrollFindMany = vi.fn().mockResolvedValue([
      { id: "hidden-id", advance: true, employees: 12, contact: "sensitive" },
      { id: "hidden-id-2", advance: false, employees: 4, contact: "sensitive" },
    ]);
    const service = new InternalReportingService({
      payroll: { findMany: payrollFindMany },
    } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.payroll",
        fields: ["advance", "employees"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ advance: true, employees: 12 }],
      reachedLimit: true,
    });

    expect(payrollFindMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { advance: true, employees: true },
      take: 2,
    });
  });

  it("enriquece a ficha permanente somente pelo grupo canônico", async () => {
    const payrollFindMany = vi.fn().mockResolvedValue([
      {
        advance: true,
        client: { name: "Cliente sem grupo" },
        responsible: { name: "Responsável A" },
        union: { name: "Sindicato A" },
        group: null,
        legacy_group: null,
      },
      {
        advance: false,
        client: { name: "Cliente sem grupo canônico" },
        responsible: null,
        union: null,
        group: null,
        legacy_group: "Grupo legado sem mapa",
      },
      {
        advance: false,
        client: { name: "Cliente sem movimento" },
        responsible: null,
        union: null,
        group: { name: "Sem Movimento", archived_at: null, system_key: "NO_MOVEMENT" },
        legacy_group: "Sem Movimento",
      },
      {
        advance: false,
        client: { name: "Cliente arquivado" },
        responsible: null,
        union: null,
        group: { name: "Grupo antigo", archived_at: new Date("2026-01-01"), system_key: null },
        legacy_group: "Grupo antigo",
      },
    ]);
    const service = new InternalReportingService({
      payroll: { findMany: payrollFindMany },
    } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.payroll",
        fields: [
          "client_name",
          "responsible_name",
          "union_name",
          "group_name",
          "group_state",
          "advance",
        ],
        limit: 4,
      }),
    ).resolves.toEqual({
      rows: [
        {
          client_name: "Cliente sem grupo",
          responsible_name: "Responsável A",
          union_name: "Sindicato A",
          group_name: null,
          group_state: "SEM_GRUPO",
          advance: true,
        },
        {
          client_name: "Cliente sem grupo canônico",
          responsible_name: null,
          union_name: null,
          group_name: null,
          group_state: "SEM_GRUPO",
          advance: false,
        },
        {
          client_name: "Cliente sem movimento",
          responsible_name: null,
          union_name: null,
          group_name: "Sem Movimento",
          group_state: "SEM_MOVIMENTO",
          advance: false,
        },
        {
          client_name: "Cliente arquivado",
          responsible_name: null,
          union_name: null,
          group_name: "Grupo antigo",
          group_state: "ARQUIVADO",
          advance: false,
        },
      ],
      reachedLimit: false,
    });
    expect(payrollFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: organizationId }, take: 5 }),
    );
  });

  it("rejeita campo sensível de payroll antes de consultar o banco", async () => {
    const findMany = vi.fn();
    const service = new InternalReportingService({ payroll: { findMany } } as never);

    await expect(
      service.extract({ organizationId, source: "pessoal.payroll", fields: ["contact"], limit: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("extrai sindicatos somente do tenant assinado, sem IDs e com limite da origem", async () => {
    const unionFindMany = vi.fn().mockResolvedValue([
      { id: "hidden-id", name: "Sindicato A", base_date: new Date("2026-05-01") },
      { id: "hidden-id-2", name: "Sindicato B", base_date: null },
    ]);
    const service = new InternalReportingService({
      unionPessoal: { findMany: unionFindMany },
    } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.unions",
        fields: ["name", "base_date"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ name: "Sindicato A", base_date: new Date("2026-05-01") }],
      reachedLimit: true,
    });

    expect(unionFindMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { name: true, base_date: true },
      take: 2,
    });
  });

  it("recusa ID e CNPJ de sindicato antes de consultar o banco", async () => {
    const findMany = vi.fn();
    const service = new InternalReportingService({ unionPessoal: { findMany } } as never);

    await expect(
      service.extract({ organizationId, source: "pessoal.unions", fields: ["cnpj"], limit: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("extrai obrigações pelo tenant assinado e retorna reachedLimit da origem", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        competence: "2026-08",
        advance: false,
        payroll: true,
        group_snapshot_id: null,
        group_snapshot_name: null,
        group_snapshot_policy: null,
        id: "hidden-id",
      },
      {
        competence: "2026-09",
        advance: true,
        payroll: false,
        group_snapshot_id: "group-2",
        group_snapshot_name: "Grupo atual",
        group_snapshot_policy: "NORMAL",
        id: "hidden-id-2",
      },
    ]);
    const service = new InternalReportingService({ obrigationsPessoal: { findMany } } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.obligations",
        fields: [
          "competence",
          "advance",
          "payroll",
          "group_snapshot_name",
          "group_snapshot_policy",
        ],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [
        {
          competence: "2026-08",
          advance: false,
          payroll: true,
          group_snapshot_name: null,
          group_snapshot_policy: null,
        },
      ],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: {
        competence: true,
        advance: true,
        payroll: true,
        group_snapshot_name: true,
        group_snapshot_policy: true,
      },
      take: 2,
    });
  });

  it("mantém o estado do grupo da obrigação no snapshot histórico, sem consultar a folha atual", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        competence: "2026-08",
        group_snapshot_name: "Sem Movimento",
        group_snapshot_policy: "NO_OBLIGATIONS",
        client: { name: "Cliente histórico" },
        responsible: { name: "Responsável histórico" },
      },
    ]);
    const service = new InternalReportingService({ obrigationsPessoal: { findMany } } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.obligations",
        fields: [
          "competence",
          "client_name",
          "responsible_name",
          "group_snapshot_name",
          "group_snapshot_state",
        ],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [
        {
          competence: "2026-08",
          client_name: "Cliente histórico",
          responsible_name: "Responsável histórico",
          group_snapshot_name: "Sem Movimento",
          group_snapshot_state: "SEM_MOVIMENTO",
        },
      ],
      reachedLimit: false,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: organizationId },
        select: expect.not.objectContaining({ payroll: expect.anything() }),
      }),
    );
  });

  it("recusa campo não publicado nas obrigações antes de consultar o tenant", async () => {
    const findMany = vi.fn();
    const service = new InternalReportingService({ obrigationsPessoal: { findMany } } as never);

    await expect(
      service.extract({ organizationId, source: "pessoal.obligations", fields: ["id"], limit: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("extrai situations filtradas por organização e mantém registrador e concluidor fora da projeção", async () => {
    const situationsFindMany = vi.fn().mockResolvedValue([
      {
        status: "Finalizado",
        title: "Folha",
        registration_date: new Date("2026-06-01T12:00:00.000Z"),
        completion_date: new Date("2026-06-30T12:00:00.000Z"),
        id: "hidden-id",
        registered_by_id: "hidden-registrador",
        completed_by_id: "hidden-concluidor",
        organization_id: organizationId,
      },
      {
        status: "Em andamento",
        title: "Férias",
        registration_date: new Date("2026-06-02T12:00:00.000Z"),
        completion_date: null,
        id: "hidden-id-2",
        registered_by_id: "hidden-registrador-2",
        completed_by_id: null,
        organization_id: organizationId,
      },
    ]);
    const service = new InternalReportingService({
      situationsPessoal: { findMany: situationsFindMany },
    } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.situations" as never,
        fields: ["status", "title", "registration_date", "completion_date"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [
        {
          status: "Finalizado",
          title: "Folha",
          registration_date: new Date("2026-06-01T12:00:00.000Z"),
          completion_date: new Date("2026-06-30T12:00:00.000Z"),
        },
      ],
      reachedLimit: true,
    });

    expect(situationsFindMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: {
        status: true,
        title: true,
        registration_date: true,
        completion_date: true,
      },
      take: 2,
    });
  });

  it("rejeita chaves internas de situations antes de consultar o banco", async () => {
    const situationsFindMany = vi.fn();
    const service = new InternalReportingService({
      situationsPessoal: { findMany: situationsFindMany },
    } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.situations" as never,
        fields: ["registered_by_id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(situationsFindMany).not.toHaveBeenCalled();
  });

  it.each([
    ["abaixo do limite", MAX_REPORTING_QUERY_ROWS - 1, false],
    ["no limite", MAX_REPORTING_QUERY_ROWS, false],
    ["acima do limite", MAX_REPORTING_QUERY_ROWS + 1, true],
  ] as const)("aplica o limite global de linhas no snapshot sem query %s", async (_, count, overLimit) => {
    const findMany = vi
      .fn()
      .mockImplementation(
        async (input: { cursor?: { id: string }; skip?: number; take: number }) => {
          const cursorIndex = input.cursor ? Number(input.cursor.id.slice(4)) : -1;
          const start = Math.max(0, cursorIndex + (input.skip ?? 1));
          const pageLength = Math.max(0, Math.min(input.take, count - start));
          return Array.from({ length: pageLength }, (_, index) => ({
            id: `row-${String(start + index).padStart(5, "0")}`,
            type: "FGTS",
          }));
        },
      );
    const transaction = vi.fn(async (read: (client: unknown) => Promise<unknown>) =>
      read({ lddPessoal: { findMany } }),
    );
    const service = new InternalReportingService({
      lddPessoal: { findMany },
      $transaction: transaction,
    } as never);

    const extraction = service.extract({
      organizationId,
      source: "pessoal.ldd",
      fields: ["type"],
      limit: count,
    });
    if (overLimit) {
      await expect(
        extraction.then(
          () => "resolved",
          (error: unknown) => error,
        ),
      ).resolves.toMatchObject({
        statusCode: 422,
        code: REPORTING_QUERY_ROW_LIMIT_CODE,
        message: REPORTING_QUERY_ROW_LIMIT_MESSAGE,
      });
      expect(findMany).toHaveBeenCalledTimes(51);
    } else {
      const result = await extraction;
      expect(result.rows).toHaveLength(count);
      expect(result.reachedLimit).toBe(false);
    }
  });

  it("retorna erro acionável quando o snapshot sem query excede 20 MiB", async () => {
    const findMany = vi.fn().mockResolvedValue([{ type: "x".repeat(MAX_REPORTING_QUERY_BYTES) }]);
    const service = new InternalReportingService({ lddPessoal: { findMany } } as never);

    const extraction = service.extract({
      organizationId,
      source: "pessoal.ldd",
      fields: ["type"],
      limit: 1,
    });
    await expect(
      extraction.then(
        () => "resolved",
        (error: unknown) => error,
      ),
    ).resolves.toMatchObject({ statusCode: 422, code: REPORTING_QUERY_BYTE_LIMIT_CODE });
  });
});
