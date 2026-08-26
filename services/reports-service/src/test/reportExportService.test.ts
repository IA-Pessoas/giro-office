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
        rows: [{ name: "Ana", secret: "não exporte" }],
      }),
    ).toEqual(Buffer.from("Nome\r\nAna\r\n"));
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
  it("reauthoriza o snapshot, exporta seus dados e audita somente metadados seguros", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn().mockReturnValue(Buffer.from("Nome\r\nAna\r\n"));
    const snapshotService = {
      getForExport: vi.fn().mockResolvedValue({
        snapshot: { id: "snapshot-1", created_at: new Date("2026-08-26T12:00:00.000Z") },
        job: { id: "job-1", report_model_version_id: "version-1" },
        rows: [{ name: "Ana", secret: "não exporte" }],
      }),
    };
    const authorizationService = {
      validateDefinition: vi.fn().mockResolvedValue({
        definition: { columns: [{ alias: "name" }] },
      }),
    };
    const service = new ReportExportService(
      snapshotService as never,
      {
        getVersion: vi.fn().mockResolvedValue({
          model: { created_by_user_id: "user-1" },
          version: { definition_json: { columns: [{ alias: "name" }] } },
        }),
      } as never,
      authorizationService as never,
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
      fileName: "report-job-1.csv",
      body: Buffer.from("Nome\r\nAna\r\n"),
    });

    expect(snapshotService.getForExport).toHaveBeenCalledWith({
      snapshotId: "snapshot-1",
      userId: "user-1",
      organizationId: "org-1",
    });
    expect(authorizationService.validateDefinition).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledWith({
      columns: [{ key: "name", label: "name" }],
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
      } as never,
      {
        getVersion: vi.fn().mockResolvedValue({
          model: { created_by_user_id: "user-1" },
          version: { definition_json: { columns: [{ alias: "name" }] } },
        }),
      } as never,
      {
        validateDefinition: vi
          .fn()
          .mockResolvedValue({ definition: { columns: [{ alias: "name" }] } }),
      } as never,
      { csv: { render } } as never,
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
});
