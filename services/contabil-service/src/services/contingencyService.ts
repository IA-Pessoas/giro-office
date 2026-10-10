import { normalizeCpfCnpj, ServiceError } from "@workspace/shared";
import { CONTABIL_WRITE_PERMISSION } from "../constants/permissions.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ContingencyInput } from "../schemas/contingency.schemas.js";
import {
  type ContingencyCalculation,
  simulateContingencyXls,
} from "./contingencyCalculationService.js";

export type ContingencyPrisma = { client: Pick<PrismaClient["client"], "findFirst"> };
export interface ContingencySimulation extends ContingencyCalculation {
  parameters: ContingencyInput;
  classification: "legacy_hypothesis";
}
export interface ContingencyAuth {
  userId: string;
  organizationId: string;
  permission?: number;
}

export class ContingencyService {
  constructor(private readonly prisma: ContingencyPrisma) {}

  async simulate(
    bytes: Buffer,
    input: ContingencyInput,
    auth: ContingencyAuth,
  ): Promise<ContingencySimulation> {
    if (!auth.userId || !auth.organizationId) throw new ServiceError(401, "Não autenticado.");
    if ((auth.permission ?? 0) < CONTABIL_WRITE_PERMISSION) {
      throw new ServiceError(403, "Permissão insuficiente para simular contingência.");
    }
    const client = await this.prisma.client.findFirst({
      where: { id: input.client_id, organization_id: auth.organizationId },
      select: { name: true, company_name: true, cpf_cnpj: true, contabil: true },
    });
    if (!client) throw new ServiceError(404, "Cliente não encontrado.");
    if (client.contabil === false)
      throw new ServiceError(400, "Serviço contábil não contratado para este cliente.");
    if (
      normalizeCpfCnpj(client.cpf_cnpj) !== input.cnpj ||
      (client.company_name?.trim() || client.name) !== input.company_name
    ) {
      throw new ServiceError(
        409,
        "Empresa ou CNPJ diverge do cliente selecionado. Atualize os dados.",
      );
    }
    return {
      parameters: input,
      classification: "legacy_hypothesis",
      ...simulateContingencyXls(bytes, input.rate, input.cnpj),
    };
  }
}
