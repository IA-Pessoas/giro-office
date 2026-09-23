import {
  COMMERCIAL_PROSPECTING_EVENT_VERSION,
  COMMERCIAL_PROSPECTING_TRANSITION_EVENT,
  COMMERCIAL_TASK_BILLING_EVENT_VERSION,
  COMMERCIAL_TASK_BILLING_UPDATED_EVENT,
  type CommercialTaskHiringStatus,
  ServiceError,
} from "@workspace/shared";
import { REQUEST_ID_HEADER } from "@workspace/shared/http";
import type { ProspectingStatus } from "../../../services/commercial-service/src/schemas/prospecting.schemas.js";
import { prospectingStatuses } from "../../../services/commercial-service/src/schemas/prospecting.schemas.js";
import type { UpdateTaskBillingBody } from "../../../services/commercial-service/src/schemas/taskBilling.schemas.js";
import type { CommercialWorkerEnv } from "./env.js";

type Delegate = {
  findFirst(args: Record<string, unknown>): Promise<unknown>;
  findMany(args: Record<string, unknown>): Promise<unknown[]>;
  findUnique?(args: Record<string, unknown>): Promise<unknown>;
  create(args: Record<string, unknown>): Promise<unknown>;
  updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  deleteMany?(args: Record<string, unknown>): Promise<{ count: number }>;
  upsert?(args: Record<string, unknown>): Promise<unknown>;
};

export type CommercialPrisma = {
  proposalConfig: Delegate;
  client: Delegate;
  commercialProspecting: Delegate;
  task: Delegate;
  commercialTaskBilling: Delegate;
  commercialOutboxEvent: Delegate;
  emails: Delegate;
  commercialEmailNotification: Delegate;
  $transaction<T>(callback: (tx: CommercialPrisma) => Promise<T>): Promise<T>;
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};

type AuditInput = {
  userId: string;
  organizationId: string;
  action: string;
  referring: string;
  referringId: string;
  changes?: unknown;
  auditCorrelationId?: string;
};

export type CommercialAudit = {
  createLog(input: AuditInput): Promise<void>;
  logUpdateIfChanged(
    input: AuditInput & { oldData: Record<string, unknown>; updatedData: Record<string, unknown> },
  ): Promise<void>;
};

function isPrismaError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function isConflictError(error: unknown): boolean {
  if (isPrismaError(error, "P2002") || isPrismaError(error, "P2034")) return true;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : String(error);
  return /could not serialize access|serialization failure|deadlock detected/iu.test(message);
}

export function createCommercialAudit(
  env: CommercialWorkerEnv,
  requestUrl: string,
): CommercialAudit {
  const send = async (input: AuditInput & Record<string, unknown>): Promise<void> => {
    if (!env.AUDIT_SERVICE || !env.AUDIT_SERVICE_TOKEN) return;
    const now = new Date().toISOString();
    const requestId = input.auditCorrelationId ?? crypto.randomUUID();
    const response = await env.AUDIT_SERVICE.fetch(
      new Request(new URL("/internal/audit/requests", requestUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-service-token": env.AUDIT_SERVICE_TOKEN,
          [REQUEST_ID_HEADER]: requestId,
        },
        body: JSON.stringify({
          requestId,
          organizationId: input.organizationId,
          userId: input.userId,
          method: "ENTITY_CHANGE",
          path: `/${input.referring.replace(/\./gu, "/")}`,
          outcome: "success",
          serviceSource: "commercial-service",
          createdAt: now,
          finishedAt: now,
          action: input.action,
          referring: input.referring,
          referringId: input.referringId,
          changes: input.changes,
        }),
      }),
    );
    if (!response.ok) throw new ServiceError(502, "Auditoria comercial indisponível.");
  };
  return {
    createLog: (input) => send(input),
    async logUpdateIfChanged(input) {
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(input.updatedData)) {
        if (input.oldData[key] !== input.updatedData[key]) {
          changes[key] = { from: input.oldData[key], to: input.updatedData[key] };
        }
      }
      if (Object.keys(changes).length > 0) await send({ ...input, changes });
    },
  };
}

