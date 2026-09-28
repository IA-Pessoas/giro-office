import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import { competenceDate, competenceKey } from "../schemas/competence.schemas.js";
import {
  calculateSimplesPreview,
  previousCompetences,
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
    if (preview.status !== "ok") throw new ServiceError(422, preview.message ?? "Sem base.");
    const item = preview.annexes.find((annex) => annex.annex === input.annex);
    if (!item) throw new ServiceError(422, `Anexo ${input.annex} sem cálculo.`);
    if (!item.emission_rate) {
      throw new ServiceError(
        422,
        `Sem alíquota de ${item.tax} para emitir no Anexo ${item.annex}: na ${item.bracket}ª faixa o tributo é recolhido fora do Simples.`,
      );
    }
    return {
      client_id: client.id,
      client_name: client.company_name?.trim() || client.name,
      client_document: client.cpf_cnpj,
      competence: preview.competence,
      applies_to: preview.applies_to,
      annex: item.annex,
      tax: item.tax,
      rate: item.emission_rate,
    };
  }
}
