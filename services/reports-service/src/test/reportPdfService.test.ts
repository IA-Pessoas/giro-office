import { describe, expect, it } from "vitest";
import { ReportLetterheadService } from "../services/reportLetterheadService.js";
import {
  type PdfDocumentLike,
  type PdfDocumentOptions,
  REPORT_PDF_CONTENT_TYPE,
  REPORT_PDF_FORMAT,
  ReportPdfService,
} from "../services/reportPdfService.js";

class FakePdfDocument implements PdfDocumentLike {
  readonly calls: string[] = [];
  readonly textPositions: Array<{ value: string; x: number; y: number }> = [];
  private readonly listeners = new Map<string, Array<(value?: unknown) => void>>();

  on(event: string, listener: (value?: unknown) => void): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  image(
    _source: Buffer,
    _x: number,
    _y: number,
    _options: { width: number; height: number },
  ): this {
    this.calls.push("image");
    return this;
  }

  fillColor(_color: string): this {
    this.calls.push("fillColor");
    return this;
  }

  rect(_x: number, _y: number, _width: number, _height: number): this {
    this.calls.push("rect");
    return this;
  }

  fill(): this {
    this.calls.push("fill");
    return this;
  }

  fontSize(_size: number): this {
    this.calls.push("fontSize");
    return this;
  }

  text(value: string, x: number, y: number, _options?: Record<string, unknown>): this {
    this.calls.push(`text:${value}`);
    this.textPositions.push({ value, x, y });
    return this;
  }

  moveTo(_x: number, _y: number): this {
    this.calls.push("moveTo");
    return this;
  }

  lineTo(_x: number, _y: number): this {
    this.calls.push("lineTo");
    return this;
  }

  stroke(): this {
    this.calls.push("stroke");
    return this;
  }

  addPage(_options?: PdfDocumentOptions): this {
    this.calls.push("addPage");
    return this;
  }

  end(): void {
    for (const listener of this.listeners.get("data") ?? []) listener(Buffer.from("%PDF"));
    for (const listener of this.listeners.get("end") ?? []) listener();
  }
}

