import { csvLine, ServiceError } from "@workspace/shared";

import { identityFromAccessKey, isValidAccessKey, stripZeros } from "./accessKey.js";
import { brl, formatCents, pairByIdentity, parseCents } from "./documentConferenceService.js";
import {
  dropIdenticalCopies,
  type NfeFile,
  type NfeItem,
  normalizeDecimal,
  readNfeArchive,
} from "./nfeXml.js";

/**
 * Conferência SPED C100/C170 × XML NF-e (FIS-11): cada C170 pertence ao C100 que o antecede e só
 * é comparado com os itens da mesma nota. C170 sem C100 é erro, nunca item de outro documento.
 * Nada é gravado.
 */

export interface SpedItem {
  line: number;
  number: string;
  code: string;
  quantity: string | null;
  value: string | null;
  cfop: string;
}

export interface SpedDocument {
  line: number;
  identity: string;
  access_key: string | null;
  issuer: string;
  model: string;
  series: string;
  number: string;
  value: string | null;
  cod_sit: string;
  /** IND_EMIT 0: emissão própria (código e CFOP do item comparáveis com o XML). */
  own_issue: boolean;
  items: SpedItem[];
}

export interface XmlDocument {
  entry: string;
  identity: string;
  access_key: string | null;
  value: string | null;
  protocol_status: string | null;
  items: NfeItem[];
}

export interface ItemComparison {
  situation: "Coincidente" | "Divergente" | "Só SPED" | "Só XML" | "Duplicado";
  number: string;
  sped: SpedItem | null;
  xml: NfeItem | null;
  differences: string[];
  note: string;
}

interface DocumentPair {
  identity: string;
  match_key: "chave de acesso" | "emitente, modelo, série e número";
  sped: Omit<SpedDocument, "items">;
  xml: Omit<XmlDocument, "items">;
  differences: string[];
  /** false quando o SPED não traz C170 para a nota (ex.: emissão própria dispensada). */
  items_compared: boolean;
  items: ItemComparison[];
}

type Issue<T> = ({ source: "sped"; line: number } & T) | ({ source: "xml"; entry: string } & T);

export interface SpedConferenceResult {
  status: "complete" | "partial";
  identity_rule: string;
  sources: {
    sped: { file_name: string; lines: number; documents: number; items: number; period: string };
    xml: { file_name: string; entries: number; nfe_entries: number };
  };
  summary: {
    matched: number;
    divergent: number;
    only_sped: number;
    only_xml: number;
    duplicates: number;
    not_comparable: number;
    discarded: number;
    errors: number;
    items_matched: number;
    items_divergent: number;
    items_only_sped: number;
    items_only_xml: number;
    items_duplicates: number;
  };
  totals: {
    sped_documents: string;
    xml_documents: string;
    sped_items: string;
    xml_items: string;
  };
  matched: DocumentPair[];
  divergent: DocumentPair[];
  only_sped: SpedDocument[];
  only_xml: XmlDocument[];
  duplicates: { identity: string; sped: SpedDocument[]; xml: XmlDocument[] }[];
  not_comparable: { identity: string; reason: string; sped: SpedDocument[]; xml: XmlDocument[] }[];
  discarded: Issue<{ reason: string }>[];
  errors: Issue<{ message: string }>[];
}

const IDENTITY_RULE =
  "C100 × NF-e pela chave de acesso; sem chave, emitente (0000 na emissão própria ou 0150 do participante) + modelo + série + número. Itens C170 × det pelo número do item, só dentro da mesma nota.";

const NOT_COMPARABLE_SITUATIONS: Record<string, string> = {
  "02": "cancelado",
  "03": "cancelado extemporâneo",
  "04": "denegado",
  "05": "inutilizado",
};
const NFE_MODELS = new Set(["55", "65"]);
const AUTHORIZED_PROTOCOL = new Set(["100", "150"]);
const MIN_FIELDS: Record<string, number> = { "0000": 8, "0150": 6, C100: 12, C170: 11 };