function auditOrNoop(audit?: CommercialAudit): CommercialAudit {
  return (
    audit ?? {
      createLog: async () => {},
      logUpdateIfChanged: async () => {},
    }
  );
}

export interface CommercialProposalConfig {
  id: string;
  name: string;
  contract_value: number;
}

export type ProposalService = {
  list(organizationId: string): Promise<unknown>;
  detail(id: string, organizationId: string): Promise<unknown>;
  create(
    organizationId: string,
    input: Record<string, unknown>,
    context?: ProposalAuditContext,
  ): Promise<unknown>;
  update(
    organizationId: string,
    id: string,
    input: Record<string, unknown>,
    context?: ProposalAuditContext,
  ): Promise<unknown>;
  delete(organizationId: string, id: string, context?: ProposalAuditContext): Promise<unknown>;
};

export type ProposalAuditContext = {
  userId?: string;
  auditCorrelationId?: string;
};

const proposalSelect = { id: true, name: true, contract_value: true };

export class CommercialProposalConfigService implements ProposalService {
  constructor(
    private readonly prisma: CommercialPrisma,
    private readonly audit: CommercialAudit = auditOrNoop(),
  ) {}

  async list(organizationId: string): Promise<CommercialProposalConfig[]> {
    return (await this.prisma.proposalConfig.findMany({
      where: { organization_id: organizationId },
      orderBy: { name: "asc" },
      select: proposalSelect,
    })) as CommercialProposalConfig[];
  }

  async detail(id: string, organizationId: string): Promise<CommercialProposalConfig> {
    const row = (await this.prisma.proposalConfig.findFirst({
      where: { id, organization_id: organizationId },
      select: proposalSelect,
    })) as CommercialProposalConfig | null;
    if (!row) throw new ServiceError(404, "Configuração comercial não encontrada.");
    return row;
  }

  async create(
    organizationId: string,
    input: Record<string, unknown>,
    context: ProposalAuditContext = {},
  ): Promise<CommercialProposalConfig> {
    try {
      const duplicate = await this.prisma.proposalConfig.findFirst({
        where: { name: input.name, organization_id: organizationId },
        select: { id: true },
      });
      if (duplicate) throw new ServiceError(409, "Já existe uma configuração com esse nome.");
      const row = (await this.prisma.proposalConfig.create({
        data: { ...input, organization_id: organizationId },
        select: proposalSelect,
      })) as CommercialProposalConfig;
      await this.audit.createLog({
        userId: context.userId ?? "commercial-worker",
        organizationId,
        action: "Cadastro",
        referring: "proposal.config",
        referringId: row.id,
        changes: {},
        auditCorrelationId: context.auditCorrelationId,
      });
      return row;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (isConflictError(error))
        throw new ServiceError(409, "Já existe uma configuração com esse nome.");
      throw new ServiceError(500, "Não foi possível cadastrar a configuração comercial.", error);
    }
  }

  async update(
    organizationId: string,
    id: string,
    input: Record<string, unknown>,
    context: ProposalAuditContext = {},
  ): Promise<CommercialProposalConfig> {
    try {
      const current = await this.detail(id, organizationId);
      if (input.name !== undefined) {
        const duplicate = await this.prisma.proposalConfig.findFirst({
          where: { name: input.name, organization_id: organizationId, id: { not: id } },
          select: { id: true },
        });
        if (duplicate) throw new ServiceError(409, "Já existe uma configuração com esse nome.");
      }
      const result = await this.prisma.proposalConfig.updateMany({
        where: { id, organization_id: organizationId },
        data: input,
      });
      if (result.count !== 1) throw new ServiceError(404, "Configuração comercial não encontrada.");
      const updated = { ...current, ...input } as CommercialProposalConfig;
      await this.audit.logUpdateIfChanged({
        userId: context.userId ?? "commercial-worker",
        organizationId,
        action: "Atualização",
        referring: "proposal.config",
        referringId: id,
        oldData: current as unknown as Record<string, unknown>,
        updatedData: updated as unknown as Record<string, unknown>,
        auditCorrelationId: context.auditCorrelationId,
      });
      return updated;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (isConflictError(error))
        throw new ServiceError(
          409,
          "A configuração comercial foi alterada simultaneamente.",
          error,
        );
      throw new ServiceError(500, "Não foi possível atualizar a configuração comercial.", error);
    }
  }

