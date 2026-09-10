import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import type { ReportSourceAdapter } from "../catalog/types.js";
import { getReportingAccessContext } from "../routes/reportingContext.js";
import { reportDefinitionSchema } from "../schemas/reportDefinition.schemas.js";
import { ReportAuthorizationService } from "../services/reportAuthorizationService.js";
import { ReportDefinitionService } from "../services/reportDefinitionService.js";
import { ReportExecutionService } from "../services/reportExecutionService.js";
import { ReportExportService } from "../services/reportExportService.js";
import { ReportLifecycleService } from "../services/reportLifecycleService.js";
import { ReportSnapshotService } from "../services/reportSnapshotService.js";
import { ReportWorkerService } from "../services/reportWorkerService.js";

const organizationId = "00000000-0000-4000-8000-000000000002";
const otherOrganizationId = "00000000-0000-4000-8000-000000000003";
const userId = "00000000-0000-4000-8000-000000000001";

const definition = reportDefinitionSchema.parse({
  sources: ["security.records"],
  columns: [{ source: "security.records", field: "label", alias: "label" }],
});

const adapter: ReportSourceAdapter = {
  sources: [
    {
      key: "security.records",
      label: "Registros publicados",
      module: "security",
      minimum_permission: 1,
      fields: [
        {
          key: "label",
          label: "Rótulo",
          value_type: "string",
          filter_operators: ["eq"],
          aggregations: [],
        },
        {
          key: "amount",
          label: "Valor",
          value_type: "number",
          filter_operators: ["gt"],
          aggregations: ["sum"],
        },
      ],
    },
  ],
  relations: [],
  isEnabled: vi.fn(() => true),
  preview: vi.fn().mockResolvedValue([{ label: "visible" }]),
};

function definitionWithField(field: string) {
  return reportDefinitionSchema.parse({
    sources: ["security.records"],
    columns: [{ source: "security.records", field, alias: field }],
  });
}

function accessContext(overrides: Record<string, unknown> = {}) {
  return {
    organization: { id: organizationId },
    modules: { security: 1 },
    ...overrides,
  };
}

