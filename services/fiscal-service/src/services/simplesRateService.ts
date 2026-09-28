import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import { competenceDate, competenceKey } from "../schemas/competence.schemas.js";
import {
  calculateSimplesPreview,
  nextCompetence,
  previousCompetences,
  SIMPLES_ANNEXES,
  type SimplesAnnex,
  type SimplesPreview,
  type SimplesTax,
} from "./simplesNationalService.js";

export type SimplesRatePrisma = Pick<PrismaClient, "client" | "fiscalMonthlyRevenue">;

export interface SimplesRateEmission {
  client_id: string;
  client_name: string;
  client_document: string;
  /** Competência de apuração (base do RBT12). */
  competence: string;
  /** Competência seguinte, à qual a alíquota emitida se refere. */
  applies_to: string;
  annex: SimplesAnnex;
  tax: SimplesTax;
  /** Percentual emitido, com os limites de ISS/ICMS. */
  rate: string;
}

export interface SimplesRateBatch {
  competence: string;
  applies_to: string;
  annex: SimplesAnnex;
  tax: SimplesTax;
  included: SimplesRateEmission[];
  skipped: Array<{ document: string; client_name: string | null; reason: string }>;
}

// Mesma regra do lote legado (listar-arquivos.php): Fiscal habilitado, ativo e no Simples.
const SIMPLES_REGIME = "Simples Nacional";

type BatchClient = {
  id: string;
  name: string;
  company_name: string | null;
  cpf_cnpj: string;
  fiscal: boolean | null;
  status: string;
  competence_output: Date | null;
  regime: string | null;
};

function digits(document: string): string {
  return document.replace(/\D/g, "");
}

