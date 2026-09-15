import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../reporting/internalReportingService.js";

const organizationId = "00000000-0000-4000-8000-000000000002";

describe("pessoal internal reporting service", () => {
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
});
