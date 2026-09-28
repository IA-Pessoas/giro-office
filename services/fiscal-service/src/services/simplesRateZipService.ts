import { createZip, ServiceError } from "@workspace/shared";

import { renderSimplesRatePdf, simplesRatePdfFileName } from "./simplesRatePdfService.js";
import type { SimplesRateBatch } from "./simplesRateService.js";

export function simplesRateZipFileName(batch: SimplesRateBatch): string {
  return `aliquotas-${batch.tax}-anexo-${batch.annex}-${batch.applies_to}.zip`;
}

/**
 * Resposta do lote em PDF: um PDF por cliente incluído, reunidos num ZIP (base64). Sem incluídos
 * não há arquivo; se algum PDF falhar, nada é entregue, para não parecer lote completo.
 */
export async function simplesRateZipExport(batch: SimplesRateBatch) {
  const file_name = simplesRateZipFileName(batch);
  if (batch.included.length === 0) return { ...batch, file_name, zip_base64: null };

  let entries: Array<{ fileName: string; body: Buffer }>;
  try {
    entries = await Promise.all(
      batch.included.map(async (emission) => ({
        fileName: simplesRatePdfFileName(emission),
        body: await renderSimplesRatePdf(emission),
      })),
    );
  } catch (cause) {
    throw new ServiceError(
      500,
      "Falha ao gerar os PDFs do lote; nenhum arquivo foi gerado.",
      cause,
    );
  }
  return { ...batch, file_name, zip_base64: createZip(entries).toString("base64") };
}