  async delete(
    organizationId: string,
    id: string,
    context: ProposalAuditContext = {},
  ): Promise<{ id: string; deleted: true }> {
    try {
      const result = await this.prisma.proposalConfig.deleteMany?.({
        where: { id, organization_id: organizationId },
      });
      if (result?.count !== 1)
        throw new ServiceError(404, "Configuração comercial não encontrada.");
      await this.audit.createLog({
        userId: context.userId ?? "commercial-worker",
        organizationId,
        action: "Exclusão",
        referring: "proposal.config",
        referringId: id,
        changes: {},
        auditCorrelationId: context.auditCorrelationId,
      });
      return { id, deleted: true };
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (isConflictError(error))
        throw new ServiceError(
          409,
          "A configuração comercial foi alterada simultaneamente.",
          error,
        );
      if (isPrismaError(error, "P2003"))
        throw new ServiceError(409, "Configuração possui referências.");
      throw new ServiceError(500, "Não foi possível excluir a configuração comercial.", error);
    }
  }
}

export type ProspectingStatusValue = ProspectingStatus;
export type ProspectingInput = {
  user_id: string;
  organization_id: string;
  client_id: string;
  status: ProspectingStatus;
  status_date?: Date | null;
  description?: string | null;
  audit_correlation_id?: string;
};
export type ProspectingUpdateInput = Omit<ProspectingInput, "client_id" | "status"> & {
  prospecting_id: string;
  status?: ProspectingStatus;
};
export type ProspectingArchiveInput = Pick<
  ProspectingInput,
  "user_id" | "organization_id" | "audit_correlation_id"
> & {
  prospecting_id: string;
};

export type ProspectingService = {
  list(organizationId: string): Promise<unknown>;
  listClients(organizationId: string): Promise<unknown>;
  detail(id: string, organizationId: string): Promise<unknown>;
  create(input: ProspectingInput): Promise<unknown>;
  update(input: ProspectingUpdateInput): Promise<unknown>;
  archive(input: ProspectingArchiveInput): Promise<unknown>;
};

function assertProspectingTransition(current: string, next: ProspectingStatus): void {
  if (!prospectingStatuses.includes(current as ProspectingStatus)) {
    throw new ServiceError(409, "A prospecção possui um status legado não suportado.");
  }
  if (current === "Fechado" && next !== "Fechado") {
    throw new ServiceError(409, "Uma prospecção fechada não pode ser reaberta.");
  }
}

type ProspectingRow = {
  id: string;
  client_id: string;
  status: string;
  status_date: Date | null;
  description: string | null;
  client?: Record<string, unknown>;
  organization_id?: string;
};

export class CommercialProspectingService implements ProspectingService {
  constructor(
    private readonly prisma: CommercialPrisma,
    private readonly audit: CommercialAudit = auditOrNoop(),
  ) {}

  private async withClient(row: ProspectingRow): Promise<Record<string, unknown>> {
    const publicRow = {
      id: row.id,
      client_id: row.client_id,
      status: row.status,
      status_date: row.status_date,
      description: row.description,
    };
    if (row.client) return { ...publicRow, client: row.client };
    const client = await this.prisma.client.findFirst({
      where: { id: row.client_id, organization_id: row.organization_id },
      select: { id: true, name: true, company_name: true, fantasy_name: true },
    });
    return { ...publicRow, client: client ?? null };
  }

