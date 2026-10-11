import { csvLine } from "@workspace/shared";

import { brl, formatCents, parseCents } from "./documentConferenceService.js";
import {
  dropIdenticalCopies,
  isAuthorizedProtocol,
  type NfeFile,
  readNfeArchive,
} from "./nfeXml.js";

/**
 * Totais de IPI e ICMS ST a partir de XML NF-e (FIS-12): soma em centavos inteiros os valores
 * dos itens (vIPI e vICMSST) e mostra a composição por nota e item. XML inválido, duplicado com
 * conteúdo diferente ou não autorizado fica fora da soma e aparece no resultado. Nada é gravado.
 */

export interface TaxItem {
  number: string;
  code: string;
  description: string;
  ipi: string | null;
  icms_st: string | null;
}

export interface TaxNote {
  entry: string;
  identity: string;
  access_key: string | null;
  ipi: string;
  icms_st: string;
  declared_ipi: string | null;
  declared_icms_st: string | null;
  /** Soma dos itens diferente do total declarado no ICMSTot. */
  differences: string[];
  /** Ex.: XML sem protocolo de autorização (somado, mas sem confirmação). */
  warnings: string[];
  items: TaxItem[];
}

export interface XmlTaxTotalsResult {
  status: "complete" | "partial";
  sources: { xml: { file_name: string; entries: number; nfe_entries: number } };
  totals: { ipi: string; icms_st: string; notes: number; items: number };
  notes: TaxNote[];
  excluded: { identity: string; entries: string[]; reason: string }[];
  discarded: { entry: string; reason: string }[];
  errors: { entry: string; message: string }[];
}

const cents = (value: string | null) => (value === null ? 0 : (parseCents(value) ?? 0));
const sum = (values: (string | null)[]) => values.reduce((total, value) => total + cents(value), 0);

function taxNote(note: NfeFile): TaxNote {
  const items = note.items.map(({ number, code, description, ipi, icms_st }) => ({
    number,
    code,
    description,
    ipi,
    icms_st,
  }));
  const ipi = formatCents(sum(items.map((item) => item.ipi)));
  const icmsSt = formatCents(sum(items.map((item) => item.icms_st)));
  const differences: string[] = [];
  if (note.declared_ipi !== null && note.declared_ipi !== ipi) {
    differences.push(`IPI: itens ${ipi} × total declarado ${note.declared_ipi}`);
  }
  if (note.declared_icms_st !== null && note.declared_icms_st !== icmsSt) {
    differences.push(`ICMS ST: itens ${icmsSt} × total declarado ${note.declared_icms_st}`);
  }
  return {
    entry: note.entry,
    identity: note.identity,
    access_key: note.access_key,
    ipi,
    icms_st: icmsSt,
    declared_ipi: note.declared_ipi,
    declared_icms_st: note.declared_icms_st,
    differences,
    warnings: note.protocol_status === null ? ["XML sem protocolo de autorização"] : [],
    items,
  };
}

export function sumXmlTaxes(input: { file_name: string; zip_base64: string }): XmlTaxTotalsResult {
  const archive = readNfeArchive(input.zip_base64);
  const { notes, copies } = dropIdenticalCopies(archive.notes);
  const cancelledBy = new Map(
    archive.cancellations.map((event) => [event.access_key, event.entry]),
  );
  const errors = [...archive.errors];

  const byIdentity = new Map<string, NfeFile[]>();
  for (const note of notes)
    byIdentity.set(note.identity, [...(byIdentity.get(note.identity) ?? []), note]);

  const included: TaxNote[] = [];
  const excluded: XmlTaxTotalsResult["excluded"] = [];
  let duplicated = 0;
  for (const [identity, versions] of byIdentity) {
    const [note] = versions;
    if (!note) continue;
    if (versions.length > 1) {
      duplicated += 1;
      excluded.push({
        identity,
        entries: versions.map((version) => version.entry),
        reason: "XML repetido com dados da nota diferentes; nenhuma versão foi somada.",
      });
    } else if (note.tax_errors.length > 0) {
      // Valor de imposto ilegível: somar daria total errado, então a nota sai como erro.
      errors.push({ entry: note.entry, message: note.tax_errors.join(" ") });
    } else if (note.access_key && cancelledBy.has(note.access_key)) {
      excluded.push({
        identity,
        entries: [note.entry],
        reason: `Cancelada pelo evento ${cancelledBy.get(note.access_key)}; não somada.`,
      });
    } else if (note.protocol_status && !isAuthorizedProtocol(note.protocol_status)) {
      excluded.push({
        identity,
        entries: [note.entry],
        reason: `Protocolo com cStat ${note.protocol_status} (não autorizada); não somada.`,
      });
    } else {
      included.push(taxNote(note));
    }
  }

  // XML inválido ou duplicado pode esconder imposto: o total não pode parecer completo.
  const incomplete = errors.length + duplicated > 0 || notes.length === 0;
  return {
    status: incomplete ? "partial" : "complete",
    sources: {
      xml: { file_name: input.file_name, entries: archive.entries, nfe_entries: notes.length },
    },
    totals: {
      ipi: formatCents(included.reduce((total, note) => total + cents(note.ipi), 0)),
      icms_st: formatCents(included.reduce((total, note) => total + cents(note.icms_st), 0)),
      notes: included.length,
      items: included.reduce((total, note) => total + note.items.length, 0),
    },
    notes: included,
    excluded,
    discarded: [...archive.discarded, ...copies],
    errors,
  };
}

/** CSV: totais, cada nota somada seguida dos seus itens, depois exclusões, erros e descartes. */
export function xmlTaxTotalsCsvExport(result: XmlTaxTotalsResult) {
  type Line = string[];
  const empty = ["", "", "", "", "", "", "", "", ""];
  const lines: Line[] = [
    [
      "Nível",
      "Situação",
      "Identidade",
      "Arquivo",
      "Item",
      "Descrição",
      "IPI",
      "ICMS ST",
      "Observação",
    ],
  ];
  if (result.status === "partial") {
    const line = [...empty];
    line[0] = "Resultado";
    line[1] = "Total parcial: há XML inválido, duplicado ou ZIP sem NF-e fora da soma";
    lines.push(line);
  }
  lines.push([
    "Totais",
    "",
    "",
    "",
    "",
    "",
    brl(result.totals.ipi),
    brl(result.totals.icms_st),
    `${result.totals.notes} nota(s) e ${result.totals.items} item(ns) somados`,
  ]);
  for (const note of result.notes) {
    lines.push([
      "Nota",
      "Somada",
      note.identity,
      note.entry,
      "",
      "",
      brl(note.ipi),
      brl(note.icms_st),
      [...note.differences, ...note.warnings].join(" | "),
    ]);
    for (const item of note.items) {
      lines.push([
        "Item",
        "Somado",
        note.identity,
        note.entry,
        item.number,
        item.description || item.code,
        brl(item.ipi),
        brl(item.icms_st),
        "",
      ]);
    }
  }
  for (const item of result.excluded) {
    lines.push([
      "Nota",
      "Excluída",
      item.identity,
      item.entries.join(" | "),
      "",
      "",
      "",
      "",
      item.reason,
    ]);
  }
  for (const item of result.errors) {
    lines.push(["Arquivo", "Erro", "", item.entry, "", "", "", "", item.message]);
  }
  for (const item of result.discarded) {
    lines.push(["Arquivo", "Descartado", "", item.entry, "", "", "", "", item.reason]);
  }
  return {
    file_name: "totais-ipi-icms-st.csv",
    csv: `﻿${lines.map((line) => csvLine(line, ";")).join("\r\n")}\r\n`,
  };
}
