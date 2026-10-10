import { read, utils, type WorkSheet } from "@e965/xlsx";
import {
  error as logError,
  normalizeCpfCnpj,
  ServiceError,
  validateUploadFileSignature,
} from "@workspace/shared";

export const CONTINGENCY_LIMITS = { bytes: 5 * 1024 * 1024, rows: 10000, columns: 256 };

const SOURCES = [
  ["declaredRevenue", "Faturamento declarado", 8, "RECEITA BRUTA DE VENDAS E SERVIÇOS", 20],
  ["bankReceipts", "Recebimentos bancários", 9, "BANCOS CONTA MOVIMENTO", 18],
  ["clientReceipts", "Recebimentos de clientes", 9, "DUPLICATAS A RECEBER", 20],
  ["relatedCompanies", "Empresas vinculadas", 9, "EMPRESTIMOS DE TERCEIROS", 20],
  ["partnerTransfers", "Transferências de sócios", 9, "ADIANTAMENTO A SÓCIOS", 20],
  ["cashDeposits", "Depósitos em espécie", 10, "CAIXA GERAL", 20],
  ["creditOperations", "Operações de crédito", 9, "EMPRÉSTIMOS", 20],
] as const;

type SourceKey = (typeof SOURCES)[number][0];
export interface ContingencyExtraction {
  key: SourceKey;
  label: string;
  sourceLabel: string;
  sheet: string;
  labelCell: string;
  valueCell: string;
  rawValue: string | number;
  valueCents: number;
}
export interface ContingencyScenario {
  baseCents: number;
  taxCents: number;
  penaltyCents: number;
  interestCents: number;
  totalCents: number;
}
export interface ContingencyCalculation {
  extraction: ContingencyExtraction[];
  identity: "matched" | "not_found";
  differenceCents: number;
  internalTransfersCents: number;
  minimum: ContingencyScenario;
  maximum: ContingencyScenario;
}

function moneyCents(value: unknown, cell: string): number {
  let amount = typeof value === "number" ? value : Number.NaN;
  if (typeof value === "string") {
    let text = value.trim().replace(/^R\$\s*/, "");
    const negative = text.startsWith("(") && text.endsWith(")");
    if (negative) text = text.slice(1, -1).trim();
    if (/^[+-]?\d+(?:\.\d{1,2})?$/.test(text)) amount = Number(text);
    else if (/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(text)) {
      amount = Number(text.replace(/\./g, "").replace(",", "."));
    }
    if (negative) amount = -Math.abs(amount);
  }
  if (
    !Number.isFinite(amount) ||
    Math.abs(amount) > 1e12 ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 0.001
  ) {
    throw new ServiceError(
      400,
      `Valor em ${cell} inválido; informe valor monetário com até duas casas decimais.`,
    );
  }
  return Math.round(amount * 100);
}

function roundedRatio(numerator: bigint, denominator: bigint): number {
  const sign = numerator < 0n ? -1n : 1n;
  return Number(sign * ((sign * numerator + denominator / 2n) / denominator));
}

function scenario(baseCents: number, rate: number): ContingencyScenario {
  const tax = BigInt(baseCents) * BigInt(Math.round(rate * 100));
  // O PHP arredonda na exibição; multa, juros e total partem do tributo ainda não arredondado.
  return {
    baseCents,
    taxCents: roundedRatio(tax, 10000n),
    penaltyCents: roundedRatio(tax * 75n, 1000000n),
    interestCents: roundedRatio(tax * 6n, 1000000n),
    totalCents: roundedRatio(tax * 181n, 1000000n),
  };
}