  async list(organizationId: string): Promise<unknown> {
    const rows = (await this.prisma.commercialProspecting.findMany({
      where: { organization_id: organizationId, archived_at: null },
      orderBy: [{ status: "asc" }, { updated_at: "desc" }],
      select: { id: true, client_id: true, status: true, status_date: true, description: true },
    })) as ProspectingRow[];
    return Promise.all(
      rows.map((row) => this.withClient({ ...row, organization_id: organizationId })),
    );
  }

  async listClients(organizationId: string): Promise<unknown> {
    const [clients, prospectings] = await Promise.all([
      this.prisma.client.findMany({
        where: { organization_id: organizationId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, company_name: true, fantasy_name: true },
      }),
      this.prisma.commercialProspecting.findMany({
        where: { organization_id: organizationId },
        select: { client_id: true },
      }),
    ]);
    const used = new Set(
      prospectings.map((row) => String((row as Record<string, unknown>).client_id)),
    );
    return clients.filter((row) => !used.has(String((row as Record<string, unknown>).id)));
  }

  async detail(id: string, organizationId: string): Promise<unknown> {
    const row = (await this.prisma.commercialProspecting.findFirst({
      where: { id, organization_id: organizationId, archived_at: null },
      select: { id: true, client_id: true, status: true, status_date: true, description: true },
    })) as ProspectingRow | null;
    if (!row) throw new ServiceError(404, "Prospecção comercial não encontrada.");
    return this.withClient({ ...row, organization_id: organizationId });
  }

  private event(input: {
    eventId: string;
    organizationId: string;
    clientId: string;
    prospectingId: string;
    fromStatus: string | null;
    toStatus: string;
    statusDate: Date | null;
    description: string | null;
    auditCorrelationId: string;
  }) {
    return {
      event_id: input.eventId,
      event_type: COMMERCIAL_PROSPECTING_TRANSITION_EVENT,
      event_version: COMMERCIAL_PROSPECTING_EVENT_VERSION,
      organization_id: input.organizationId,
      client_id: input.clientId,
      prospecting_id: input.prospectingId,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      status_date: input.statusDate?.toISOString() ?? null,
      description: input.description,
      audit_correlation_id: input.auditCorrelationId,
      occurred_at: new Date().toISOString(),
    };
  }