const money = (raw: string | undefined) => {
  const cents = raw ? parseCents(raw) : null;
  return cents === null ? null : formatCents(cents);
};
const sum = (values: (string | null)[]) =>
  formatCents(values.reduce((total, value) => total + (value ? (parseCents(value) ?? 0) : 0), 0));

interface ParsedSped {
  documents: SpedDocument[];
  errors: { source: "sped"; line: number; message: string }[];
  discarded: { source: "sped"; line: number; reason: string }[];
  sawC100: boolean;
  lines: number;
  period: string;
}

function parseSped(content: string): ParsedSped {
  const raw = content.replace(/^﻿/u, "").split(/\r?\n/u);
  const errors: ParsedSped["errors"] = [];
  // fields null: linha recusada. Ela fecha o documento aberto, para nenhum C170 seguinte ir parar
  // no C100 anterior.
  const records: { line: number; fields: string[] | null }[] = [];
  let sawC100 = false;
  raw.forEach((text, index) => {
    const line = index + 1;
    if (text.trim() === "") return;
    const trimmed = text.trim();
    if (trimmed.startsWith("|C100|")) sawC100 = true;
    if (!/^\|[A-Z0-9]{4}\|/u.test(trimmed) || !trimmed.endsWith("|")) {
      errors.push({ source: "sped", line, message: "Linha fora do leiaute SPED (|REG|...|)." });
      records.push({ line, fields: null });
      return;
    }
    const fields = trimmed.slice(1, -1).split("|");
    const minimum = MIN_FIELDS[fields[0] ?? ""];
    if (minimum !== undefined && fields.length < minimum) {
      errors.push({
        source: "sped",
        line,
        message: `${fields[0]} com ${fields.length} campo(s); o leiaute pede ao menos ${minimum}.`,
      });
      records.push({ line, fields: null });
      return;
    }
    records.push({ line, fields });
  });

  const valid = records.flatMap(({ line, fields }) => (fields ? [{ line, fields }] : []));
  const opening = valid.find((record) => record.fields[0] === "0000")?.fields;
  if (opening && !(/^\d{8}$/u.test(opening[3] ?? "") && /^\d{8}$/u.test(opening[4] ?? ""))) {
    throw new ServiceError(
      400,
      "Arquivo SPED: registro 0000 fora do leiaute da EFD ICMS/IPI (DT_INI e DT_FIN nos campos 4 e 5).",
    );
  }
  const ownIssuer = (opening?.[6] || opening?.[7] || "").replace(/\D/g, "");
  const participants = new Map(
    valid
      .filter((record) => record.fields[0] === "0150")
      .map(({ fields }) => [fields[1] ?? "", (fields[4] || fields[5] || "").replace(/\D/g, "")]),
  );

  const documents: SpedDocument[] = [];
  const discarded: ParsedSped["discarded"] = [];
  let current: SpedDocument | null = null;
  let currentOpen = false;
  let rejectedLine = 0;
  for (const { line, fields } of records) {
    if (!fields) {
      current = null;
      currentOpen = true;
      rejectedLine = line;
      continue;
    }
    const reg = fields[0] ?? "";
    const fail = (message: string) => {
      errors.push({ source: "sped", line, message });
      rejectedLine = line;
    };
    if (reg === "C100") {
      current = null;
      currentOpen = true;
      const [
        ,
        ,
        indEmit = "",
        codPart = "",
        model = "",
        codSit = "",
        series = "",
        number = "",
        key = "",
      ] = fields;
      const ownIssue = indEmit === "0";
      let identity: Pick<SpedDocument, "access_key" | "issuer" | "model" | "series" | "number">;
      if (key) {
        if (!isValidAccessKey(key)) {
          fail("Chave de acesso inválida no C100.");
          continue;
        }
        const [issuer = "", keyModel = "", keySeries = "", keyNumber = ""] =
          identityFromAccessKey(key).split("|");
        if (
          (series && stripZeros(series) !== keySeries) ||
          (number && stripZeros(number) !== keyNumber)
        ) {
          fail("SER/NUM_DOC do C100 não conferem com a chave de acesso.");
          continue;
        }
        identity = {
          access_key: key,
          issuer,
          model: keyModel,
          series: keySeries,
          number: keyNumber,
        };
      } else {
        const issuer = ownIssue ? ownIssuer : (participants.get(codPart) ?? "");
        if (!issuer) {
          fail(
            ownIssue
              ? "C100 de emissão própria sem CNPJ/CPF no registro 0000."
              : `C100 com participante ${codPart || "vazio"} sem registro 0150.`,
          );
          continue;
        }
        if (!/^\d+$/u.test(number) || !/^\d*$/u.test(series)) {
          fail("C100 sem chave e com série ou número inválido.");
          continue;
        }
        identity = {
          access_key: null,
          issuer: issuer.padStart(14, "0"),
          model: stripZeros(model).padStart(2, "0"),
          series: stripZeros(series || "0"),
          number: stripZeros(number),
        };
      }
      const value = fields[11] ? money(fields[11]) : null;
      if (fields[11] && value === null) {
        fail(`Valor do documento inválido: ${fields[11]}.`);
        continue;
      }
      current = {
        line,
        identity: `${identity.issuer}|${identity.model}|${identity.series}|${identity.number}`,
        ...identity,
        value,
        cod_sit: codSit,
        own_issue: ownIssue,
        items: [],
      };
      documents.push(current);
    } else if (reg === "C170") {
      if (!currentOpen) {
        fail("C170 sem C100 correspondente.");
        continue;
      }
      // C100 recusado: seus itens ficam fora (descarte por linha), sem irem a outro documento.
      if (!current) {
        discarded.push({
          source: "sped",
          line,
          reason: `C170 do registro recusado na linha ${rejectedLine}.`,
        });
        continue;
      }
      const [, number = "", code = "", , quantity = "", , value = "", , , , cfop = ""] = fields;
      const item: SpedItem = {
        line,
        number: stripZeros(number),
        code: code.trim(),
        quantity: normalizeDecimal(quantity),
        value: money(value),
        cfop: cfop.trim(),
      };
      if (!/^\d+$/u.test(number) || (value && item.value === null)) {
        fail("C170 com número do item ou valor inválido.");
        continue;
      }
      current.items.push(item);
    } else if (!reg.startsWith("C1")) {
      // Registros filhos do C100 são C1xx; qualquer outro encerra o documento.
      current = null;
      currentOpen = false;
    }
  }
  return {
    documents,
    errors: errors.sort((a, b) => a.line - b.line),
    discarded,
    sawC100,
    lines: raw.filter((text) => text.trim() !== "").length,
    period: opening ? `${opening[3]} a ${opening[4]}` : "",
  };
}

