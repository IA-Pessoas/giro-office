import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CertificateNotificationListQuery } from "../schemas/certificateNotification.schemas.js";
import {
  buildPaginatedResult,
  getPaginationParams,
  type PaginatedResult,
} from "../schemas/pagination.schemas.js";
import { startOfBusinessDay } from "./certificateListSummary.js";

export interface CertificateNotificationListInput {
  organizationId: string;
  query: CertificateNotificationListQuery;
}

export interface CertificateNotificationResult {
  id: string;
  certificate_id: string;
  client_name: string;
  type: string;
  date: Date;
  organization_id: string;
}

export type CertificateNotificationListResult = PaginatedResult<CertificateNotificationResult> & {
  /** Contagem por tipo sobre todas as notificações da organização, não só a página. */
  summary: { pj: number; pf: number };
};

export interface CertificateNotificationRunInput {
  now?: Date;
  windowDays: number;
}

export interface CertificateNotificationRunResult {
  evaluated: number;
  created: number;
  updated: number;
  /** Notificações de certificados que saíram da janela (renovados). */
  removed: number;
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
const certificateNotificationIdentitySelect = {
  certificate_id: true,
  organization_id: true,
  type: true,
};
const RECONCILIATION_BATCH_SIZE = 25;

/** Primeiro dia fora da janela: vence até hoje + windowDays (dia de São Paulo) entra. */
function getWindowEnd(now: Date, windowDays: number): Date {
  const windowEnd = startOfBusinessDay(now);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + windowDays + 1);
  return windowEnd;
}

function getNotificationIdentityKey(
  candidate: Pick<CertificateCandidate, "id" | "organization_id">,
  type: CertificateNotificationType,
): string {
  return `${candidate.organization_id}:${candidate.id}:${type}`;
}

async function runInChunks<T>(
  items: T[],
  chunkSize: number,
  handler: (items: T[]) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < items.length; index += chunkSize) {
    const chunk = items.slice(index, index + chunkSize);
    await handler(chunk);
  }
}

export class CertificateNotificationService {
  constructor(private readonly prisma: PrismaClient) {}

  async listCertificateNotifications(
    input: CertificateNotificationListInput,
  ): Promise<CertificateNotificationListResult> {
    const pagination = getPaginationParams(input.query);
    const where = { organization_id: input.organizationId };
    const [total, pj, pf, items] = await Promise.all([
      this.prisma.certificateNotification.count({ where }),
      this.prisma.certificateNotification.count({ where: { ...where, type: "PJ" } }),
      this.prisma.certificateNotification.count({ where: { ...where, type: "PF" } }),
      this.prisma.certificateNotification.findMany({
        where,
        orderBy: [{ date: "asc" }, { client_name: "asc" }],
        ...pagination,
      }),
    ]);

    return { ...buildPaginatedResult(items, total, input.query), summary: { pj, pf } };
  }

  async runCertificateNotificationReconciliation(
    input: CertificateNotificationRunInput,
  ): Promise<CertificateNotificationRunResult> {
    try {
      const windowEnd = getWindowEnd(input.now ?? new Date(), input.windowDays);
      const [certificatePj, certificatePf] = await Promise.all([
        this.prisma.certificatePJ.findMany({
          where: {
            expiration_date: { lt: windowEnd },
          },
          select: certificateNotificationCandidateSelect,
        }),
        this.prisma.certificatePF.findMany({
          where: {
            expiration_date: { lt: windowEnd },
          },
          select: certificateNotificationCandidateSelect,
        }),
      ]);

      const result: CertificateNotificationRunResult = {
        evaluated: 0,
        created: 0,
        updated: 0,
        removed: 0,
      };

      await this.upsertCertificateNotifications(certificatePj, "PJ", result);
      await this.upsertCertificateNotifications(certificatePf, "PF", result);
      await this.removeStaleNotifications(certificatePj, "PJ", result);
      await this.removeStaleNotifications(certificatePf, "PF", result);

      return result;
    } catch (err: unknown) {
      logError("Erro ao reconciliar notificacoes de certificados", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao reconciliar notificações de certificados.", err);
    }
  }

  private async removeStaleNotifications(
    candidates: CertificateCandidate[],
    type: CertificateNotificationType,
    result: CertificateNotificationRunResult,
  ): Promise<void> {
    // ponytail: `notIn` com todos os candidatos; perto de 65k ids (limite de parâmetros do Postgres),
    // trocar por subconsulta de certificados fora da janela.
    const { count } = await this.prisma.certificateNotification.deleteMany({
      where: { type, certificate_id: { notIn: candidates.map((candidate) => candidate.id) } },
    });
    result.removed += count;
  }

  private async upsertCertificateNotifications(
    candidates: CertificateCandidate[],
    type: CertificateNotificationType,
    result: CertificateNotificationRunResult,
  ): Promise<void> {
    if (candidates.length === 0) {
      return;
    }

    await runInChunks(candidates, RECONCILIATION_BATCH_SIZE, async (chunk) => {
      const existingNotifications = await this.prisma.certificateNotification.findMany({
        where: {
          type,
          organization_id: {
            in: [...new Set(chunk.map((candidate) => candidate.organization_id))],
          },
          certificate_id: { in: chunk.map((candidate) => candidate.id) },
        },
        select: certificateNotificationIdentitySelect,
      });
      const existingKeys = new Set(
        existingNotifications.map(
          (notification) =>
            `${notification.organization_id}:${notification.certificate_id}:${notification.type}`,
        ),
      );

      result.evaluated += chunk.length;
      for (const candidate of chunk) {
        if (existingKeys.has(getNotificationIdentityKey(candidate, type))) {
          result.updated += 1;
        } else {
          result.created += 1;
        }
      }

      await Promise.all(
        chunk.map((candidate) =>
          this.prisma.certificateNotification.upsert({
            where: {
              certificateNotificationIdentity: {
                organization_id: candidate.organization_id,
                certificate_id: candidate.id,
                type,
              },
            },
            update: {
              client_name: candidate.name,
              date: candidate.expiration_date,
            },
            create: {
              certificate_id: candidate.id,
              client_name: candidate.name,
              type,
              date: candidate.expiration_date,
              organization_id: candidate.organization_id,
            },
          }),
        ),
      );
    });
  }
}
