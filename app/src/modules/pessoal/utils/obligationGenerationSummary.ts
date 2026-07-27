import type { PessoalObligationGenerationResult } from "../types/obligations";

export function formatPessoalObligationGenerationSummary(
  result: PessoalObligationGenerationResult,
): string {
  return [
    `Geração global concluída: ${result.clients} clientes avaliados`,
    `${result.payrollRows} clientes com folha configurada`,
    `${result.created} criadas`,
    `${result.skippedExisting} existentes`,
    `${result.skippedNoPayroll} clientes sem configuração de folha.`,
  ].join(", ");
}
