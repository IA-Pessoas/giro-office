import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";

export interface CertificateNotificationListInput {
  organizationId: string;
}

export interface CertificateNotificationResult {
  id: string;
  certificate_id: string;
  client_name: string;
  type: string;
  date: Date;
  organization_id: string;
}

export type CertificateNotificationListResult = CertificateNotificationResult[];

export interface CertificateNotificationRunInput {
  now?: Date;
  windowDays: number;
}

export interface CertificateNotificationRunResult {
  evaluated: number;
  created: number;
  updated: number;
}

interface CertificateCandidate {
  id: string;
  name: string;
  expiration_date: Date;
  organization_id: string;
}

type CertificateNotificationType = "PJ" | "PF";

const certificateNotificationCandidateSelect = {
  id: true,
  name: true,
  expiration_date: true,
  organization_id: true,
};

function getWindowEnd(now: Date, windowDays: number): Date {
  const windowEnd = new Date(now);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + windowDays);
  windowEnd.setUTCHours(23, 59, 59, 999);
  return windowEnd;
}

export class CertificateNotificationService {
  constructor(private readonly prisma: PrismaClient) {}

  async listCertificateNotifications(
    input: CertificateNotificationListInput,
  ): Promise<CertificateNotificationListResult> {
    return this.prisma.certificateNotification.findMany({
      where: { organization_id: input.organizationId },
      orderBy: [{ date: "asc" }, { client_name: "asc" }],
    });
  }

  async runCertificateNotificationReconciliation(
    input: CertificateNotificationRunInput,
  ): Promise<CertificateNotificationRunResult> {
    try {
      const windowEnd = getWindowEnd(input.now ?? new Date(), input.windowDays);
      const [certificatePj, certificatePf] = await Promise.all([
        this.prisma.certificatePJ.findMany({
          where: {
            has_certificate: true,
            expiration_date: { lte: windowEnd },
          },
          select: certificateNotificationCandidateSelect,
        }),
        this.prisma.certificatePF.findMany({
          where: {
            has_certificate: true,
            expiration_date: { lte: windowEnd },
          },
          select: certificateNotificationCandidateSelect,
        }),
      ]);

      const result: CertificateNotificationRunResult = {
        evaluated: 0,
        created: 0,
        updated: 0,
      };

      for (const candidate of certificatePj) {
        await this.upsertCertificateNotification(candidate, "PJ", result);
      }
      for (const candidate of certificatePf) {
        await this.upsertCertificateNotification(candidate, "PF", result);
      }

      return result;
    } catch (err: unknown) {
      logError("Erro ao reconciliar notificacoes de certificados", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao reconciliar notificacoes de certificados.", err);
    }
  }

  private async upsertCertificateNotification(
    candidate: CertificateCandidate,
    type: CertificateNotificationType,
    result: CertificateNotificationRunResult,
  ): Promise<void> {
    result.evaluated += 1;

    const existing = await this.prisma.certificateNotification.findFirst({
      where: {
        certificate_id: candidate.id,
        type,
        organization_id: candidate.organization_id,
      },
    });

    if (existing) {
      await this.prisma.certificateNotification.update({
        where: { id: existing.id },
        data: {
          client_name: candidate.name,
          date: candidate.expiration_date,
        },
      });
      result.updated += 1;
      return;
    }

    await this.prisma.certificateNotification.create({
      data: {
        certificate_id: candidate.id,
        client_name: candidate.name,
        type,
        date: candidate.expiration_date,
        organization_id: candidate.organization_id,
      },
    });
    result.created += 1;
  }
}
