import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import { TRIAGE_OVERVIEW_STATUS_VALUES } from "../schemas/triageOverview.schemas.js";

export type TriageOverviewStatus =
  | "URGENT_OPEN"
  | "ROUTINE_PENDING"
  | "BANK_PENDING"
  | "COMPLETE"
  | "NO_APPLICABLE_ITEMS";

export type TriageOverviewPrisma = Pick<PrismaClient, "$executeRaw" | "$queryRaw" | "$transaction">;

export interface TriageOverviewAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
  modules?: Record<string, number>;
}

export interface ListTriageOverviewInput {
  page: number;
  pageSize: number;
  clientId?: string;
  competence?: string;
  status?: TriageOverviewStatus;
}

export interface TriageOverviewItem {
  client_id: string;
  legal_name: string;
  competence: string;
  status: TriageOverviewStatus;
}

export interface TriageOverviewIndicators {
  urgent_open: number;
  routine_pending: number;
  bank_pending: number;
  complete: number;
  no_applicable_items: number;
}

export interface TriageOverviewResult {
  items: TriageOverviewItem[];
  total: number;
  page: number;
  page_size: number;
  indicators: TriageOverviewIndicators;
}

export interface TriageOverviewStatusSources {
  routineChecklists: unknown[];
  bankStatuses: unknown[];
  urgentStatuses: unknown[];
}

interface TriageOverviewQueryRow {
  items: unknown;
  total: number;
  urgent_open: number;
  routine_pending: number;
  bank_pending: number;
  complete: number;
  no_applicable_items: number;
}

function requireContext(auth: TriageOverviewAuthContext): void {
  if (!auth.userId || !auth.organizationId) {
    throw new ServiceError(400, "Contexto autenticado incompleto.");
  }
}

function modulePermission(auth: TriageOverviewAuthContext): number {
  return auth.modules ? (auth.modules.triagem ?? 0) : (auth.permission ?? 0);
}

function requireViewPermission(auth: TriageOverviewAuthContext): void {
  if (modulePermission(auth) < 1) {
    throw new ServiceError(403, "Permissão insuficiente para consultar a Triagem.");
  }
}

function isPendingStatus(status: unknown): boolean {
  return status !== "COMPLETED" && status !== "NOT_APPLICABLE";
}

function checklistStatuses(checklists: unknown[]): unknown[] {
  return checklists.flatMap((rawChecklist) =>
    rawChecklist && typeof rawChecklist === "object" && !Array.isArray(rawChecklist)
      ? Object.values(rawChecklist)
      : [],
  );
}

function hasPendingRoutine(checklists: unknown[]): boolean {
  return checklists.some((rawChecklist) => {
    const checklist =
      rawChecklist && typeof rawChecklist === "object" && !Array.isArray(rawChecklist)
        ? rawChecklist
        : {};
    return Object.values(checklist).some((status) => isPendingStatus(status));
  });
}

export function deriveTriageOverviewStatus(
  sources: TriageOverviewStatusSources,
): TriageOverviewStatus {
  if (sources.urgentStatuses.some((status) => status === "OPEN")) {
    return "URGENT_OPEN";
  }
  if (hasPendingRoutine(sources.routineChecklists)) {
    return "ROUTINE_PENDING";
  }
  if (sources.bankStatuses.some((status) => isPendingStatus(status))) {
    return "BANK_PENDING";
  }
  const hasApplicable = [
    ...checklistStatuses(sources.routineChecklists),
    ...sources.bankStatuses,
  ].some((status) => status !== "NOT_APPLICABLE");
  return hasApplicable ? "COMPLETE" : "NO_APPLICABLE_ITEMS";
}

function overviewItems(value: unknown): TriageOverviewItem[] {
  if (!Array.isArray(value)) {
    throw new ServiceError(500, "Resposta inválida do painel consolidado da Triagem.");
  }

  return value.map((item) => {
    const candidate =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (
      !candidate ||
      typeof candidate.client_id !== "string" ||
      typeof candidate.legal_name !== "string" ||
      typeof candidate.competence !== "string" ||
      typeof candidate.status !== "string" ||
      !(TRIAGE_OVERVIEW_STATUS_VALUES as readonly string[]).includes(candidate.status)
    ) {
      throw new ServiceError(500, "Resposta inválida do painel consolidado da Triagem.");
    }

    return {
      client_id: candidate.client_id,
      legal_name: candidate.legal_name,
      competence: candidate.competence,
      status: candidate.status as TriageOverviewStatus,
    };
  });
}

export class TriageOverviewService {
  constructor(private readonly prisma: TriageOverviewPrisma) {}

  async list(
    input: ListTriageOverviewInput,
    auth: TriageOverviewAuthContext,
  ): Promise<TriageOverviewResult> {
    requireContext(auth);
    requireViewPermission(auth);
    if (!Number.isInteger(input.page) || input.page < 1) {
      throw new ServiceError(400, "Página inválida.");
    }
    if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
      throw new ServiceError(400, "Tamanho de página inválido.");
    }