  async create(input: ProspectingInput): Promise<unknown> {
    const eventId = crypto.randomUUID();
    const auditCorrelationId = input.audit_correlation_id ?? eventId;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const client = await tx.client.findFirst({
          where: { id: input.client_id, organization_id: input.organization_id },
          select: { id: true, name: true, company_name: true, fantasy_name: true },
        });
        if (!client) throw new ServiceError(404, "Cliente não encontrado nesta organização.");
        const duplicate = await tx.commercialProspecting.findFirst({
          where: { client_id: input.client_id, organization_id: input.organization_id },
          select: { id: true },
        });
        if (duplicate)
          throw new ServiceError(409, "Este cliente já possui uma prospecção nesta organização.");
        const row = (await tx.commercialProspecting.create({
          data: {
            client_id: input.client_id,
            organization_id: input.organization_id,
            status: input.status,
            status_date: input.status_date ?? new Date(),
            description: input.description ?? null,
          },
          select: { id: true, client_id: true, status: true, status_date: true, description: true },
        })) as ProspectingRow;
        const payload = this.event({
          eventId,
          organizationId: input.organization_id,
          clientId: row.client_id,
          prospectingId: row.id,
          fromStatus: null,
          toStatus: row.status,
          statusDate: row.status_date,
          description: row.description,
          auditCorrelationId,
        });
        await tx.commercialOutboxEvent.create({
          data: {
            id: eventId,
            organization_id: input.organization_id,
            aggregate_id: row.id,
            event_type: payload.event_type,
            event_version: payload.event_version,
            payload,
            audit_correlation_id: auditCorrelationId,
          },
        });
        return { ...row, client };
      });
      await this.audit.createLog({
        userId: input.user_id,
        organizationId: input.organization_id,
        action: "Cadastro",
        referring: "commercial.prospecting",
        referringId: String((created as ProspectingRow).id),
        changes: { status: input.status, client_id: input.client_id },
        auditCorrelationId,
      });
      return created;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (isConflictError(error))
        throw new ServiceError(
          409,
          "Este cliente já possui uma prospecção nesta organização.",
          error,
        );
      throw new ServiceError(500, "Não foi possível cadastrar a prospecção comercial.", error);
    }
  }

  async update(input: ProspectingUpdateInput): Promise<unknown> {
    const eventId = crypto.randomUUID();
    const auditCorrelationId = input.audit_correlation_id ?? eventId;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const current = (await tx.commercialProspecting.findFirst({
          where: {
            id: input.prospecting_id,
            organization_id: input.organization_id,
            archived_at: null,
          },
          select: { id: true, client_id: true, status: true, status_date: true, description: true },
        })) as ProspectingRow | null;
        if (!current) throw new ServiceError(404, "Prospecção comercial não encontrada.");
        const nextStatus = input.status ?? (current.status as ProspectingStatus);
        assertProspectingTransition(current.status, nextStatus);
        const data = {
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.status_date !== undefined ? { status_date: input.status_date } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        };
        const updated = await tx.commercialProspecting.updateMany({
          where: {
            id: input.prospecting_id,
            organization_id: input.organization_id,
            archived_at: null,
          },
          data,
        });
        if (updated.count !== 1)
          throw new ServiceError(404, "Prospecção comercial não encontrada.");
        const row = (await tx.commercialProspecting.findFirst({
          where: {
            id: input.prospecting_id,
            organization_id: input.organization_id,
            archived_at: null,
          },
          select: { id: true, client_id: true, status: true, status_date: true, description: true },
        })) as ProspectingRow | null;
        if (!row) throw new ServiceError(404, "Prospecção comercial não encontrada.");
        if (input.status !== undefined && current.status !== row.status) {
          const payload = this.event({
            eventId,
            organizationId: input.organization_id,
            clientId: row.client_id,
            prospectingId: row.id,
            fromStatus: current.status,
            toStatus: row.status,
            statusDate: row.status_date,
            description: row.description,
            auditCorrelationId,
          });
          await tx.commercialOutboxEvent.create({
            data: {
              id: eventId,
              organization_id: input.organization_id,
              aggregate_id: row.id,
              event_type: payload.event_type,
              event_version: payload.event_version,
              payload,
              audit_correlation_id: auditCorrelationId,
            },
          });
        }
        return { current, row };
      });
      await this.audit.logUpdateIfChanged({
        userId: input.user_id,
        organizationId: input.organization_id,
        action: "Atualização",
        referring: "commercial.prospecting",
        referringId: input.prospecting_id,
        oldData: result.current as unknown as Record<string, unknown>,
        updatedData: result.row as unknown as Record<string, unknown>,
        changes: {},
        auditCorrelationId,
      });
      return this.withClient({ ...result.row, organization_id: input.organization_id });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (isConflictError(error))
        throw new ServiceError(409, "A prospecção comercial foi alterada simultaneamente.", error);
      throw new ServiceError(500, "Não foi possível atualizar a prospecção comercial.", error);
    }
  }

  async archive(input: ProspectingArchiveInput): Promise<{ id: string; deleted: true }> {
    try {
      const archivedAt = new Date();
      const result = await this.prisma.commercialProspecting.updateMany({
        where: {
          id: input.prospecting_id,
          organization_id: input.organization_id,
          archived_at: null,
        },
        data: { archived_at: archivedAt },
      });
      if (result.count !== 1) {
        const existing = await this.prisma.commercialProspecting.findFirst({
          where: { id: input.prospecting_id, organization_id: input.organization_id },
          select: { id: true, archived_at: true },
        });
        if (!existing) throw new ServiceError(404, "Prospecção comercial não encontrada.");
      }
      await this.audit.createLog({
        userId: input.user_id,
        organizationId: input.organization_id,
        action: "Arquivamento",
        referring: "commercial.prospecting",
        referringId: input.prospecting_id,
        changes: { archived_at: archivedAt.toISOString() },
        auditCorrelationId: input.audit_correlation_id,
      });
      return { id: input.prospecting_id, deleted: true };
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (isConflictError(error))
        throw new ServiceError(409, "A prospecção comercial foi alterada simultaneamente.", error);
      throw new ServiceError(500, "Não foi possível arquivar a prospecção comercial.", error);
    }
  }
}

