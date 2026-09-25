import { inflateRawSync } from "node:zlib";

import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

import { ReportCsvService } from "../services/reportCsvService.js";
import { ReportExportService } from "../services/reportExportService.js";
import { ReportXlsxService } from "../services/reportXlsxService.js";

const columns = [
  { key: "name", label: "Nome" },
  { key: "amount", label: "Valor" },
  { key: "created_at", label: "Criado em" },
];

function readZipEntries(body: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  let offset = 0;
  while (body.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = body.readUInt32LE(offset + 18);
    const nameLength = body.readUInt16LE(offset + 26);
    const extraLength = body.readUInt16LE(offset + 28);
    const name = body.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    entries.set(
      name,
      inflateRawSync(body.subarray(start, start + compressedSize)).toString("utf8"),
    );
    offset = start + compressedSize;
  }
  return entries;
}

describe("ReportCsvService", () => {
  it("emite RFC 4180 e neutraliza valores textuais que iniciam fórmulas", () => {
    const service = new ReportCsvService();

    expect(
      service.render({
        columns,
        rows: [
          {
            name: '=SUM("A1:A2")',
            amount: 10,
            created_at: "linha 1\nlinha 2",
          },
        ],
      }),
    ).toEqual(Buffer.from('Nome,Valor,Criado em\r\n"\'=SUM(""A1:A2"")",10,"linha 1\nlinha 2"\r\n'));
  });

  it("projeta cada linha somente nas colunas da apresentação", () => {
    const service = new ReportCsvService();

    expect(
      service.render({
        columns: [{ key: "name", label: "Nome" }],
        rows: [{ name: "Ana" }],
      }),
    ).toEqual(Buffer.from("Nome\r\nAna\r\n"));
  });

  it("neutraliza fórmulas precedidas por whitespace ou tab", () => {
    const service = new ReportCsvService();

    expect(
      service.render({
        columns: [{ key: "value", label: "Valor" }],
        rows: [{ value: " =1+1" }, { value: "\t@cmd" }],
      }),
    ).toEqual(Buffer.from("Valor\r\n' =1+1\r\n'\t@cmd\r\n"));
  });
});

describe("ReportXlsxService", () => {
  it("preserva números e datas como tipos de célula do XLSX", async () => {
    const service = new ReportXlsxService();
    const createdAt = new Date("2026-08-26T12:00:00.000Z");
    const workbook = new ExcelJS.Workbook();

    const buffer = await service.render({
      columns,
      rows: [{ name: "Ana", amount: 42.5, created_at: createdAt }],
    });
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).values).toEqual([undefined, "Nome", "Valor", "Criado em"]);
    expect(sheet.getCell("A2").value).toBe("Ana");
    expect(sheet.getCell("B2").value).toBe(42.5);
    expect(sheet.getCell("C2").value).toEqual(createdAt);
  });
});