function workbookIdentity(sheet: WorkSheet, cnpj: string): ContingencyCalculation["identity"] {
  let found = false;
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith("!") || typeof cell?.v !== "string" || !/\bCNPJ\b/i.test(cell.v))
      continue;
    const position = utils.decode_cell(address);
    const inline = cell.v.split(/\bCNPJ\b\s*[:=-]?\s*/i)[1]?.trim();
    const document = normalizeCpfCnpj(
      inline ||
        String(
          sheet[
            utils.encode_cell({
              r: position.r,
              c: position.c + 1,
            })
          ]?.v ?? "",
        ),
    );
    if (!/^[A-Z0-9]{12}\d{2}$/.test(document)) {
      throw new ServiceError(400, `CNPJ do XLS em ${address} inválido ou ausente.`);
    }
    if (document !== cnpj)
      throw new ServiceError(409, "CNPJ do XLS diverge do cliente selecionado.");
    found = true;
  }
  return found ? "matched" : "not_found";
}

export function simulateContingencyXls(
  bytes: Buffer,
  rate: number,
  cnpj: string,
): ContingencyCalculation {
  if (bytes.length > CONTINGENCY_LIMITS.bytes) throw new ServiceError(413, "O XLS excede 5 MiB.");
  validateUploadFileSignature({ buffer: bytes, mimetype: "application/vnd.ms-excel" });
  let book: ReturnType<typeof read>;
  try {
    book = read(bytes, {
      type: "buffer",
      sheets: 0,
      sheetRows: CONTINGENCY_LIMITS.rows + 1,
      cellHTML: false,
      cellText: false,
      cellFormula: true,
      cellDates: true,
    });
  } catch (err) {
    logError("Erro ao ler XLS de Contingência", { err });
    throw new ServiceError(400, "XLS ilegível, corrompido ou protegido.");
  }
  const sheetName = book.SheetNames[0];
  const sheet = book.Sheets[sheetName];
  if (!sheet?.["!ref"]) throw new ServiceError(400, "A primeira planilha do XLS está vazia.");
  const range = utils.decode_range(sheet["!fullref"] ?? sheet["!ref"]);
  if (range.e.r >= CONTINGENCY_LIMITS.rows || range.e.c >= CONTINGENCY_LIMITS.columns) {
    throw new ServiceError(400, "O XLS excede o limite de 10.000 linhas ou 256 colunas.");
  }
  const identity = workbookIdentity(sheet, cnpj);
  const extraction = SOURCES.map(([key, label, column, sourceLabel, valueColumn]) => {
    let result: ContingencyExtraction | undefined;
    for (let row = 0; row <= range.e.r && (!result || result.valueCents === 0); row++) {
      const labelCell = utils.encode_cell({ r: row, c: column });
      if (
        !String(sheet[labelCell]?.v ?? "")
          .trim()
          .toUpperCase()
          .includes(sourceLabel)
      )
        continue;
      const valueCell = utils.encode_cell({ r: row, c: valueColumn });
      const rawValue = sheet[valueCell]?.v;
      if (sheet[valueCell]?.f || !["s", "n"].includes(sheet[valueCell]?.t)) {
        throw new ServiceError(400, `Valor em ${valueCell} inválido; use números, sem fórmulas.`);
      }
      result = {
        key,
        label,
        sourceLabel,
        sheet: sheetName,
        labelCell,
        valueCell,
        rawValue,
        valueCents: moneyCents(rawValue, valueCell),
      };
    }
    if (!result) throw new ServiceError(400, `Rótulo ausente no XLS: ${sourceLabel}.`);
    return result;
  });
  const values = Object.fromEntries(
    extraction.map((item) => [item.key, item.valueCents]),
  ) as Record<SourceKey, number>;
  const minimumBase = Math.max(0, values.clientReceipts - values.declaredRevenue);
  return {
    extraction,
    identity,
    differenceCents: values.bankReceipts - values.declaredRevenue,
    internalTransfersCents:
      values.bankReceipts -
      values.clientReceipts -
      values.relatedCompanies -
      values.partnerTransfers -
      values.cashDeposits -
      values.creditOperations,
    minimum: scenario(minimumBase, rate),
    maximum: scenario(
      minimumBase + values.relatedCompanies + values.partnerTransfers + values.cashDeposits,
      rate,
    ),
  };
}