function xmlDocument({ entry, identity, access_key, value, protocol_status, items }: NfeFile) {
  return { entry, identity, access_key, value, protocol_status, items };
}

function compareItems(doc: SpedDocument, xml: XmlDocument): ItemComparison[] {
  const spedItems = doc.items.map((item) => ({ ...item, identity: item.number }));
  const xmlItems = xml.items.map((item) => ({ ...item, identity: item.number }));
  return pairByIdentity(spedItems, xmlItems).map((pairing): ItemComparison => {
    if (pairing.kind === "duplicate") {
      return {
        situation: "Duplicado",
        number: pairing.identity,
        sped: null,
        xml: null,
        differences: [],
        note: `Item repetido: linhas ${pairing.left.map((item) => item.line).join(", ")} do SPED e ${pairing.right.length} no XML; sem correspondência automática`,
      };
    }
    if (pairing.kind === "left") {
      const { identity: _id, ...sped } = pairing.left;
      return {
        situation: "Só SPED",
        number: pairing.identity,
        sped,
        xml: null,
        differences: [],
        note: "",
      };
    }
    if (pairing.kind === "right") {
      const { identity: _id, ...item } = pairing.right;
      return {
        situation: "Só XML",
        number: pairing.identity,
        sped: null,
        xml: item,
        differences: [],
        note: "",
      };
    }
    const { identity: _l, ...sped } = pairing.left;
    const { identity: _r, ...item } = pairing.right;
    const differences: string[] = [];
    if (sped.value !== null && item.value !== null && sped.value !== item.value) {
      differences.push(`Valor: SPED ${sped.value} × XML ${item.value}`);
    }
    if (sped.quantity !== null && item.quantity !== null && sped.quantity !== item.quantity) {
      differences.push(`Quantidade: SPED ${sped.quantity} × XML ${item.quantity}`);
    }
    // Na entrada de terceiros o código e o CFOP são do destinatário; só a emissão própria compara.
    if (doc.own_issue && sped.code && item.code && sped.code !== item.code) {
      differences.push(`Código: SPED ${sped.code} × XML ${item.code}`);
    }
    if (doc.own_issue && sped.cfop && item.cfop && sped.cfop !== item.cfop) {
      differences.push(`CFOP: SPED ${sped.cfop} × XML ${item.cfop}`);
    }
    return {
      situation: differences.length > 0 ? "Divergente" : "Coincidente",
      number: pairing.identity,
      sped,
      xml: item,
      differences,
      note: "",
    };
  });
}

