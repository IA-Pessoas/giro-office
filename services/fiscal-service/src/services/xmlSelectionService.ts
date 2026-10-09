import { createZip, csvLine } from "@workspace/shared";

import { identityFromAccessKey, isValidAccessKey, stripZeros } from "./accessKey.js";
import { type NfeIdentity, parseNfeXml } from "./nfeXml.js";
import { readZipArchive } from "./safeZipReader.js";

/**
 * Seleção de XML em ZIP (FIS-09): a equipe informa notas e recebe só os XML correspondentes, num
 * ZIP com o relatório. Pedido que casa com mais de uma nota, ou com cópias diferentes da mesma
 * nota, fica ambíguo e não entra no ZIP. Nada é gravado.
 */

export interface XmlSelectionInput {
  file_name: string;
  zip_base64: string;
  requests: string[];
}

interface NoteFile extends NfeIdentity {
  entry: string;
  body: Buffer;
  content: string;
}

type Criteria =
  | { key: string }
  | { issuer?: string; model?: string; series?: string; number: string };

export interface XmlSelectionResult {
  status: "complete" | "partial";
  file_name: string;
  zip_base64: string | null;
  csv: string;
  selected: { request: string; entry: string; identity: string; access_key: string | null }[];
  ambiguous: {
    request: string;
    reason: string;
    candidates: { entry: string; identity: string }[];
  }[];
  not_found: { request: string }[];
  invalid_requests: { request: string; reason: string }[];
  repeated_requests: string[];
  archive: {
    file_name: string;
    entries: number;
    nfe_entries: number;
    discarded: { entry: string; reason: string }[];
    errors: { entry: string; message: string }[];
    duplicates: { identity: string; entries: string[]; identical: boolean }[];
  };
}

const FORMAT_HINT =
  "Use a chave de acesso (44 dígitos) ou número, série;número, emitente;série;número ou emitente;modelo;série;número.";

function parseRequest(request: string): Criteria | string {
  const compact = request.replace(/\s/g, "");
  if (/^\d{44}$/u.test(compact)) {
    return isValidAccessKey(compact) ? { key: compact } : "Chave de acesso inválida.";
  }
  const parts = request.split(";").map((part) => part.trim());
  const issuerPart = parts.length >= 3 ? parts[0]?.replace(/\D/g, "") : undefined;
  const numeric = parts.slice(issuerPart === undefined ? 0 : 1);
  if (
    parts.length > 4 ||
    (issuerPart !== undefined && issuerPart.length !== 11 && issuerPart.length !== 14) ||
    !numeric.every((part) => /^\d{1,9}$/u.test(part))
  ) {
    return FORMAT_HINT;
  }
  const [number = "", series, model] = [...numeric].reverse();
  return {
    number: stripZeros(number),
    ...(series === undefined ? {} : { series: stripZeros(series) }),
    ...(model === undefined ? {} : { model: stripZeros(model).padStart(2, "0") }),
    ...(issuerPart === undefined ? {} : { issuer: issuerPart.padStart(14, "0") }),
  };
}

function matches(note: NoteFile, criteria: Criteria): boolean {
  if ("key" in criteria) {
    return note.access_key
      ? note.access_key === criteria.key
      : note.identity === identityFromAccessKey(criteria.key);
  }
  return (
    note.number === criteria.number &&
    (criteria.series === undefined || note.series === criteria.series) &&
    (criteria.model === undefined || note.model === criteria.model) &&
    (criteria.issuer === undefined || note.issuer === criteria.issuer)
  );
}

const outputName = (note: NoteFile) =>
  `${note.access_key ?? note.identity.replace(/\|/g, "-")}.xml`;