function maskDocument(value: string): string {
  return value.length === 14
    ? value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
    : value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

function clientName(client: { name: string; company_name: string | null }): string {
  return client.company_name?.trim() || client.name;
}

/** Motivo de inelegibilidade, ou null; ativo = status Ativo ou saída no mês da alíquota ou depois. */
function ineligibility(client: BatchClient, appliesTo: string): string | null {
  if (client.fiscal !== true) return "Fiscal não habilitado para o cliente.";
  const active =
    client.status === "Ativo" ||
    (client.competence_output !== null && client.competence_output >= competenceDate(appliesTo));
  if (!active) return `Cliente inativo em ${appliesTo.slice(5, 7)}/${appliesTo.slice(0, 4)}.`;
  if (client.regime?.trim() !== SIMPLES_REGIME) return "Cliente fora do Simples Nacional.";
  return null;
}

/** Emissão do anexo a partir da prévia, ou o motivo de não emitir. */
function resolveEmission(
  client: { id: string; name: string; company_name: string | null; cpf_cnpj: string },
  preview: SimplesPreview,
  annex: SimplesAnnex,
): SimplesRateEmission | string {
  if (preview.status !== "ok") return preview.message ?? "Sem base para calcular.";
  const item = preview.annexes.find((candidate) => candidate.annex === annex);
  if (!item) return `Anexo ${annex} sem cálculo.`;
  if (!item.emission_rate) {
    return `Sem alíquota de ${item.tax} para emitir no Anexo ${item.annex}: na ${item.bracket}ª faixa o tributo é recolhido fora do Simples.`;
  }
  return {
    client_id: client.id,
    client_name: clientName(client),
    client_document: client.cpf_cnpj,
    competence: preview.competence,
    applies_to: preview.applies_to,
    annex: item.annex,
    tax: item.tax,
    rate: item.emission_rate,
  };
}

/** Prévia e emissão da alíquota de ISS/ICMS do Simples a partir das receitas mensais. */
export class SimplesRateService {
  constructor(private readonly prisma: SimplesRatePrisma) {}

  private async requireClient(clientId: string, organizationId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true, name: true, company_name: true, cpf_cnpj: true },
    });
    if (!client) throw new ServiceError(404, "Cliente não encontrado.");
    return client;
  }

  private async calculate(clientId: string, competence: string, organizationId: string) {
    const months = previousCompetences(competence);
    const records = await this.prisma.fiscalMonthlyRevenue.findMany({
      where: {
        organization_id: organizationId,
        client_id: clientId,
        competence: {
          gte: competenceDate(months[months.length - 1]),
          lte: competenceDate(months[0]),
        },
      },
      select: { competence: true, amount: true },
    });
    return calculateSimplesPreview(
      competence,
      records.map((record) => ({
        competence: competenceKey(record.competence),
        amount: record.amount.toString(),
      })),
    );
  }

  /** RBT12 dos 11 meses anteriores à competência e alíquota bruta por anexo. */
  async preview(
    input: { client_id: string; competence: string },
    organizationId: string,
  ): Promise<SimplesPreview & { client_id: string }> {
    await this.requireClient(input.client_id, organizationId);
    return {
      client_id: input.client_id,
      ...(await this.calculate(input.client_id, input.competence, organizationId)),
    };
  }

  /** Alíquota a emitir para um anexo, com os limites; 422 sem base ou sem alíquota válida. */
  async emission(
    input: { client_id: string; competence: string; annex: SimplesAnnex },
    organizationId: string,
  ): Promise<SimplesRateEmission> {
    const client = await this.requireClient(input.client_id, organizationId);
    const preview = await this.calculate(client.id, input.competence, organizationId);
    const emission = resolveEmission(client, preview, input.annex);
    if (typeof emission === "string") throw new ServiceError(422, emission);
    return emission;
  }

  /** Lote de emissão para os documentos informados, com o motivo de cada cliente ignorado. */
  async batch(
    input: { competence: string; annex: SimplesAnnex; documents: string[] },
    organizationId: string,
  ): Promise<SimplesRateBatch> {
    const appliesTo = nextCompetence(input.competence);
    const wanted = input.documents.map((document) => document.trim()).filter(Boolean);
    const variants = [...new Set(wanted.map(digits))].flatMap((value) => [
      value,
      maskDocument(value),
    ]);
    const clients: BatchClient[] = await this.prisma.client.findMany({
      where: { organization_id: organizationId, cpf_cnpj: { in: variants } },
      select: {
        id: true,
        name: true,
        company_name: true,
        cpf_cnpj: true,
        fiscal: true,
        status: true,
        competence_output: true,
        regime: true,
      },
    });
    const byDocument = new Map(clients.map((client) => [digits(client.cpf_cnpj), client]));

    const months = previousCompetences(input.competence);
    const eligibleIds = clients
      .filter((client) => ineligibility(client, appliesTo) === null)
      .map((client) => client.id);
    const records = eligibleIds.length
      ? await this.prisma.fiscalMonthlyRevenue.findMany({
          where: {
            organization_id: organizationId,
            client_id: { in: eligibleIds },
            competence: {
              gte: competenceDate(months[months.length - 1]),
              lte: competenceDate(months[0]),
            },
          },
          select: { client_id: true, competence: true, amount: true },
        })
      : [];

    const result: SimplesRateBatch = {
      competence: input.competence,
      applies_to: appliesTo,
      annex: input.annex,
      tax: SIMPLES_ANNEXES[input.annex].tax,
      included: [],
      skipped: [],
    };
    const seen = new Set<string>();
    for (const document of wanted) {
      const client = byDocument.get(digits(document));
      const skip = (reason: string) =>
        result.skipped.push({ document, client_name: client ? clientName(client) : null, reason });
      if (seen.has(digits(document))) {
        skip("Documento repetido no lote.");
        continue;
      }
      seen.add(digits(document));
      if (!client) {
        skip("Cliente não encontrado nesta organização.");
        continue;
      }
      const reason = ineligibility(client, appliesTo);
      if (reason) {
        skip(reason);
        continue;
      }
      const preview = calculateSimplesPreview(
        input.competence,
        records
          .filter((record) => record.client_id === client.id)
          .map((record) => ({
            competence: competenceKey(record.competence),
            amount: record.amount.toString(),
          })),
      );
      const emission = resolveEmission(client, preview, input.annex);
      if (typeof emission === "string") skip(emission);
      else result.included.push(emission);
    }
    return result;
  }
}