function spedProblem(doc: SpedDocument): string | null {
  const situation = NOT_COMPARABLE_SITUATIONS[doc.cod_sit];
  if (situation) return `SPED: COD_SIT ${doc.cod_sit} (${situation})`;
  if (!NFE_MODELS.has(doc.model)) return `SPED: modelo ${doc.model} não tem XML de NF-e`;
  return null;
}

export function compareSpedWithXml(input: {
  sped: { file_name: string; content: string };
  xml: { file_name: string; zip_base64: string };
}): SpedConferenceResult {
  const sped = parseSped(input.sped.content);
  if (!sped.sawC100) {
    throw new ServiceError(400, "Arquivo SPED: nenhum registro C100 encontrado.");
  }
  const archive = readNfeArchive(input.xml.zip_base64);
  const { notes, copies } = dropIdenticalCopies(archive.notes);
  const xmlDocs = notes.map(xmlDocument);

  const problems = new Map<string, string[]>();
  const flag = (identity: string, problem: string | null) => {
    if (!problem) return;
    const list = problems.get(identity) ?? [];
    if (!list.includes(problem)) problems.set(identity, [...list, problem]);
  };
  for (const doc of sped.documents) flag(doc.identity, spedProblem(doc));
  for (const doc of xmlDocs) {
    if (doc.protocol_status && !AUTHORIZED_PROTOCOL.has(doc.protocol_status)) {
      flag(doc.identity, `XML: protocolo com cStat ${doc.protocol_status}`);
    }
  }

  const buckets: Pick<
    SpedConferenceResult,
    | "matched"
    | "divergent"
    | "only_sped"
    | "only_xml"
    | "duplicates"
    | "not_comparable"
    | "discarded"
    | "errors"
  > = {
    matched: [],
    divergent: [],
    only_sped: [],
    only_xml: [],
    duplicates: [],
    not_comparable: [],
    discarded: [
      ...sped.discarded,
      ...[...archive.discarded, ...copies].map((item) => ({ source: "xml" as const, ...item })),
    ],
    errors: [
      ...sped.errors,
      ...archive.errors.map((item) => ({ source: "xml" as const, ...item })),
    ],
  };

  for (const item of pairByIdentity(sped.documents, xmlDocs)) {
    const spedSide = item.kind === "duplicate" ? item.left : "left" in item ? [item.left] : [];
    const xmlSide = item.kind === "duplicate" ? item.right : "right" in item ? [item.right] : [];
    const problem = problems.get(item.identity);
    if (item.kind === "duplicate") {
      buckets.duplicates.push({ identity: item.identity, sped: spedSide, xml: xmlSide });
    } else if (problem) {
      buckets.not_comparable.push({
        identity: item.identity,
        reason: problem.join("; "),
        sped: spedSide,
        xml: xmlSide,
      });
    } else if (item.kind === "pair") {
      const { items: spedItems, ...doc } = item.left;
      const { items: xmlItems, ...note } = item.right;
      const sameKey = Boolean(doc.access_key && doc.access_key === note.access_key);
      const differences: string[] = [];
      if (doc.access_key && note.access_key && !sameKey)
        differences.push("Chave de acesso diferente");
      if (doc.value !== null && note.value !== null && doc.value !== note.value) {
        differences.push(`Valor do documento: SPED ${doc.value} × XML ${note.value}`);
      }
      // Sem C170 (comum na NF-e de emissão própria) os itens não são comparados: ausência de
      // detalhe no SPED não é divergência.
      const itemsCompared = spedItems.length > 0;
      if (itemsCompared && spedItems.length !== xmlItems.length) {
        differences.push(`Itens: ${spedItems.length} no SPED × ${xmlItems.length} no XML`);
      }
      const items = itemsCompared ? compareItems(item.left, item.right) : [];
      const pair: DocumentPair = {
        identity: item.identity,
        match_key: sameKey ? "chave de acesso" : "emitente, modelo, série e número",
        sped: doc,
        xml: note,
        differences,
        items_compared: itemsCompared,
        items,
      };
      const clean =
        differences.length === 0 &&
        items.every((comparison) => comparison.situation === "Coincidente");
      (clean ? buckets.matched : buckets.divergent).push(pair);
    } else if (item.kind === "left") {
      buckets.only_sped.push(item.left);
    } else {
      buckets.only_xml.push(item.right);
    }
  }

  const pairs = [...buckets.matched, ...buckets.divergent];
  const itemCount = (situation: ItemComparison["situation"]) =>
    pairs.reduce(
      (total, pair) =>
        total + pair.items.filter((comparison) => comparison.situation === situation).length,
      0,
    );
  const summary: SpedConferenceResult["summary"] = {
    matched: buckets.matched.length,
    divergent: buckets.divergent.length,
    only_sped: buckets.only_sped.length,
    only_xml: buckets.only_xml.length,
    duplicates: buckets.duplicates.length,
    not_comparable: buckets.not_comparable.length,
    discarded: buckets.discarded.length,
    errors: buckets.errors.length,
    items_matched: itemCount("Coincidente"),
    items_divergent: itemCount("Divergente"),
    items_only_sped: itemCount("Só SPED"),
    items_only_xml: itemCount("Só XML"),
    items_duplicates: itemCount("Duplicado"),
  };
  // Erro de leiaute, duplicata ou ZIP sem NF-e não podem parecer conferência completa.
  const incomplete = summary.errors + summary.duplicates > 0 || notes.length === 0;
  return {
    status: incomplete ? "partial" : "complete",
    identity_rule: IDENTITY_RULE,
    sources: {
      sped: {
        file_name: input.sped.file_name,
        lines: sped.lines,
        documents: sped.documents.length,
        items: sped.documents.reduce((total, doc) => total + doc.items.length, 0),
        period: sped.period,
      },
      xml: { file_name: input.xml.file_name, entries: archive.entries, nfe_entries: notes.length },
    },
    summary,
    totals: {
      sped_documents: sum(sped.documents.map((doc) => doc.value)),
      xml_documents: sum(xmlDocs.map((doc) => doc.value)),
      // Itens só dos pares comparados: batem com o detalhamento da tabela e do CSV.
      sped_items: sum(
        pairs.flatMap((pair) => pair.items.flatMap((item) => (item.sped ? [item.sped.value] : []))),
      ),
      xml_items: sum(
        pairs.flatMap((pair) => pair.items.flatMap((item) => (item.xml ? [item.xml.value] : []))),
      ),
    },
    ...buckets,
  };
}

