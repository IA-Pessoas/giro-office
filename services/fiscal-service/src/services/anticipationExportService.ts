/// <reference path="../pdfkitStandalone.d.ts" />
import { csvLine } from "@workspace/shared";
import PdfDocument from "pdfkit/js/pdfkit.standalone.js";

import type {
  AnticipationBatchStatus,
  AnticipationClassification,
  AnticipationCorrectableField,
} from "../schemas/anticipation.schemas.js";
import type { AnticipationBatchDetailDto, AnticipationItemDto } from "./anticipationService.js";

/**
 * Demonstrativo manual de antecipações (FIS-18, RF-13): CSV e PDF do mesmo lote, com cada valor
 * identificado pela origem (XML, corrigido na revisão ou informado manualmente). Não apura imposto.
 */

export interface AnticipationDemonstrative {
  batch: AnticipationBatchDetailDto;
  client: { name: string; document: string };
  /** Nome por id de usuário (responsável e conferente). */
  people: Record<string, string>;
}

export type AnticipationExportFormat = "csv" | "pdf";

export const ANTICIPATION_DECLARATION =
  "Demonstrativo manual: não houve apuração automática de imposto nem emissão de guia oficial.";

const DELIMITER = ";";
const STATUS_LABELS: Record<AnticipationBatchStatus, string> = {
  pending_review: "Em classificação",
  awaiting_check: "Aguardando conferência",
  checked: "Conferido",
};
const CLASSIFICATION_LABELS: Record<AnticipationClassification, string> = {
  partial: "Parcial",
  total: "Total",
  freight: "Frete",
};
const FIELDS: { field: AnticipationCorrectableField; label: string; money: boolean }[] = [
  { field: "ncm", label: "NCM", money: false },
  { field: "cfop", label: "CFOP", money: false },
  { field: "quantity", label: "Quantidade", money: false },
  { field: "value", label: "Valor", money: true },
  { field: "ipi", label: "IPI", money: true },
  { field: "icms_st", label: "ICMS ST", money: true },
];

const competenceLabel = (competence: string) =>
  `${competence.slice(5, 7)}/${competence.slice(0, 4)}`;
const decimal = (value: string | null) => (value === null ? "" : value.replace(".", ","));
const money = (value: string | null) => (value === null ? "—" : `R$ ${decimal(value)}`);
const person = (demonstrative: AnticipationDemonstrative, id: string | null) =>
  id ? (demonstrative.people[id] ?? id) : "não designado";
const classification = (item: AnticipationItemDto) =>
  item.classification ? CLASSIFICATION_LABELS[item.classification] : "Sem classificação";

/** Valor final de um campo e de onde veio: a correção da revisão prevalece sobre o XML. */
function fieldValue(item: AnticipationItemDto, field: AnticipationCorrectableField) {
  const corrected = item.corrections[field];
  return corrected === undefined
    ? { value: item[field], origin: "XML" as const, xml: item[field] }
    : { value: corrected, origin: "Corrigido" as const, xml: item[field] };
}