describe("ReportExportService", () => {
  it("inclui a dimensão oculta da lista agrupada na exportação tabular", async () => {
    const service = new ReportExportService({
      getForExport: vi.fn().mockResolvedValue({
        snapshot: { id: "snapshot-1", created_at: new Date("2026-08-26T12:00:00.000Z") },
        job: { id: "job-1", report_model_version_id: "version-1", requester_id: "user-1" },
        rows: [],
        blocks: [
          {
            source: "projects",
            label: "Projetos",
            columns: [
              { key: "state", label: "Grupo: Estado", hidden: true },
              { key: "name", label: "Nome" },
            ],
            rows: [{ state: "SP", name: "Ana" }],
          },
        ],
      }),
      assertExportable: vi.fn().mockResolvedValue(undefined),
    } as never);
    const result = await service.export({
      snapshotId: "snapshot-1",
      userId: "user-1",
      organizationId: "org-1",
      requestId: "request-1",
      format: "csv",
    });
    expect(result.body.toString("utf8")).toBe("Grupo: Estado,Nome\r\nSP,Ana\r\n");
  });
  it("usa no PDF a versão do timbrado escolhida no modelo do snapshot", async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from("%PDF-1.3"));
    const letterhead = { id: "office-v1", sha256: "a".repeat(64) };
    const service = new ReportExportService(
      {
        getForExport: vi.fn().mockResolvedValue({
          snapshot: { id: "snapshot-1", created_at: new Date("2026-08-26T12:00:00.000Z") },
          job: { id: "job-1", report_model_version_id: "version-1", requester_id: "user-1" },
          rows: [{ name: "Ana" }],
        }),
        assertExportable: vi.fn().mockResolvedValue(undefined),
      } as never,
      { pdf: { format: "pdf", contentType: "application/pdf", render } } as never,
      { record: vi.fn() } as never,
      {
        getVersion: vi.fn().mockResolvedValue({
          version: { definition_json: { version: 2, areas: [], letterhead } },
          model: { created_by_user_id: "user-1" },
        }),
      } as never,
      { validateSharedDefinition: vi.fn() } as never,
    );

    await service.export({
      snapshotId: "snapshot-1",
      userId: "user-1",
      organizationId: "org-1",
      requestId: "request-1",
      format: "pdf",
    });
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ letterhead }));
  });
  it("gera um arquivo por área em ZIP para CSV e preserva nomes amigáveis", async () => {
    const render = vi.fn((table) =>
      Buffer.from(`${table.columns[0]?.label}\r\n${table.rows[0]?.name ?? ""}\r\n`),
    );
    const service = new ReportExportService(
      {
        getForExport: vi.fn().mockResolvedValue({
          snapshot: { id: "snapshot-1", created_at: new Date("2026-08-26T12:00:00.000Z") },
          job: { id: "job-1", report_model_version_id: "version-1" },
          rows: [],
          blocks: [
            {
              source: "projects",
              label: "Projetos / Ativos",
              columns: [{ key: "name", label: "Nome" }],
              rows: [{ name: "Ana" }],
            },
            {
              source: "clients",
              label: "Clientes: VIP?",
              columns: [{ key: "name", label: "Nome" }],
              rows: [{ name: "Bia" }],
            },
          ],
        }),
        assertExportable: vi.fn().mockResolvedValue(undefined),
      } as never,
      { csv: { render } } as never,
      { record: vi.fn() } as never,
    );

    const result = await service.export({
      snapshotId: "snapshot-1",
      userId: "user-1",
      organizationId: "org-1",
      requestId: "request-1",
      format: "csv",
    });

    expect(result).toMatchObject({
      contentType: "application/zip",
      fileName: "report-job-1-2026-08-26_12-00-00.zip",
    });
    expect(result.body.readUInt32LE(0)).toBe(0x04034b50);
    expect([...readZipEntries(result.body).entries()]).toEqual([
      ["Projetos _ Ativos.csv", "Nome\r\nAna\r\n"],
      ["Clientes_ VIP_.csv", "Nome\r\nBia\r\n"],
    ]);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("renderiza áreas do ZIP com concorrência limitada a uma por vez", async () => {
    let activeRenders = 0;
    let maxActiveRenders = 0;
    const render = vi.fn(async (table) => {
      activeRenders += 1;
      maxActiveRenders = Math.max(maxActiveRenders, activeRenders);
      await new Promise((resolve) => setTimeout(resolve, 0));
      activeRenders -= 1;
      return Buffer.from(`${table.columns[0]?.label}\r\n`);
    });
    const service = new ReportExportService(
      {
        getForExport: vi.fn().mockResolvedValue({
          snapshot: { id: "snapshot-1", created_at: new Date() },
          job: { id: "job-1", report_model_version_id: "version-1" },
          rows: [],
          blocks: [
            {
              source: "projects",
              label: "Projetos",
              columns: [{ key: "name", label: "Nome" }],
              rows: [{ name: "Ana" }],
            },
            {
              source: "clients",
              label: "Clientes",
              columns: [{ key: "name", label: "Nome" }],
              rows: [{ name: "Bia" }],
            },
          ],
        }),
        assertExportable: vi.fn().mockResolvedValue(undefined),
      } as never,
      { csv: { render } } as never,
    );

    await service.export({
      snapshotId: "snapshot-1",
      userId: "user-1",
      organizationId: "org-1",
      requestId: "request-1",
      format: "csv",
    });

    expect(maxActiveRenders).toBe(1);
  });

  it("gera PDF único com título e linhas de cada bloco", async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from("%PDF-composed"));
    const service = new ReportExportService(
      {
        getForExport: vi.fn().mockResolvedValue({
          snapshot: { id: "snapshot-1", created_at: new Date("2026-08-26T12:00:00.000Z") },
          job: { id: "job-1", report_model_version_id: "version-1" },
          rows: [],
          blocks: [
            {
              source: "projects",
              label: "Projetos",
              columns: [{ key: "name", label: "Nome" }],
              rows: [{ name: "Ana" }],
            },
            {
              source: "clients",
              label: "Clientes",
              columns: [{ key: "name", label: "Nome" }],
              rows: [],
            },
          ],
        }),
        assertExportable: vi.fn().mockResolvedValue(undefined),
      } as never,
      { pdf: { format: "pdf", contentType: "application/pdf", render } } as never,
      { record: vi.fn() } as never,
    );

    await expect(
      service.export({
        snapshotId: "snapshot-1",
        userId: "user-1",
        organizationId: "org-1",
        requestId: "request-1",
        format: "pdf",
      }),
    ).resolves.toMatchObject({
      contentType: "application/pdf",
      fileName: "report-job-1-2026-08-26_12-00-00.pdf",
      body: Buffer.from("%PDF-composed"),
    });
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: [
          expect.objectContaining({ title: "Projetos", rows: [{ name: "Ana" }] }),
          expect.objectContaining({ title: "Clientes", rows: [] }),
        ],
      }),
    );
  });

  it("exporta somente os dados persistidos no snapshot e audita metadados seguros", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn().mockReturnValue(Buffer.from("Nome\r\nAna\r\n"));
    const snapshotService = {
      getForExport: vi.fn().mockResolvedValue({
        snapshot: { id: "snapshot-1", created_at: new Date("2026-08-26T12:00:00.000Z") },
        job: { id: "job-1", report_model_version_id: "version-1" },
        rows: [{ name: "Ana" }],
      }),
      assertExportable: vi.fn().mockResolvedValue(undefined),
    };
    const jobs = { getVersion: vi.fn() };
    const authorizationService = { validateDefinition: vi.fn() };
    const service = new ReportExportService(
      snapshotService as never,
      { csv: { render } } as never,
      { record } as never,
    );

    await expect(
      service.export({
        snapshotId: "snapshot-1",
        userId: "user-1",
        organizationId: "org-1",
        requestId: "request-1",
        format: "csv",
      }),
    ).resolves.toMatchObject({
      contentType: "text/csv; charset=utf-8",
      fileName: "report-job-1-2026-08-26_12-00-00.csv",
      body: Buffer.from("Nome\r\nAna\r\n"),
    });

    expect(snapshotService.getForExport).toHaveBeenCalledWith({
      snapshotId: "snapshot-1",
      userId: "user-1",
      organizationId: "org-1",
      allowSharedLookup: false,
    });
    expect(jobs.getVersion).not.toHaveBeenCalled();
    expect(authorizationService.validateDefinition).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledWith({
      columns: [{ key: "name", label: "name", valueType: "string" }],
      rows: [{ name: "Ana" }],
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "report.export",
        job_id: "job-1",
        format: "csv",
        result: "success",
        counts: { rows: 1, bytes: 11 },
      }),
    );
    expect(snapshotService.assertExportable.mock.invocationCallOrder[0]).toBeLessThan(
      record.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("reutiliza a projeção persistida para exportar PDF sem consultar definição ou dados vivos", async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from("%PDF-1.3"));
    const snapshotService = {
      getForExport: vi.fn().mockResolvedValue({
        snapshot: { id: "snapshot-1", created_at: new Date("2026-08-26T12:00:00.000Z") },
        job: { id: "job-1", report_model_version_id: "version-1" },
        rows: [{ name: "Ana" }],
      }),
      assertExportable: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ReportExportService(
      snapshotService as never,
      {
        pdf: { format: "pdf", contentType: "application/pdf", render },
      } as never,
      { record: vi.fn() } as never,
    );

    await expect(
      service.export({
        snapshotId: "snapshot-1",
        userId: "user-1",
        organizationId: "org-1",
        requestId: "request-1",
        format: "pdf",
      }),
    ).resolves.toMatchObject({
      contentType: "application/pdf",
      fileName: "report-job-1-2026-08-26_12-00-00.pdf",
      body: Buffer.from("%PDF-1.3"),
    });

    expect(render).toHaveBeenCalledWith({
      author: "Usuário não identificado",
      generatedAt: new Date("2026-08-26T12:00:00.000Z"),
      organizationId: "org-1",
      scope: "personal",
      presentation_json: {
        columns: [{ key: "name", label: "name", format: "string" }],
      },
      rows: [{ name: "Ana" }],
    });
    expect(snapshotService.getForExport).toHaveBeenCalledOnce();
    expect(snapshotService.assertExportable).toHaveBeenCalledTimes(2);
    expect(snapshotService.assertExportable).toHaveBeenNthCalledWith(1, {
      snapshotId: "snapshot-1",
      userId: "user-1",
      organizationId: "org-1",
      allowShared: false,
    });
    expect(snapshotService.assertExportable).toHaveBeenNthCalledWith(2, {
      snapshotId: "snapshot-1",
      userId: "user-1",
      organizationId: "org-1",
      allowShared: false,
    });
  });

  it("usa nome amigável da pessoa autora no PDF, sem expor o UUID", async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from("%PDF-1.3"));
    const authorId = "author-1";
    const authorContext = {
      getAccessContext: vi.fn().mockResolvedValue({
        user: { id: authorId, name: "Ana Lima", login: "ana@example.com" },
      }),
    };
    const service = new ReportExportService(
      {
        getForExport: vi.fn().mockResolvedValue({
          snapshot: { id: "snapshot-1", created_at: new Date("2026-08-26T12:00:00.000Z") },
          job: {
            id: "job-1",
            report_model_version_id: "version-1",
            requester_id: authorId,
          },
          rows: [{ name: "Ana" }],
        }),
        assertExportable: vi.fn().mockResolvedValue(undefined),
      } as never,
      { pdf: { format: "pdf", contentType: "application/pdf", render } } as never,
      { record: vi.fn() } as never,
      undefined,
      undefined,
      authorContext as never,
    );

    await service.export({
      snapshotId: "snapshot-1",
      userId: "downloader-1",
      organizationId: "org-1",
      requestId: "request-1",
      format: "pdf",
    });

    expect(authorContext.getAccessContext).toHaveBeenCalledWith({
      userId: authorId,
      organizationId: "org-1",
      requestId: "request-1",
    });
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ author: "Ana Lima" }));
    expect(render).not.toHaveBeenCalledWith(expect.objectContaining({ author: authorId }));
  });

  it("mantém exportação com autoria genérica quando consulta de nome falha", async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from("%PDF-1.3"));
    const service = new ReportExportService(
      {
        getForExport: vi.fn().mockResolvedValue({
          snapshot: { id: "snapshot-1", created_at: new Date("2026-08-26T12:00:00.000Z") },
          job: {
            id: "job-1",
            report_model_version_id: "version-1",
            requester_id: "author-1",
          },
          rows: [{ name: "Ana" }],
        }),
        assertExportable: vi.fn().mockResolvedValue(undefined),
      } as never,
      { pdf: { format: "pdf", contentType: "application/pdf", render } } as never,
      { record: vi.fn() } as never,
      undefined,
      undefined,
      { getAccessContext: vi.fn().mockRejectedValue(new Error("user-service indisponível")) },
    );

    await expect(
      service.export({
        snapshotId: "snapshot-1",
        userId: "downloader-1",
        organizationId: "org-1",
        requestId: "request-1",
        format: "pdf",
      }),
    ).resolves.toMatchObject({ contentType: "application/pdf" });

    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ author: "Usuário não identificado" }),
    );
    expect(render).not.toHaveBeenCalledWith(expect.objectContaining({ author: "author-1" }));
  });

  it("revalida o departamento atual para snapshots de modelos compartilhados", async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from("%PDF-1.3"));
    const snapshotService = {
      getForExport: vi.fn().mockResolvedValue({
        snapshot: { id: "snapshot-1", created_at: new Date("2026-08-26T12:00:00.000Z") },
        job: { id: "job-1", report_model_version_id: "version-1" },
        rows: [{ name: "Ana" }],
      }),
      assertExportable: vi.fn().mockResolvedValue(undefined),
    };
    const jobs = {
      getVersion: vi.fn().mockResolvedValue({
        version: { definition_json: { sources: ["source"], columns: [] } },
        model: { created_by_user_id: null, department_id: "department-1" },
      }),
    };
    const authorization = {
      validateSharedDefinition: vi.fn().mockResolvedValue({ department_id: "department-1" }),
    };
    const service = new ReportExportService(
      snapshotService as never,
      { pdf: { format: "pdf", contentType: "application/pdf", render } } as never,
      { record: vi.fn() } as never,
      jobs as never,
      authorization as never,
    );

    await expect(
      service.export({
        snapshotId: "snapshot-1",
        userId: "user-1",
        organizationId: "org-1",
        requestId: "request-1",
        format: "pdf",
      }),
    ).resolves.toMatchObject({ contentType: "application/pdf" });

    expect(jobs.getVersion).toHaveBeenCalledWith({
      organizationId: "org-1",
      modelVersionId: "version-1",
      includeEphemeral: true,
    });
    expect(authorization.validateSharedDefinition).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
      requestId: "request-1",
      definition: expect.anything(),
    });
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "shared",
        departmentId: "department-1",
      }),
    );
    expect(snapshotService.assertExportable).toHaveBeenCalledWith({
      snapshotId: "snapshot-1",
      userId: "user-1",
      organizationId: "org-1",
      allowShared: true,
    });
  });

  it("mantém snapshot pessoal restrito ao requester no wiring com autorização compartilhada", async () => {
    const render = vi.fn();
    const validateSharedDefinition = vi.fn();
    const assertExportable = vi.fn();
    const service = new ReportExportService(
      {
        getForExport: vi.fn().mockResolvedValue({
          snapshot: { id: "snapshot-1", created_at: new Date() },
          job: {
            id: "job-1",
            report_model_version_id: "version-1",
            requester_id: "author-1",
          },
          rows: [{ name: "Ana" }],
        }),
        assertExportable,
      } as never,
      { csv: { render } } as never,
      { record: vi.fn() } as never,
      {
        getVersion: vi.fn().mockResolvedValue({
          version: { definition_json: { sources: ["source"], columns: [] } },
          model: { created_by_user_id: "author-1", department_id: null },
        }),
      } as never,
      { validateSharedDefinition } as never,
    );

    await expect(
      service.export({
        snapshotId: "snapshot-1",
        userId: "member-1",
        organizationId: "org-1",
        requestId: "request-personal-owner",
        format: "csv",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(validateSharedDefinition).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(assertExportable).not.toHaveBeenCalled();
  });

  it("cria uma resposta nova em cada tentativa de exportação", async () => {
    const render = vi.fn().mockImplementation(() => Buffer.from("Nome\r\nAna\r\n"));
    const service = new ReportExportService(
      {
        getForExport: vi.fn().mockResolvedValue({
          snapshot: { id: "snapshot-1", created_at: new Date() },
          job: { id: "job-1", report_model_version_id: "version-1" },
          rows: [],
        }),
        assertExportable: vi.fn().mockResolvedValue(undefined),
      } as never,
      {
        csv: { render },
      },
      { record: vi.fn() } as never,
    );

    const input = {
      snapshotId: "snapshot-1",
      userId: "user-1",
      organizationId: "org-1",
      requestId: "request-1",
      format: "csv" as const,
    };
    const first = await service.export(input);
    const second = await service.export(input);

    expect(first.body).not.toBe(second.body);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("rejects export when the snapshot expires during rendering and audits the failure", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn().mockReturnValue(Buffer.from("Name\r\nAna\r\n"));
    const snapshotService = {
      getForExport: vi.fn().mockResolvedValue({
        snapshot: { id: "snapshot-1", created_at: new Date() },
        job: { id: "job-1", report_model_version_id: "version-1" },
        rows: [{ name: "Ana" }],
      }),
      assertExportable: vi.fn().mockRejectedValue(new Error("snapshot expired")),
    };
    const service = new ReportExportService(
      snapshotService as never,
      { csv: { render } } as never,
      { record } as never,
    );

    await expect(
      service.export({
        snapshotId: "snapshot-1",
        userId: "user-1",
        organizationId: "org-1",
        requestId: "request-1",
        format: "csv",
      }),
    ).rejects.toThrow("snapshot expired");

    expect(snapshotService.assertExportable).toHaveBeenCalledWith({
      snapshotId: "snapshot-1",
      userId: "user-1",
      organizationId: "org-1",
      allowShared: false,
    });
    expect(render).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "report.export",
        job_id: "job-1",
        report_model_version_id: "version-1",
        format: "csv",
        result: "failure",
      }),
    );
    expect(record.mock.calls.map(([event]) => event.result)).toEqual(["failure"]);
  });

  it("audits snapshot lookup failures without sensitive data", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const snapshotService = {
      getForExport: vi.fn().mockImplementation(() => Promise.reject(new Error("rejected"))),
      assertExportable: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ReportExportService(
      snapshotService as never,
      { csv: { render: vi.fn() } } as never,
      { record } as never,
    );

    await expect(
      service.export({
        snapshotId: "snapshot-1",
        userId: "user-1",
        organizationId: "org-1",
        requestId: "request-1",
        format: "csv",
      }),
    ).rejects.toThrow("rejected");

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "report.export",
        format: "csv",
        result: "failure",
      }),
    );
    expect(record.mock.calls[0]?.[0]).not.toHaveProperty("error");
  });
});
