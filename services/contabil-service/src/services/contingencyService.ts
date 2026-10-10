import { createHash, randomUUID } from "node:crypto";
import { normalizeCpfCnpj, ServiceError } from "@workspace/shared";
import { CONTABIL_WRITE_PERMISSION } from "../constants/permissions.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ContingencyInput } from "../schemas/contingency.schemas.js";
import {
  type ContingencyCalculation,
  simulateContingencyXls,
} from "./contingencyCalculationService.js";
import { renderContingencyReport } from "./contingencyReportService.js";

export type ContingencyPrisma = {
  client: Pick<PrismaClient["client"], "findFirst">;
  contingencyDraft: Pick<PrismaClient["contingencyDraft"], "create" | "findFirst" | "updateMany">;
};
export interface ContingencyResult extends ContingencyCalculation {
  parameters: Omit<ContingencyInput, "simulation_id">;
  classification: "legacy_hypothesis";
}
export interface ContingencySimulation extends ContingencyResult {
  id: string;
  content_hash: string;
}
export interface ContingencyReview {
  reviewed_by: string;
  reviewed_at: Date;
  reviewed_hash: string;
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
    this.requireWrite(auth);
    await this.validateClient(input, auth);
    const { simulation_id, ...parameters } = input;
    const result: ContingencyResult = {
      parameters,
      classification: "legacy_hypothesis",
      ...simulateContingencyXls(bytes, input.rate, input.cnpj),
    };
    const snapshot = JSON.stringify({
      revision: randomUUID(),
      source_sha256: createHash("sha256").update(bytes).digest("hex"),
      result,
    });
    const content_hash = createHash("sha256").update(snapshot).digest("hex");
    const data = {
      snapshot,
      content_hash,
      reviewed_by: null,
      reviewed_at: null,
      reviewed_hash: null,
    };
    if (simulation_id) {
      const updated = await this.prisma.contingencyDraft.updateMany({
        where: { id: simulation_id, organization_id: auth.organizationId },
        data,
      });
      if (updated.count !== 1) throw new ServiceError(404, "Simulação não encontrada.");
      return { ...result, id: simulation_id, content_hash };
    }
    const record = await this.prisma.contingencyDraft.create({
      data: { ...data, organization_id: auth.organizationId, created_by: auth.userId },
    });
    return { ...result, id: record.id, content_hash };
  }

  async review(id: string, hash: string, auth: ContingencyAuth): Promise<ContingencyReview> {
    await this.load(id, hash, auth);
    const review = { reviewed_by: auth.userId, reviewed_at: new Date(), reviewed_hash: hash };
    const updated = await this.prisma.contingencyDraft.updateMany({
      where: { id, organization_id: auth.organizationId, content_hash: hash },
      data: review,
    });
    if (updated.count !== 1) throw new ServiceError(409, "A simulação mudou. Confira novamente.");
    return review;
  }

  async export(id: string, hash: string, auth: ContingencyAuth): Promise<string> {
    const { record, result } = await this.load(id, hash, auth);
    if (!record.reviewed_by || !record.reviewed_at || record.reviewed_hash !== hash) {
      throw new ServiceError(409, "Confira os valores e parâmetros antes de exportar.");
    }
    return renderContingencyReport(result, {
      reviewed_by: record.reviewed_by,
      reviewed_at: record.reviewed_at,
      reviewed_hash: record.reviewed_hash,
    });
  }

  private async load(id: string, hash: string, auth: ContingencyAuth) {
    this.requireWrite(auth);
    const record = await this.prisma.contingencyDraft.findFirst({
      where: { id, organization_id: auth.organizationId },
    });
    if (!record) throw new ServiceError(404, "Simulação não encontrada.");
    if (
      record.content_hash !== hash ||
      createHash("sha256").update(record.snapshot).digest("hex") !== hash
    ) {
      throw new ServiceError(409, "A simulação mudou. Confira novamente.");
    }
    const { result } = JSON.parse(record.snapshot) as { result: ContingencyResult };
    await this.validateClient(result.parameters, auth);
    return { record, result };
  }

  private requireWrite(auth: ContingencyAuth): void {
    if (!auth.userId || !auth.organizationId) throw new ServiceError(401, "Não autenticado.");
    if ((auth.permission ?? 0) < CONTABIL_WRITE_PERMISSION) {
      throw new ServiceError(403, "Permissão insuficiente para simular contingência.");
    }
  }

  private async validateClient(input: ContingencyInput, auth: ContingencyAuth): Promise<void> {
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
  }
}