export function anticipationDemonstrativeHeaders(
  demonstrative: AnticipationDemonstrative,
  format: AnticipationExportFormat,
): Record<string, string> {
  const { batch } = demonstrative;
  return {
    "Content-Type": format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="antecipacoes-${batch.competence}-${batch.id}.${format}"`,
    "Cache-Control": "no-store",
  };
}

/** Cabeçalho do lote, declaração e uma linha por item; decimais com vírgula e BOM para o Excel. */
export function renderAnticipationCsv(demonstrative: AnticipationDemonstrative): string {
  const { batch, client } = demonstrative;
  const line = (values: unknown[]) => csvLine(values, DELIMITER);
  const lines = [
    line(["Demonstrativo manual de antecipações"]),
    line(["Declaração", ANTICIPATION_DECLARATION]),
    line(["Cliente", client.name, client.document]),
    line(["Competência", competenceLabel(batch.competence)]),
    line(["Lote", batch.file_name, batch.id]),
    line(["Estado da revisão", STATUS_LABELS[batch.status]]),
    line([
      "Responsável",
      person(demonstrative, batch.responsible_id),
      "Conferente",
      person(demonstrative, batch.reviewer_id),
    ]),
    "",
    line([
      "Nota",
      "Série",
      "Emitente",
      "Item",
      "Chave de acesso",
      "Arquivo",
      "Código",
      "Descrição",
      "Classificação",
      ...FIELDS.flatMap(({ label }) => [label, `${label} - origem`, `${label} - XML`]),
      "Valor informado",
      "Valor informado - origem",
    ]),
    ...batch.items.map((item) =>
      line([
        item.note_number,
        item.series,
        item.issuer,
        item.item_number,
        item.access_key,
        item.entry,
        item.code,
        item.description,
        classification(item),
        ...FIELDS.flatMap(({ field }) => {
          const { value, origin, xml } = fieldValue(item, field);
          return [decimal(value), origin, decimal(xml)];
        }),
        decimal(item.manual_value),
        item.manual_value === null ? "" : "Informado manualmente",
      ]),
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

type TextOptions = { continued?: boolean };
type PdfDoc = {
  on(event: string, listener: (value: unknown) => void): PdfDoc;
  font(name: string): PdfDoc;
  fontSize(size: number): PdfDoc;
  text(value: string, options?: TextOptions): PdfDoc;
  moveDown(size?: number): PdfDoc;
  end(): void;
};

/** "NCM 22029900 (corrigido; XML 22030000)" ou "ICMS ST R$ 1,50 (XML)". */
function describeField(item: AnticipationItemDto, field: (typeof FIELDS)[number]): string {
  const { value, origin, xml } = fieldValue(item, field.field);
  const format = field.money ? money : (raw: string | null) => (raw ? decimal(raw) : "—");
  return origin === "XML"
    ? `${field.label} ${format(value)} (XML)`
    : `${field.label} ${format(value)} (corrigido; XML ${format(xml)})`;
}

export function renderAnticipationPdf(demonstrative: AnticipationDemonstrative): Promise<Buffer> {
  const { batch, client } = demonstrative;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    // Sem compressão: o texto fica legível no arquivo e os testes conferem o conteúdo.
    const doc = new (
      PdfDocument as new (options: {
        size: string;
        layout: string;
        margin: number;
        compress: boolean;
      }) => PdfDoc
    )({ size: "A4", layout: "landscape", margin: 40, compress: false });
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk as Uint8Array)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (error) => reject(error));

    doc.font("Helvetica-Bold").fontSize(16).text("Demonstrativo manual de antecipações");
    doc.font("Helvetica").fontSize(10).text(ANTICIPATION_DECLARATION);
    doc.moveDown(0.5);
    doc.text(`${client.name} - ${client.document}`);
    doc.text(`Competência ${competenceLabel(batch.competence)} · Lote ${batch.file_name}`);
    doc.text(`Estado da revisão: ${STATUS_LABELS[batch.status]}`);
    doc.text(`Responsável: ${person(demonstrative, batch.responsible_id)}`);
    doc.text(`Conferente: ${person(demonstrative, batch.reviewer_id)}`);
    doc.moveDown();

    for (const item of batch.items) {
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(`NF ${item.note_number} série ${item.series} item ${item.item_number}`, {
          continued: true,
        })
        .font("Helvetica")
        .text(` · ${classification(item)} · ${item.description || item.code}`);
      doc.fontSize(9);
      for (const field of FIELDS) doc.text(describeField(item, field));
      if (item.manual_value !== null) {
        doc.text(`Valor informado ${money(item.manual_value)} (informado manualmente)`);
      }
      doc.text(`Arquivo: ${item.entry} · chave ${item.access_key}`);
      doc.moveDown(0.5);
    }
    doc.end();
  });
}

/** Corpo e cabeçalhos do arquivo no formato pedido; Express e Worker respondem com isto. */
export async function renderAnticipationDemonstrative(
  demonstrative: AnticipationDemonstrative,
  format: AnticipationExportFormat,
): Promise<{ body: Uint8Array | string; headers: Record<string, string> }> {
  return {
    body:
      format === "pdf"
        ? new Uint8Array(await renderAnticipationPdf(demonstrative))
        : renderAnticipationCsv(demonstrative),
    headers: anticipationDemonstrativeHeaders(demonstrative, format),
  };
}
