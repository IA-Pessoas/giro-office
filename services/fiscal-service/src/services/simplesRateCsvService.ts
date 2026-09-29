import { csvLine } from "@workspace/shared";

import { type SimplesRateBatch, simplesRateBatchFileName } from "./simplesRateService.js";

const DELIMITER = ";";

export function simplesRateCsvFileName(batch: SimplesRateBatch): string {
  return simplesRateBatchFileName(batch, "csv");
}

/** Resposta do lote: dados, nome do arquivo e conteúdo do CSV. */
export function simplesRateCsvExport(batch: SimplesRateBatch) {
  return { ...batch, file_name: simplesRateCsvFileName(batch), csv: renderSimplesRateCsv(batch) };
}

/**
 * CSV do lote legado (listar-arquivos.php): razão social, CPF/CNPJ e percentual emitido com
 * vírgula decimal, separados por ponto e vírgula. O BOM faz o Excel ler os acentos em UTF-8.
 */
export function renderSimplesRateCsv(batch: SimplesRateBatch): string {
  const lines = [
    csvLine(["Razão Social", "CPF/CNPJ", "%"], DELIMITER),
    ...batch.included.map((item) =>
      csvLine([item.client_name, item.client_document, item.rate.replace(".", ",")], DELIMITER),
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}