export function selectXmlFromZip(input: XmlSelectionInput): XmlSelectionResult {
  const archive = readZipArchive(Buffer.from(input.zip_base64, "base64"));
  const notes: NoteFile[] = [];
  const discarded: XmlSelectionResult["archive"]["discarded"] = [];
  const errors = [...archive.errors];
  for (const { name, body } of archive.entries) {
    if (!name.toLowerCase().endsWith(".xml")) {
      discarded.push({ entry: name, reason: "Não é arquivo .xml." });
      continue;
    }
    const parsed = parseNfeXml(body.toString("utf8"));
    if (parsed.kind === "nfe") {
      const { kind: _kind, ...note } = parsed;
      notes.push({ ...note, entry: name, body });
    } else if (parsed.kind === "other") discarded.push({ entry: name, reason: parsed.message });
    else errors.push({ entry: name, message: parsed.message });
  }

  const byIdentity = new Map<string, NoteFile[]>();
  for (const note of notes)
    byIdentity.set(note.identity, [...(byIdentity.get(note.identity) ?? []), note]);
  const duplicates = [...byIdentity.entries()]
    .filter(([, copies]) => copies.length > 1)
    .map(([identity, copies]) => ({
      identity,
      entries: copies.map((note) => note.entry),
      // Mesma infNFe = mesma nota, ainda que uma cópia traga o protocolo (nfeProc) e a outra não.
      identical: copies.every((note) => note.content === copies[0]?.content),
    }));
  const identicalCopies = new Map(duplicates.map((item) => [item.identity, item.identical]));

  const result: Omit<XmlSelectionResult, "status" | "zip_base64" | "csv"> = {
    file_name: "xml-selecionados.zip",
    selected: [],
    ambiguous: [],
    not_found: [],
    invalid_requests: [],
    repeated_requests: [],
    archive: {
      file_name: input.file_name,
      entries: archive.entries.length + archive.errors.length,
      nfe_entries: notes.length,
      discarded,
      errors,
      duplicates,
    },
  };
  const chosen = new Map<string, NoteFile>();
  const seenRequests = new Set<string>();

  for (const raw of input.requests) {
    const request = raw.trim();
    if (!request) continue;
    const criteria = parseRequest(request);
    if (typeof criteria === "string") {
      result.invalid_requests.push({ request, reason: criteria });
      continue;
    }
    const signature = JSON.stringify(criteria);
    if (seenRequests.has(signature)) {
      result.repeated_requests.push(request);
      continue;
    }
    seenRequests.add(signature);

    const found = notes.filter((note) => matches(note, criteria));
    const identities = new Set(found.map((note) => note.identity));
    const candidates = found.map((note) => ({ entry: note.entry, identity: note.identity }));
    const [note] = found;
    if (!note) {
      result.not_found.push({ request });
    } else if (identities.size > 1) {
      result.ambiguous.push({
        request,
        reason: "Mais de uma nota com este número; informe emitente, série ou a chave de acesso.",
        candidates,
      });
    } else if (identicalCopies.get(note.identity) === false) {
      result.ambiguous.push({
        request,
        reason: "XML repetido no ZIP com dados da nota (infNFe) diferentes.",
        candidates,
      });
    } else {
      chosen.set(note.identity, note);
      result.selected.push({
        request,
        entry: note.entry,
        identity: note.identity,
        access_key: note.access_key,
      });
    }
  }

  const complete =
    result.ambiguous.length +
      result.not_found.length +
      result.invalid_requests.length +
      errors.length ===
    0;
  const csv = renderSelectionCsv(result, complete);
  const zip =
    chosen.size > 0
      ? createZip([
          ...[...chosen.values()].map((note) => ({ fileName: outputName(note), body: note.body })),
          { fileName: "relatorio-selecao.csv", body: Buffer.from(csv, "utf8") },
        ]).toString("base64")
      : null;
  return { status: complete ? "complete" : "partial", zip_base64: zip, csv, ...result };
}

function renderSelectionCsv(
  result: Omit<XmlSelectionResult, "status" | "zip_base64" | "csv">,
  complete: boolean,
): string {
  const lines: (string | null)[][] = [
    ["Situação", "Pedido", "Arquivo(s)", "Identidade", "Chave de acesso", "Observação"],
  ];
  if (!complete) {
    lines.push([
      "Resultado",
      "Seleção parcial: há pedidos sem XML ou arquivos com erro",
      "",
      "",
      "",
      "",
    ]);
  }
  lines.push([
    "Totais",
    "",
    "",
    "",
    "",
    `${result.selected.length} selecionada(s), ${result.ambiguous.length} ambígua(s), ${result.not_found.length} não encontrada(s), ${result.invalid_requests.length} pedido(s) inválido(s), ${result.archive.errors.length} erro(s) e ${result.archive.discarded.length} descarte(s) no ZIP`,
  ]);
  for (const item of result.selected) {
    lines.push(["Selecionada", item.request, item.entry, item.identity, item.access_key, ""]);
  }
  for (const item of result.ambiguous) {
    lines.push([
      "Ambígua",
      item.request,
      item.candidates.map((candidate) => candidate.entry).join(", "),
      [...new Set(item.candidates.map((candidate) => candidate.identity))].join(", "),
      "",
      item.reason,
    ]);
  }
  for (const item of result.not_found) lines.push(["Não encontrada", item.request, "", "", "", ""]);
  for (const item of result.invalid_requests) {
    lines.push(["Pedido inválido", item.request, "", "", "", item.reason]);
  }
  for (const request of result.repeated_requests) {
    lines.push(["Pedido repetido", request, "", "", "", "Já atendido por um pedido anterior"]);
  }
  for (const item of result.archive.errors)
    lines.push(["Erro no ZIP", "", item.entry, "", "", item.message]);
  for (const item of result.archive.discarded)
    lines.push(["Descartado", "", item.entry, "", "", item.reason]);
  for (const item of result.archive.duplicates) {
    lines.push([
      "XML repetido",
      "",
      item.entries.join(", "),
      item.identity,
      "",
      item.identical ? "Cópias idênticas" : "Cópias com conteúdo diferente",
    ]);
  }
  return `﻿${lines.map((line) => csvLine(line, ";")).join("\r\n")}\r\n`;
}