export type BillingInput = UpdateTaskBillingBody & {
  user_id: string;
  organization_id: string;
  task_id: string;
  audit_correlation_id?: string;
};

export type BillingService = {
  list(organizationId: string): Promise<unknown>;
  update(input: BillingInput): Promise<unknown>;
};

export class CommercialTaskBillingService implements BillingService {
  constructor(
    private readonly prisma: CommercialPrisma,
    private readonly audit: CommercialAudit = auditOrNoop(),
  ) {}

  async list(organizationId: string): Promise<unknown> {
    const tasks = await this.prisma.task.findMany({
      where: { organization_id: organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true, billing: true },
    });
    const billings = (await this.prisma.commercialTaskBilling.findMany({
      where: { organization_id: organizationId },
      select: {
        id: true,
        task_id: true,
        hiring_status: true,
        payment: true,
        billing_description: true,
      },
    })) as Array<Record<string, unknown>>;
    const byTask = new Map(billings.map((row) => [String(row.task_id), row]));
    return tasks.map((task) => {
      const row = task as Record<string, unknown>;
      const billing = byTask.get(String(row.id));
      return {
        id: billing?.id ?? null,
        task_id: row.id,
        task_name: row.name,
        task_status: row.status,
        billing: row.billing,
        hiring_status: billing?.hiring_status ?? null,
        payment: billing?.payment ?? null,
        billing_description: billing?.billing_description ?? null,
      };
    });
  }