    return this.withOrganization(auth, async (transaction) => {
      const clientId = input.clientId ?? null;
      const competence = input.competence ?? null;
      const status = input.status ?? null;
      const offset = (input.page - 1) * input.pageSize;
      const [row] = await transaction.$queryRaw<TriageOverviewQueryRow[]>`
        WITH eligible AS (
          SELECT
            competence.client_id,
            competence.competence,
            COALESCE(NULLIF(BTRIM(client.company_name), ''), client.name) AS legal_name
          FROM "triagem.competences" AS competence
          INNER JOIN clients AS client
            ON client.id = competence.client_id
           AND client.organization_id = competence.organization_id
          WHERE competence.organization_id = ${auth.organizationId}
            AND competence.archived_at IS NULL
            AND (${clientId}::text IS NULL OR competence.client_id = ${clientId}::text)
            AND (${competence}::text IS NULL OR competence.competence = ${competence}::text)
        ),
        derived AS (
          SELECT
            eligible.*,
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM "triagem.urgent_requests" AS urgent
                WHERE urgent.organization_id = ${auth.organizationId}
                  AND urgent.client_id = eligible.client_id
                  AND urgent.competence = eligible.competence
                  AND urgent.status = 'OPEN'
              ) THEN 'URGENT_OPEN'
              WHEN EXISTS (
                SELECT 1
                FROM "triagem.monthly" AS monthly
                CROSS JOIN LATERAL jsonb_each(
                  CASE
                    WHEN jsonb_typeof(monthly.checklist::jsonb) = 'object' THEN monthly.checklist::jsonb
                    ELSE '{}'::jsonb
                  END
                ) AS checklist_item
                WHERE monthly.organization_id = ${auth.organizationId}
                  AND monthly.client_id = eligible.client_id
                  AND monthly.competence = eligible.competence
                  AND monthly.archived_at IS NULL
                  AND COALESCE(checklist_item.value #>> '{}', '') NOT IN ('COMPLETED', 'NOT_APPLICABLE')
              ) THEN 'ROUTINE_PENDING'
              WHEN EXISTS (
                SELECT 1
                FROM "triagem.bank_statements" AS bank
                WHERE bank.organization_id = ${auth.organizationId}
                  AND bank.client_id = eligible.client_id
                  AND bank.competence = eligible.competence
                  AND bank.archived_at IS NULL
                  AND COALESCE(bank.status, '') NOT IN ('COMPLETED', 'NOT_APPLICABLE')
              ) THEN 'BANK_PENDING'
              WHEN EXISTS (
                SELECT 1
                FROM "triagem.monthly" AS monthly
                CROSS JOIN LATERAL jsonb_each(
                  CASE
                    WHEN jsonb_typeof(monthly.checklist::jsonb) = 'object' THEN monthly.checklist::jsonb
                    ELSE '{}'::jsonb
                  END
                ) AS checklist_item
                WHERE monthly.organization_id = ${auth.organizationId}
                  AND monthly.client_id = eligible.client_id
                  AND monthly.competence = eligible.competence
                  AND monthly.archived_at IS NULL
                  AND COALESCE(checklist_item.value #>> '{}', '') <> 'NOT_APPLICABLE'
              ) OR EXISTS (
                SELECT 1
                FROM "triagem.bank_statements" AS bank
                WHERE bank.organization_id = ${auth.organizationId}
                  AND bank.client_id = eligible.client_id
                  AND bank.competence = eligible.competence
                  AND bank.archived_at IS NULL
                  AND COALESCE(bank.status, '') <> 'NOT_APPLICABLE'
              ) THEN 'COMPLETE'
              ELSE 'NO_APPLICABLE_ITEMS'
            END AS status
          FROM eligible
        ),
        filtered AS (
          SELECT *
          FROM derived
          WHERE (${status}::text IS NULL OR derived.status = ${status}::text)
        ),
        paged AS (
          SELECT *
          FROM filtered
          ORDER BY competence DESC, LOWER(legal_name), client_id
          OFFSET ${offset}
          LIMIT ${input.pageSize}
        )
        SELECT
          COALESCE(
            (SELECT jsonb_agg(to_jsonb(paged) ORDER BY paged.competence DESC, LOWER(paged.legal_name), paged.client_id) FROM paged),
            '[]'::jsonb
          ) AS items,
          (SELECT COUNT(*)::int FROM filtered) AS total,
          (SELECT COUNT(*)::int FROM filtered WHERE status = 'URGENT_OPEN') AS urgent_open,
          (SELECT COUNT(*)::int FROM filtered WHERE status = 'ROUTINE_PENDING') AS routine_pending,
          (SELECT COUNT(*)::int FROM filtered WHERE status = 'BANK_PENDING') AS bank_pending,
          (SELECT COUNT(*)::int FROM filtered WHERE status = 'COMPLETE') AS complete,
          (SELECT COUNT(*)::int FROM filtered WHERE status = 'NO_APPLICABLE_ITEMS') AS no_applicable_items
      `;

      if (!row) {
        throw new ServiceError(500, "Não foi possível consultar o painel consolidado da Triagem.");
      }

      return {
        items: overviewItems(row.items),
        total: row.total,
        page: input.page,
        page_size: input.pageSize,
        indicators: {
          urgent_open: row.urgent_open,
          routine_pending: row.routine_pending,
          bank_pending: row.bank_pending,
          complete: row.complete,
          no_applicable_items: row.no_applicable_items,
        },
      };
    });
  }

  private async withOrganization<T>(
    auth: TriageOverviewAuthContext,
    callback: (transaction: TriageOverviewPrisma) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "giro_user_runtime"`;
      await transaction.$executeRaw`SELECT set_config('app.organization_id', ${auth.organizationId}, true)`;
      return callback(transaction as unknown as TriageOverviewPrisma);
    });
  }
}