describe("ReportPdfService", () => {
  it("expõe o renderer como formato PDF para o contrato comum de exportação", () => {
    const service = new ReportPdfService({ select: async () => ({ kind: "institutional" }) });

    expect(service.format).toBe(REPORT_PDF_FORMAT);
    expect(service.contentType).toBe(REPORT_PDF_CONTENT_TYPE);
  });

  it("renderiza A4, desenha o fundo antes do conteúdo e segue a apresentação", async () => {
    const document = new FakePdfDocument();
    const service = new ReportPdfService(
      {
        select: async () => ({
          kind: "organization",
          bytes: Buffer.from("PNG"),
          sha256: "verified",
          warning: undefined,
        }),
      } as never,
      () => document,
    );

    const body = await service.render({
      author: "Ana",
      generatedAt: new Date("2026-08-27T15:04:05.000Z"),
      organizationId: "org-1",
      scope: "personal",
      presentation_json: {
        title: "Resumo",
        columns: [
          { key: "amount", label: "Valor", format: "number" },
          { key: "name", label: "Nome", format: "text" },
        ],
      },
      rows: [{ name: "Ana", amount: 12.5, secret: "não exporte" }],
    });

    expect(body).toEqual(Buffer.from("%PDF"));
    expect(document.calls.indexOf("image")).toBeLessThan(
      document.calls.findIndex((call) => call.startsWith("text:")),
    );
    expect(document.calls).toContain("text:Valor");
    expect(document.calls).toContain("text:Nome");
    expect(document.calls).toContain("text:12,5");
    expect(document.calls).not.toContain("text:não exporte");
  });

  it("desenha o fallback institucional antes do cabeçalho e não expõe IDs no texto", async () => {
    const document = new FakePdfDocument();
    const service = new ReportPdfService(
      {
        select: async () => ({
          kind: "institutional",
          bytes: undefined,
          sha256: undefined,
          warning: "Timbrado aprovado ausente; usando fallback institucional.",
        }),
      } as never,
      () => document,
    );

    await service.render({
      author: "Ana",
      generatedAt: new Date("2026-08-27T15:04:05.000Z"),
      organizationId: "org-secret",
      scope: "shared",
      departmentId: "department-secret",
      presentation_json: { columns: [{ key: "name", label: "Nome" }] },
      rows: [{ name: "Relatório" }],
    });

    expect(document.calls.indexOf("rect")).toBeLessThan(
      document.calls.findIndex((call) => call.startsWith("text:Autor:")),
    );
    expect(document.calls.some((call) => call.includes("org-secret"))).toBe(false);
    expect(document.calls.some((call) => call.includes("department-secret"))).toBe(false);
  });

  it("mantém títulos e estados vazios de cada bloco no mesmo PDF", async () => {
    const document = new FakePdfDocument();
    const service = new ReportPdfService(
      { select: async () => ({ kind: "institutional" }) },
      () => document,
    );

    await service.render({
      author: "Ana",
      generatedAt: new Date("2026-08-27T15:04:05.000Z"),
      organizationId: "org-1",
      scope: "personal",
      presentation_json: { columns: [{ key: "name", label: "Nome" }] },
      rows: [],
      blocks: [
        {
          title: "Projetos",
          presentation_json: { columns: [{ key: "name", label: "Nome" }] },
          rows: [{ name: "Ana" }],
        },
        {
          title: "Clientes",
          presentation_json: { columns: [{ key: "name", label: "Nome" }] },
          rows: [],
        },
      ],
    });

    expect(document.calls).toContain("text:Projetos");
    expect(document.calls).toContain("text:Clientes");
    expect(document.calls).toContain("text:Nenhum registro encontrado nesta área.");
    expect(document.calls).toContain("text:Ana");

    const projectRow = document.textPositions.find((entry) => entry.value === "Ana");
    const clientTitle = document.textPositions.find((entry) => entry.value === "Clientes");
    expect(projectRow).toBeDefined();
    expect(clientTitle).toBeDefined();
    expect(clientTitle?.y).toBeGreaterThan((projectRow?.y ?? 0) + 18);
  });

  it("inicia o próximo bloco em nova página quando não há espaço suficiente", async () => {
    const document = new FakePdfDocument();
    const service = new ReportPdfService(
      { select: async () => ({ kind: "institutional" }) },
      () => document,
    );

    await service.render({
      author: "Ana",
      generatedAt: new Date("2026-08-27T15:04:05.000Z"),
      organizationId: "org-1",
      scope: "personal",
      presentation_json: { columns: [{ key: "name", label: "Nome" }] },
      rows: [],
      blocks: [
        {
          title: "Projetos",
          presentation_json: { columns: [{ key: "name", label: "Nome" }] },
          rows: Array.from({ length: 36 }, (_, index) => ({ name: `Projeto ${index + 1}` })),
        },
        {
          title: "Clientes",
          presentation_json: { columns: [{ key: "name", label: "Nome" }] },
          rows: [{ name: "Bia" }],
        },
      ],
    });

    expect(document.calls.filter((call) => call === "addPage")).toHaveLength(1);
    expect(document.textPositions.find((entry) => entry.value === "Clientes")?.y).toBe(110);
    expect(document.textPositions.find((entry) => entry.value === "Bia")?.y).toBe(152);
  });

  it("gera bytes PDFKit A4 em memória com metadados permitidos", async () => {
    const service = new ReportPdfService(new ReportLetterheadService([]));

    const body = await service.render({
      author: "Ana",
      generatedAt: new Date("2026-08-27T15:04:05.000Z"),
      organizationId: "org-secret",
      scope: "personal",
      presentation_json: { columns: [{ key: "name", label: "Nome" }] },
      rows: [{ name: "Relatório" }],
    });

    expect(body.subarray(0, 8).toString("ascii")).toBe("%PDF-1.3");
    expect(body.toString("latin1")).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(body.toString("latin1")).toContain("Ana");
    expect(body.toString("latin1")).not.toContain("org-secret");
    expect(body.subarray(-6).toString("ascii")).toBe("%%EOF\n");
  });
});
