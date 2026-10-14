import { randomUUID } from "node:crypto";
import { error as logError, ServiceError } from "@workspace/shared";
import { type Prisma, type PrismaClient, RhNitroHoursStatus } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";
import type { NitroHoursCertificateStorage, NitroHoursMimeType } from "./nitroHoursStorage.js";
import { canUpdateScoreNitro } from "./scoreFormulaVersion.js";
import { ScoreNitroService } from "./scoreNitroService.js";

const PUBLIC_FIELDS = {
  id: true,
  organization_id: true,
  user_id: true,
  quarter: true,
  hours: true,
  status: true,
  certificate_mime: true,
  decided_by_id: true,
  decided_at: true,
  rejection_reason: true,
  created_at: true,
  updated_at: true,
  user: { select: { id: true, name: true } },
} as const;

type NitroHoursPublicSubmission = Prisma.RhNitroHoursSubmissionGetPayload<{
  select: typeof PUBLIC_FIELDS;
}>;

export class NitroHoursService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly storage?: NitroHoursCertificateStorage,
  ) {}

  async submit(input: {
    organization_id: string;
    user_id: string;
    quarter: string;
    hours: number;
    file: { buffer: Buffer; mimetype: NitroHoursMimeType };
  }): Promise<NitroHoursPublicSubmission> {
    try {
      const user = await this.db.user.findFirst({
        where: { id: input.user_id, organization_id: input.organization_id },
        select: { id: true },
      });
      if (!user) throw new ServiceError(404, "Usuário não encontrado nesta organização.");
      if (!this.storage)
        throw new ServiceError(503, "Armazenamento de certificados Nitro não configurado.");

      const id = randomUUID();
      const certificatePath = await this.storage.upload({
        organizationId: input.organization_id,
        requestId: id,
        file: input.file,
      });
      try {
        return await this.db.rhNitroHoursSubmission.create({
          data: {
            id,
            organization_id: input.organization_id,
            user_id: input.user_id,
            quarter: input.quarter,
            hours: input.hours,
            certificate_path: certificatePath,
            certificate_mime: input.file.mimetype,
          },
          select: PUBLIC_FIELDS,
        });
      } catch (err: unknown) {
        await this.storage.remove(certificatePath);
        throw err;
      }
    } catch (err: unknown) {
      logError("Erro ao enviar horas Nitro", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao enviar horas Nitro.", err);
    }
  }

  async list(input: {
    organization_id: string;
    user_id: string;
    can_manage: boolean;
    quarter?: string;
    target_user_id?: string;
  }): Promise<NitroHoursPublicSubmission[]> {
    try {
      return await this.db.rhNitroHoursSubmission.findMany({
        where: {
          organization_id: input.organization_id,
          ...(!input.can_manage ? { user_id: input.user_id } : {}),
          ...(input.can_manage && input.target_user_id ? { user_id: input.target_user_id } : {}),
          ...(input.quarter ? { quarter: input.quarter } : {}),
        },
        select: PUBLIC_FIELDS,
        orderBy: [{ quarter: "desc" }, { created_at: "desc" }],
      });
    } catch (err: unknown) {
      logError("Erro ao listar solicitações de horas Nitro", { err });
      throw new ServiceError(500, "Erro interno ao listar horas Nitro.", err);
    }
  }

  async acceptedHours(input: {
    organization_id: string;
    quarter: string;
    user_id: string;
  }): Promise<number> {
    try {
      const result = await this.db.rhNitroHoursSubmission.aggregate({
        where: {
          organization_id: input.organization_id,
          user_id: input.user_id,
          quarter: input.quarter,
          status: RhNitroHoursStatus.Accepted,
        },
        _sum: { hours: true },
      });
      return result._sum.hours ?? 0;
    } catch (err: unknown) {
      logError("Erro ao somar horas Nitro aceitas", { err });
      throw new ServiceError(500, "Erro interno ao somar horas Nitro.", err);
    }
  }

  async decide(input: {
    organization_id: string;
    request_id: string;
    actor_user_id: string;
    status: typeof RhNitroHoursStatus.Accepted | typeof RhNitroHoursStatus.Rejected;
    rejection_reason?: string;
  }): Promise<NitroHoursPublicSubmission> {
    try {
      const result = await this.db.rhNitroHoursSubmission.updateMany({
        where: {
          id: input.request_id,
          organization_id: input.organization_id,
          status: RhNitroHoursStatus.Pending,
        },
        data: {
          status: input.status,
          decided_by_id: input.actor_user_id,
          decided_at: new Date(),
          rejection_reason: input.status === "Rejected" ? input.rejection_reason : null,
        },
      });
      if (result.count === 0) {
        const existing = await this.db.rhNitroHoursSubmission.findFirst({
          where: { id: input.request_id, organization_id: input.organization_id },
          select: { id: true },
        });
        throw new ServiceError(
          existing ? 409 : 404,
          existing ? "Solicitação já decidida." : "Solicitação não encontrada.",
        );
      }
      const decided = await this.db.rhNitroHoursSubmission.findFirstOrThrow({
        where: { id: input.request_id, organization_id: input.organization_id },
        select: PUBLIC_FIELDS,
      });
      if (input.status === "Accepted") {
        const score = await this.db.scoreQuarter.findUnique({
          where: { user_id_quarter: { user_id: decided.user_id, quarter: decided.quarter } },
          include: { evaluations: true, nitro: true },
        });
        if (
          score?.organization_id === input.organization_id &&
          score.nitro &&
          canUpdateScoreNitro(score.formula_version, score.evaluations)
        ) {
          const hours = await this.acceptedHours({
            organization_id: input.organization_id,
            user_id: decided.user_id,
            quarter: decided.quarter,
          });
          await new ScoreNitroService(this.db).updateMetric(
            input.organization_id,
            input.actor_user_id,
            {
              score_id: score.id,
              type: "hours",
              value: hours >= 10 ? 1 : 0,
            },
          );
        }
      }
      return decided;
    } catch (err: unknown) {
      logError("Erro ao decidir solicitação de horas Nitro", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao decidir horas Nitro.", err);
    }
  }

  async certificateUrl(input: {
    organization_id: string;
    request_id: string;
    user_id: string;
    can_manage: boolean;
  }): Promise<{ url: string }> {
    try {
      const request = await this.db.rhNitroHoursSubmission.findFirst({
        where: { id: input.request_id, organization_id: input.organization_id },
        select: { user_id: true, certificate_path: true },
      });
      if (!request) throw new ServiceError(404, "Solicitação não encontrada.");
      if (!input.can_manage && request.user_id !== input.user_id) {
        throw new ServiceError(404, "Solicitação não encontrada.");
      }
      if (!this.storage)
        throw new ServiceError(503, "Armazenamento de certificados Nitro não configurado.");
      return { url: await this.storage.createSignedAccessUrl(request.certificate_path) };
    } catch (err: unknown) {
      logError("Erro ao acessar certificado de horas Nitro", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao acessar certificado de horas.", err);
    }
  }
}
