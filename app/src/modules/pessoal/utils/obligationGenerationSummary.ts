import type { PessoalObligationGenerationResult } from "../types/obligations";

const count = (value: number, singular: string, plural: string) =>
  `${value} ${value === 1 ? singular : plural}`;

export function formatPessoalObligationGenerationSummary(
  result: PessoalObligationGenerationResult,
): string {
  return [
    `Geração global concluída: ${count(result.clients, "cliente avaliado", "clientes avaliados")}`,
    `${count(result.payrollRows, "cliente", "clientes")} com folha configurada`,
    count(result.created, "criada", "criadas"),
    count(result.skippedExisting, "existente", "existentes"),
    `${count(result.skippedNoPayroll, "cliente", "clientes")} sem configuração de folha.`,
  ].join(", ");
}