  async update(input: BillingInput): Promise<unknown> {
    const eventId = crypto.randomUUID();
    const auditCorrelationId = input.audit_correlation_id ?? eventId;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const task = (await tx.task.findFirst({
          where: { id: input.task_id, organization_id: input.organization_id },
          select: { id: true, name: true, status: true, billing: true },
        })) as Record<string, unknown> | null;
        if (!task) throw new ServiceError(404, "Tarefa não encontrada nesta organização.");
        const current = (await tx.commercialTaskBilling.findUnique?.({
          where: { task_id: input.task_id },
          select: {
            id: true,
            organization_id: true,
            hiring_status: true,
            payment: true,
            billing_description: true,
          },
        })) as Record<string, unknown> | null;
        if (current && current.organization_id !== input.organization_id) {
          throw new ServiceError(409, "Cobrança comercial pertence a outra organização.");
        }
        const updated = (await tx.commercialTaskBilling.upsert?.({
          where: { task_id: input.task_id },
          create: {
            task_id: input.task_id,
            organization_id: input.organization_id,
            hiring_status: input.hiring_status,
            payment: input.payment ?? null,
            billing_description: input.billing_description ?? null,
          },
          update: {
            hiring_status: input.hiring_status,
            ...(input.payment !== undefined ? { payment: input.payment } : {}),
            ...(input.billing_description !== undefined
              ? { billing_description: input.billing_description }
              : {}),
          },
          select: {
            id: true,
            task_id: true,
            hiring_status: true,
            payment: true,
            billing_description: true,
          },
        })) as Record<string, unknown>;
        const payload = {
          event_id: eventId,
          event_type: COMMERCIAL_TASK_BILLING_UPDATED_EVENT,
          event_version: COMMERCIAL_TASK_BILLING_EVENT_VERSION,
          organization_id: input.organization_id,
          task_id: input.task_id,
          hiring_status: updated.hiring_status as CommercialTaskHiringStatus,
          payment: updated.payment ?? null,
          billing_description: updated.billing_description ?? null,
          audit_correlation_id: auditCorrelationId,
          occurred_at: new Date().toISOString(),
        };
        await tx.commercialOutboxEvent.create({
          data: {
            id: eventId,
            organization_id: input.organization_id,
            aggregate_id: input.task_id,
            event_type: payload.event_type,
            event_version: payload.event_version,
            payload,
            audit_correlation_id: auditCorrelationId,
          },
        });
        return { task, current: current ?? {}, updated };
      });
      await this.audit.logUpdateIfChanged({
        userId: input.user_id,
        organizationId: input.organization_id,
        action: "Atualização de Cobrança Comercial",
        referring: "commercial.task_billing",
        referringId: input.task_id,
        oldData: result.current,
        updatedData: result.updated,
        changes: {},
        auditCorrelationId,
      });
      return {
        id: result.updated.id,
        task_id: input.task_id,
        task_name: result.task.name,
        task_status: result.task.status,
        billing: result.task.billing,
        hiring_status: result.updated.hiring_status,
        payment: result.updated.payment ?? null,
        billing_description: result.updated.billing_description ?? null,
      };
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (isConflictError(error))
        throw new ServiceError(409, "A cobrança comercial foi alterada simultaneamente.", error);
      throw new ServiceError(500, "Não foi possível atualizar a cobrança comercial.", error);
    }
  }
}

export type OutboxStatusService = {
  status(organizationId: string): Promise<unknown>;
};

export class CommercialOutboxStatusService implements OutboxStatusService {
  constructor(private readonly prisma: CommercialPrisma) {}

  async status(organizationId: string): Promise<unknown> {
    const rows = (await this.prisma.commercialOutboxEvent.findMany({
      where: { organization_id: organizationId },
      select: { status: true, attempts: true, last_error: true },
      orderBy: { updated_at: "desc" },
      take: 50,
    })) as Array<{ status: string; attempts: number; last_error: string | null }>;
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
    const failure = rows.find((row) => row.status === "failed" || row.last_error !== null);
    const emailRows = (await this.prisma.commercialEmailNotification.findMany({
      where: { organization_id: organizationId },
      select: { status: true, attempts: true, last_error: true },
      orderBy: { updated_at: "desc" },
      take: 50,
    })) as Array<{ status: string; attempts: number; last_error: string | null }>;
    const emailCounts: Record<string, number> = {};
    for (const row of emailRows) emailCounts[row.status] = (emailCounts[row.status] ?? 0) + 1;
    const latestEmailFailure = emailRows.find(
      (row) => row.status === "failed" || row.last_error !== null,
    );
    return {
      counts,
      latestFailure: failure ?? null,
      emailCounts,
      latestEmailFailure: latestEmailFailure ?? null,
    };
  }
}

export function createCommercialServices(
  prisma: CommercialPrisma,
  env: CommercialWorkerEnv,
  requestUrl: string,
): {
  proposal: ProposalService;
  prospecting: ProspectingService;
  billing: BillingService;
  outbox: OutboxStatusService;
} {
  const audit = createCommercialAudit(env, requestUrl);
  return {
    proposal: new CommercialProposalConfigService(prisma, audit),
    prospecting: new CommercialProspectingService(prisma, audit),
    billing: new CommercialTaskBillingService(prisma, audit),
    outbox: new CommercialOutboxStatusService(prisma),
  };
}
