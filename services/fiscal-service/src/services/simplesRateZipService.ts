import { createZip, error as logError, ServiceError } from "@workspace/shared";

import { renderSimplesRatePdf, simplesRatePdfFileName } from "./simplesRatePdfService.js";
import { type SimplesRateBatch, simplesRateBatchFileName } from "./simplesRateService.js";

/**
 * Resposta do lote em PDF: um PDF por cliente incluído, reunidos num ZIP (base64). Sem incluídos
 * não há arquivo; se algum PDF ou o empacotamento falhar, nada é entregue.
 */
export async function simplesRateZipExport(batch: SimplesRateBatch) {
  const file_name = simplesRateBatchFileName(batch, "zip");
  if (batch.included.length === 0) return { ...batch, file_name, zip_base64: null };

  try {
    // ponytail: até 500 PDFs gerados em memória numa só requisição (poucos KB cada); se o lote
    // crescer ou o tempo de CPU apertar, gerar em job assíncrono e guardar o ZIP no R2.
    const entries = await Promise.all(
      batch.included.map(async (emission) => ({
        fileName: simplesRatePdfFileName(emission),
        body: await renderSimplesRatePdf(emission),
      })),
    );
    return { ...batch, file_name, zip_base64: createZip(entries).toString("base64") };
  } catch (err) {
    logError("Erro ao gerar ZIP de PDFs do Simples", { err });
    if (err instanceof ServiceError) throw err;
    throw new ServiceError(
      500,
      "Falha ao gerar os PDFs do lote; nenhum arquivo foi gerado.",
      err,
      undefined,
      { expose: true },
    );
  }
}