/** CSV do resultado: linha do documento seguida das linhas dos seus itens, mais erros e descartes. */
export function spedConferenceCsvExport(result: SpedConferenceResult) {
  type Line = (string | number)[];
  const lines: Line[] = [
    [
      "Nível",
      "Situação",
      "Identidade",
      "Chave usada",
      "Item",
      "Linha SPED",
      "Valor SPED",
      "Arquivo XML",
      "Valor XML",
      "Observação",
    ],
  ];
  if (result.status === "partial") {
    lines.push([
      "Resultado",
      "Conferência parcial: há erros de leiaute ou de arquivo, duplicatas ou ZIP sem NF-e",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  }
  const pushPair = (situation: string, pair: DocumentPair) => {
    lines.push([
      "Documento",
      situation,
      pair.identity,
      pair.match_key,
      "",
      pair.sped.line,
      brl(pair.sped.value),
      pair.xml.entry,
      brl(pair.xml.value),
      [
        ...pair.differences,
        ...(pair.items_compared ? [] : ["SPED sem C170 para a nota; itens não comparados"]),
      ].join(" | "),
    ]);
    for (const item of pair.items) {
      lines.push([
        "Item",
        item.situation,
        pair.identity,
        "",
        item.number,
        item.sped?.line ?? "",
        brl(item.sped?.value),
        item.xml ? pair.xml.entry : "",
        brl(item.xml?.value),
        [...item.differences, item.note].filter(Boolean).join(" | "),
      ]);
    }
  };
  lines.push([
    "Totais",
    "",
    "",
    "",
    "",
    "",
    `documentos ${brl(result.totals.sped_documents)}; itens comparados ${brl(result.totals.sped_items)}`,
    "",
    `documentos ${brl(result.totals.xml_documents)}; itens comparados ${brl(result.totals.xml_items)}`,
    "",
  ]);
  for (const pair of result.matched) pushPair("Coincidente", pair);
  for (const pair of result.divergent) pushPair("Divergente", pair);
  for (const doc of result.only_sped) {
    lines.push([
      "Documento",
      "Só SPED",
      doc.identity,
      "",
      "",
      doc.line,
      brl(doc.value),
      "",
      "",
      `${doc.items.length} item(ns)`,
    ]);
  }
  for (const doc of result.only_xml) {
    lines.push([
      "Documento",
      "Só XML",
      doc.identity,
      "",
      "",
      "",
      "",
      doc.entry,
      brl(doc.value),
      `${doc.items.length} item(ns)`,
    ]);
  }
  const group = (
    situation: string,
    item: { identity: string; sped: SpedDocument[]; xml: XmlDocument[] },
    note: string,
  ) =>
    lines.push([
      "Documento",
      situation,
      item.identity,
      "",
      "",
      item.sped.map((doc) => doc.line).join(" | "),
      item.sped.map((doc) => brl(doc.value)).join(" | "),
      item.xml.map((doc) => doc.entry).join(" | "),
      item.xml.map((doc) => brl(doc.value)).join(" | "),
      note,
    ]);
  for (const item of result.not_comparable) group("Não comparável", item, item.reason);
  for (const item of result.duplicates) {
    group("Duplicado", item, "Identidade repetida; sem correspondência automática");
  }
  const issueSides = (issue: Issue<unknown>) =>
    issue.source === "sped" ? [issue.line, "", "", ""] : ["", "", issue.entry, ""];
  for (const issue of result.errors)
    lines.push(["Arquivo", "Erro", "", "", "", ...issueSides(issue), issue.message]);
  for (const issue of result.discarded) {
    lines.push(["Arquivo", "Descartado", "", "", "", ...issueSides(issue), issue.reason]);
  }
  return {
    file_name: "conferencia-sped-xml.csv",
    csv: `﻿${lines.map((line) => csvLine(line, ";")).join("\r\n")}\r\n`,
  };
}