describe("Central de Relatórios — regressões de segurança", () => {
  it("rejeita contexto de outra organização antes de montar o escopo", async () => {
    await expect(
      getReportingAccessContext(
        {
          getAccessContext: vi.fn().mockResolvedValue({
            organization: { id: otherOrganizationId },
            modules: { security: 3 },
          }),
        },
        { userId, organizationId, requestId: "request-cross-tenant" },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("publica apenas colunas de negócio e bloqueia chave técnica", () => {
    const catalog = new SourceCatalogService([adapter]).getAuthorizedCatalog({
      organization_id: organizationId,
      modules: { security: 1 },
    });
    const fields = catalog.sources[0]?.fields.map((field) => field.key);

    expect(fields).toEqual(["label", "amount"]);
    expect(fields).not.toContain("id");
    expect(fields).not.toContain("organization_id");
    expect(() =>
      new ReportDefinitionService(new SourceCatalogService([adapter])).validate(
        definitionWithField("organization_id"),
        { organization_id: organizationId, modules: { security: 1 } },
      ),
    ).toThrowError(ServiceError);
  });

  it("bloqueia fonte quando o usuário não tem permissão atual", () => {
    expect(() =>
      new ReportDefinitionService(new SourceCatalogService([adapter])).validate(definition, {
        organization_id: organizationId,
        modules: {},
      }),
    ).toThrowError(ServiceError);
  });

  it("emite concessão compartilhada limitada às colunas da definição", async () => {
    const authorization = new ReportAuthorizationService(
      {
        getAccessContext: vi.fn().mockResolvedValue(
          accessContext({
            department: { id: "department-1" },
            departmentModule: "security",
            modules: { security: 3 },
          }),
        ),
      },
      new ReportDefinitionService(new SourceCatalogService([adapter])),
    );

    await expect(
      authorization.authorizeSharedModel({
        userId,
        organizationId,
        requestId: "request-shared-grant",
        definition,
      }),
    ).resolves.toMatchObject({
      department_id: "department-1",
      grant: { sources: { "security.records": ["label"] }, relations: [] },
    });
  });

  it("rejeita adição de campo fora da concessão compartilhada", () => {
    const definitions = new ReportDefinitionService(new SourceCatalogService([adapter]));

    expect(() =>
      definitions.validate(definitionWithField("amount"), {
        organization_id: organizationId,
        modules: { security: 3 },
        grant: { sources: { "security.records": ["label"] }, relations: [] },
      }),
    ).toThrowError(ServiceError);
  });

  it("retira o acervo quando o usuário sai do departamento", async () => {
    const authorization = new ReportAuthorizationService(
      {
        getAccessContext: vi
          .fn()
          .mockResolvedValue(
            accessContext({ modules: { security: 3 }, department: null, departmentModule: null }),
          ),
      },
      new ReportDefinitionService(new SourceCatalogService([adapter])),
    );

    await expect(
      authorization.getSharedDepartment({ userId, organizationId, requestId: "request-departure" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("falha o job sem materializar quando a permissão some durante a execução", async () => {
    const transition = vi.fn().mockResolvedValue(undefined);
    const execution = new ReportExecutionService(
      new SourceCatalogService([adapter]),
      new ReportDefinitionService(new SourceCatalogService([adapter])),
    );
    const worker = new ReportWorkerService(
      {
        claimNext: vi.fn().mockResolvedValue({
          id: "job-1",
          organization_id: organizationId,
          requester_id: userId,
          report_model_version_id: "version-1",
          lease_token: "lease-1",
          payload_json: {},
        }),
      } as never,
      {
        reportModelVersion: {
          findFirst: vi.fn().mockResolvedValue({
            report_model_id: "model-1",
            definition_json: definition,
          }),
        },
        reportModel: {
          findFirst: vi.fn().mockResolvedValue({
            created_by_user_id: userId,
            active: true,
          }),
        },
      } as never,
      { getAccessContext: vi.fn().mockResolvedValue(accessContext({ modules: {} })) } as never,
      execution,
      { complete: vi.fn(), transition } as never,
    );

    await expect(worker.processNext()).resolves.toBe(true);
    expect(adapter.preview).not.toHaveBeenCalled();
    expect(transition).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: "job-1", status: "failed" }),
    );
  });

  it("exige justificativa para exclusão antecipada", async () => {
    const transaction = { $transaction: vi.fn() };
    const lifecycle = new ReportLifecycleService(transaction as never, {} as never);

    await expect(
      lifecycle.deleteSnapshot({
        snapshot_id: "snapshot-1",
        organization_id: organizationId,
        actor_id: userId,
        department_id: "department-1",
        reason: "requested",
        justification: "   ",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(transaction.$transaction).not.toHaveBeenCalled();
  });

  it("não abre exportação de snapshot expirado", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const findMany = vi.fn();
    const snapshots = new ReportSnapshotService({
      reportSnapshot: { findFirst },
      reportSnapshotRow: { findMany },
    } as never);

    await expect(
      snapshots.getForExport({
        organizationId,
        userId,
        snapshotId: "snapshot-expired",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(findMany).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "snapshot-expired",
        organization_id: organizationId,
        OR: [{ expires_at: null }, { expires_at: { gt: expect.any(Date) } }],
      }),
    });
  });

  it("permite localizar snapshot compartilhado para membro distinto do solicitante", async () => {
    const reportJobFindFirst = vi.fn().mockResolvedValue({
      id: "job-1",
      report_model_version_id: "version-1",
      requester_id: "author-1",
    });
    const service = new ReportSnapshotService({
      reportSnapshot: {
        findFirst: vi.fn().mockResolvedValue({
          id: "snapshot-1",
          report_job_id: "job-1",
          created_at: new Date(),
        }),
      },
      reportJob: { findFirst: reportJobFindFirst },
      reportModelVersion: {
        findFirst: vi.fn().mockResolvedValue({ report_model_id: "model-1" }),
      },
      reportModel: {
        findFirst: vi.fn().mockResolvedValue({ created_by_user_id: null }),
      },
      reportSnapshotRow: { findMany: vi.fn().mockResolvedValue([]) },
    } as never);

    await expect(
      service.getForExport({
        organizationId,
        userId,
        snapshotId: "snapshot-1",
        allowSharedLookup: true,
      }),
    ).resolves.toMatchObject({ job: { id: "job-1" } });
    expect(reportJobFindFirst).toHaveBeenCalledWith({
      where: {
        id: "job-1",
        organization_id: organizationId,
        status: "completed",
      },
    });
  });

  it("mantém snapshot pessoal restrito ao requester", async () => {
    const reportJobFindFirst = vi.fn().mockResolvedValue(null);
    const service = new ReportSnapshotService({
      reportSnapshot: {
        findFirst: vi.fn().mockResolvedValue({
          id: "snapshot-personal",
          report_job_id: "job-personal",
          created_at: new Date(),
        }),
      },
      reportJob: { findFirst: reportJobFindFirst },
      reportSnapshotRow: { findMany: vi.fn() },
    } as never);

    await expect(
      service.getForExport({
        organizationId,
        userId,
        snapshotId: "snapshot-personal",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(reportJobFindFirst).toHaveBeenCalledWith({
      where: {
        id: "job-personal",
        organization_id: organizationId,
        requester_id: userId,
        status: "completed",
      },
    });
  });

  it("não carrega linhas de snapshot pessoal para requester distinto no lookup compartilhado", async () => {
    const findMany = vi.fn();
    const service = new ReportSnapshotService({
      reportSnapshot: {
        findFirst: vi.fn().mockResolvedValue({
          id: "snapshot-personal",
          report_job_id: "job-personal",
          created_at: new Date(),
        }),
      },
      reportJob: {
        findFirst: vi.fn().mockResolvedValue({
          id: "job-personal",
          report_model_version_id: "version-personal",
          requester_id: "author-1",
        }),
      },
      reportModelVersion: {
        findFirst: vi.fn().mockResolvedValue({ report_model_id: "model-personal" }),
      },
      reportModel: {
        findFirst: vi.fn().mockResolvedValue({ created_by_user_id: "author-1" }),
      },
      reportSnapshotRow: { findMany },
    } as never);

    await expect(
      service.getForExport({
        organizationId,
        userId,
        snapshotId: "snapshot-personal",
        allowSharedLookup: true,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("bloqueia exportação compartilhada quando a permissão atual foi revogada", async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from("csv"));
    const getForExport = vi.fn().mockResolvedValue({
      snapshot: { id: "snapshot-1", created_at: new Date() },
      job: { id: "job-1", report_model_version_id: "version-1" },
      rows: [{ label: "sensitive" }],
    });
    const authorization = new ReportAuthorizationService(
      {
        getAccessContext: vi.fn().mockResolvedValue(
          accessContext({
            department: { id: "department-1" },
            departmentModule: "security",
            modules: {},
          }),
        ),
      },
      new ReportDefinitionService(new SourceCatalogService([adapter])),
    );
    const exporter = new ReportExportService(
      {
        getForExport,
        assertExportable: vi.fn(),
      } as never,
      { csv: { render } } as never,
      { record: vi.fn() } as never,
      {
        getVersion: vi.fn().mockResolvedValue({
          version: { definition_json: definition },
          model: { created_by_user_id: null, department_id: "department-1" },
        }),
      } as never,
      authorization,
    );

    await expect(
      exporter.export({
        snapshotId: "snapshot-1",
        userId,
        organizationId,
        requestId: "request-export-revoked",
        format: "csv",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(getForExport).toHaveBeenCalledWith({
      snapshotId: "snapshot-1",
      userId,
      organizationId,
      allowSharedLookup: true,
    });
    expect(render).not.toHaveBeenCalled();
  });

  it("bloqueia exportação compartilhada quando a permissão é revogada durante o render", async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from("csv"));
    const getForExport = vi.fn().mockResolvedValue({
      snapshot: { id: "snapshot-1", created_at: new Date() },
      job: { id: "job-1", report_model_version_id: "version-1", requester_id: "author-1" },
      rows: [{ label: "sensitive" }],
    });
    const authorization = new ReportAuthorizationService(
      {
        getAccessContext: vi
          .fn()
          .mockResolvedValueOnce(
            accessContext({
              department: { id: "department-1" },
              departmentModule: "security",
              modules: { security: 1 },
            }),
          )
          .mockResolvedValueOnce(
            accessContext({
              department: { id: "department-1" },
              departmentModule: "security",
              modules: {},
            }),
          ),
      },
      new ReportDefinitionService(new SourceCatalogService([adapter])),
    );
    const assertExportable = vi.fn();
    const exporter = new ReportExportService(
      { getForExport, assertExportable } as never,
      { csv: { render } } as never,
      { record: vi.fn() } as never,
      {
        getVersion: vi.fn().mockResolvedValue({
          version: { definition_json: definition },
          model: { created_by_user_id: null, department_id: "department-1" },
        }),
      } as never,
      authorization,
    );

    await expect(
      exporter.export({
        snapshotId: "snapshot-1",
        userId,
        organizationId,
        requestId: "request-export-revoked-during-render",
        format: "csv",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(render).toHaveBeenCalledOnce();
    expect(assertExportable).toHaveBeenCalledOnce();
    expect(assertExportable).toHaveBeenCalledWith({
      snapshotId: "snapshot-1",
      userId,
      organizationId,
      allowShared: true,
    });
  });
});
