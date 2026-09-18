import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CreateObligationBody,
  DetailObligationQuery,
  UpdateObligationFieldBody,
} from "../schemas/obligation.schemas.js";
import type { PessoalAuditService } from "./pessoalAuditService.js";
import { NO_OBLIGATIONS_GROUP_POLICY, NORMAL_GROUP_POLICY } from "./pessoalGroupPolicy.js";
import { ensurePessoalResponsible } from "./pessoalResponsibleService.js";
import {
  PESSOAL_WRITE_PERMISSION,
  type PessoalAuthContext,
  requireMinimumPermission,
  requireUserId,
} from "./pessoalServiceTypes.js";

const OBLIGATION_CREATE_CHUNK_SIZE = 50;

const obligationSelect = {
  id: true,
  client_id: true,
  competence: true,
  responsavel_id: true,
  advance: true,
  payroll: true,
  charges: true,
  assistance_fee: true,
  bem_mais: true,
  bsf: true,
  va: true,
  vt: true,
  group_snapshot_id: true,
  group_snapshot_name: true,
  group_snapshot_policy: true,
  organization_id: true,
} as const;

const payrollDefaultsSelect = {
  client_id: true,
  responsible_id: true,
  advance: true,
  assistance_fee: true,
  bem_mais: true,
  bsf: true,
  va: true,
  vt: true,
  group: {
    select: {
      id: true,
      name: true,
      policy: true,
      archived_at: true,
      organization_id: true,
    },
  },
} as const;

type PayrollDefaults = {
  client_id: string;
  responsible_id: string | null;
  advance: boolean;
  assistance_fee: boolean;
  bem_mais: boolean;
  bsf: boolean;
  va: boolean;
  vt: boolean;
  group: {
    id: string;
    name: string;
    policy: string;
    archived_at: Date | null;
    organization_id: string;
  } | null;
};

type ObligationCreateData = {
  client_id: string;
  competence: string;
  responsavel_id: string | null;
  advance: boolean | null;
  payroll: boolean | null;
  charges: boolean | null;
  assistance_fee: boolean | null;
  bem_mais: boolean | null;
  bsf: boolean | null;
  va: boolean | null;
  vt: boolean | null;
  group_snapshot_id: string;
  group_snapshot_name: string;
  group_snapshot_policy: string;
  organization_id: string;
};

export type ObligationRecord = Omit<
  ObligationCreateData,
  "group_snapshot_id" | "group_snapshot_name" | "group_snapshot_policy"
> & {
  id: string;
  group_snapshot_id: string | null;
  group_snapshot_name: string | null;
  group_snapshot_policy: string | null;
};

export interface CreateObligationResult {
  created: boolean;
  obligation: ObligationRecord | null;
  skippedNoObligations: boolean;
}

export interface GenerateObligationResult {
  clients: number;
  payrollRows: number;
  existing: number;
  created: number;
  skippedExisting: number;
  skippedArchivedGroup: number;
  skippedNoObligations: number;
  skippedNoGroup: number;
  skippedNoPayroll: number;
}

export class ObligationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: PessoalAuditService,
  ) {}

  async create(
    context: PessoalAuthContext,
    body: CreateObligationBody,
  ): Promise<CreateObligationResult> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      await this.ensureClient(context.organizationId, body.client_id);

      const existing = await this.prisma.obrigationsPessoal.findFirst({
        where: {
          organization_id: context.organizationId,
          client_id: body.client_id,
          competence: body.competence,
        },
        select: obligationSelect,
      });

      if (existing) {
        return { created: false, obligation: existing, skippedNoObligations: false };
      }

      const payroll = await this.prisma.payroll.findFirst({
        where: { organization_id: context.organizationId, client_id: body.client_id },
        select: payrollDefaultsSelect,
      });
      if (!payroll) {
        throw new ServiceError(404, "Folha de pessoal nao encontrada para o cliente.");
      }
      const group = payroll.group;
      if (!group) {
        throw new ServiceError(409, "Folha de pessoal sem grupo canonico para gerar obrigacao.");
      }
      if (group.organization_id !== context.organizationId) {
        throw new ServiceError(409, "Grupo de pessoal invalido para a organizacao.");
      }
      if (group.archived_at) {
        throw new ServiceError(409, "Grupo de pessoal arquivado nao gera novas obrigacoes.");
      }
      if (group.policy === NO_OBLIGATIONS_GROUP_POLICY) {
        return { created: false, obligation: null, skippedNoObligations: true };
      }
      if (group.policy !== NORMAL_GROUP_POLICY) {
        throw new ServiceError(409, "Politica de grupo de pessoal invalida.");
      }

      let createdByInsert = true;
      let obligation: ObligationRecord;
      try {
        obligation = await this.prisma.obrigationsPessoal.create({
          data: buildObligationData(context.organizationId, body.competence, { ...payroll, group }),
          select: obligationSelect,
        });
      } catch (err: unknown) {
        if (!isUniqueConstraintError(err)) {
          throw err;
        }

        const duplicated = await this.prisma.obrigationsPessoal.findFirst({
          where: {
            organization_id: context.organizationId,
            client_id: body.client_id,
            competence: body.competence,
          },
          select: obligationSelect,
        });
        if (!duplicated) {
          throw err;
        }

        createdByInsert = false;
        obligation = duplicated;
      }

      if (!createdByInsert) {
        return { created: false, obligation, skippedNoObligations: false };
      }

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Cadastro",
        referring: "pessoal.obrigations",
        referringId: obligation.id,
        changes: {},
        path: `/pessoal/obrigations/${obligation.id}`,
      });

      return { created: true, obligation, skippedNoObligations: false };
    } catch (err: unknown) {
      logError("Erro ao criar obrigacao de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar obrigacao de pessoal.", err);
    }
  }

  async detail(
    context: Pick<PessoalAuthContext, "organizationId">,
    query: DetailObligationQuery,
  ): Promise<ObligationRecord | null> {
    return this.prisma.obrigationsPessoal.findFirst({
      where: {
        organization_id: context.organizationId,
        client_id: query.client_id,
        competence: query.competence,
      },
      select: obligationSelect,
    });
  }

  async updateField(
    context: PessoalAuthContext,
    id: string,
    body: UpdateObligationFieldBody,
  ): Promise<ObligationRecord> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      const existing = await this.prisma.obrigationsPessoal.findFirst({
        where: { id, organization_id: context.organizationId },
        select: obligationSelect,
      });
      if (!existing) {
        throw new ServiceError(404, "Obrigacao de pessoal nao encontrada.");
      }
      await ensurePessoalResponsible(
        this.prisma,
        context.organizationId,
        body.responsavel_id,
        existing.responsavel_id,
      );

      const updated = await this.prisma.obrigationsPessoal.update({
        where: { id },
        data: body,
        select: obligationSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Atualizacao",
        referring: "pessoal.obrigations",
        referringId: id,
        changes: body,
        path: `/pessoal/obrigations/${id}`,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar obrigacao de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar obrigacao de pessoal.", err);
    }
  }

  async generateForCompetence(
    context: PessoalAuthContext,
    competence: string,
  ): Promise<GenerateObligationResult> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      const clients = await this.prisma.client.findMany({
        where: {
          organization_id: context.organizationId,
          status: "Ativo",
          pessoal: true,
        },
        select: { id: true },
      });

      const clientIds = clients.map((client) => client.id);
      if (clientIds.length === 0) {
        return {
          clients: 0,
          payrollRows: 0,
          existing: 0,
          created: 0,
          skippedExisting: 0,
          skippedArchivedGroup: 0,
          skippedNoObligations: 0,
          skippedNoGroup: 0,
          skippedNoPayroll: 0,
        };
      }

      const [payrollRows, existingObligations] = await Promise.all([
        this.prisma.payroll.findMany({
          where: {
            organization_id: context.organizationId,
            client_id: { in: clientIds },
          },
          select: payrollDefaultsSelect,
        }),
        this.prisma.obrigationsPessoal.findMany({
          where: {
            organization_id: context.organizationId,
            competence,
            client_id: { in: clientIds },
          },
          select: { client_id: true },
        }),
      ]);

      const payrollByClientId = new Map(payrollRows.map((payroll) => [payroll.client_id, payroll]));
      const existingClientIds = new Set(
        existingObligations.map((obligation) => obligation.client_id),
      );
      const createData: ObligationCreateData[] = [];
      let skippedNoPayroll = 0;
      let skippedArchivedGroup = 0;
      let skippedNoObligations = 0;
      let skippedNoGroup = 0;

      for (const clientId of clientIds) {
        if (existingClientIds.has(clientId)) {
          continue;
        }

        const payroll = payrollByClientId.get(clientId);
        if (!payroll) {
          skippedNoPayroll += 1;
          continue;
        }
        const group = payroll.group;
        if (!group) {
          skippedNoGroup += 1;
          continue;
        }
        if (group.organization_id !== context.organizationId) {
          skippedNoGroup += 1;
          continue;
        }
        if (group.archived_at) {
          skippedArchivedGroup += 1;
          continue;
        }
        if (group.policy === NO_OBLIGATIONS_GROUP_POLICY) {
          skippedNoObligations += 1;
          continue;
        }
        if (group.policy !== NORMAL_GROUP_POLICY) {
          throw new ServiceError(409, "Politica de grupo de pessoal invalida.");
        }

        createData.push(
          buildObligationData(context.organizationId, competence, { ...payroll, group }),
        );
      }

      let created = 0;
      let attemptedCreates = 0;
      for (let index = 0; index < createData.length; index += OBLIGATION_CREATE_CHUNK_SIZE) {
        const chunk = createData.slice(index, index + OBLIGATION_CREATE_CHUNK_SIZE);
        attemptedCreates += chunk.length;
        const result = await this.prisma.obrigationsPessoal.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        created += result.count;
      }

      if (created > 0) {
        await this.auditService.recordChange({
          requestId: context.requestId,
          organizationId: context.organizationId,
          userId,
          permission: context.permission,
          action: "Geracao",
          referring: "pessoal.obrigations",
          referringId: competence,
          changes: { competence, created },
          path: `/pessoal/obrigations/competences/${competence}/generate`,
        });
      }

      return {
        clients: clients.length,
        payrollRows: payrollRows.length,
        existing: existingObligations.length,
        created,
        skippedExisting: existingObligations.length + (attemptedCreates - created),
        skippedArchivedGroup,
        skippedNoObligations,
        skippedNoGroup,
        skippedNoPayroll,
      };
    } catch (err: unknown) {
      logError("Erro ao gerar obrigacoes de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao gerar obrigacoes de pessoal.", err);
    }
  }

  private async ensureClient(organizationId: string, clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    if (!client) {
      throw new ServiceError(404, "Cliente nao encontrado para a organizacao.");
    }
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

function defaultFlag(enabled: boolean): boolean | null {
  return enabled ? false : null;
}

function buildObligationData(
  organizationId: string,
  competence: string,
  payroll: PayrollDefaults & { group: NonNullable<PayrollDefaults["group"]> },
): ObligationCreateData {
  return {
    client_id: payroll.client_id,
    competence,
    responsavel_id: payroll.responsible_id ?? null,
    advance: defaultFlag(payroll.advance),
    payroll: false,
    charges: false,
    assistance_fee: defaultFlag(payroll.assistance_fee),
    bem_mais: defaultFlag(payroll.bem_mais),
    bsf: defaultFlag(payroll.bsf),
    va: defaultFlag(payroll.va),
    vt: defaultFlag(payroll.vt),
    group_snapshot_id: payroll.group.id,
    group_snapshot_name: payroll.group.name,
    group_snapshot_policy: payroll.group.policy,
    organization_id: organizationId,
  };
}
