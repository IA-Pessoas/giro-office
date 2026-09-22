import {
  executeReportingQuery,
  getContabilReportingFields,
  type ReportingQuery,
  ServiceError,
  type TriageAccountingSummaryDto,
  withReportingSnapshot,
} from "@workspace/shared";
import type { AuditParams, AuditUpdateParams } from "./audit.js";
import {
  type TriageDocumentStatus,
  triageDocumentFields,
  triageDocumentStatuses,
  triageFiscalFields,
} from "./schemas.js";

export type JsonRecord = Record<string, unknown>;
export type QueryArgs = Record<string, unknown>;
type Delegate = {
  findFirst(args: QueryArgs): Promise<JsonRecord | null>;
  findMany(args: QueryArgs): Promise<JsonRecord[]>;
  create(args: QueryArgs): Promise<JsonRecord>;
  update(args: QueryArgs): Promise<JsonRecord>;
  delete(args: QueryArgs): Promise<JsonRecord>;
  upsert(args: QueryArgs): Promise<JsonRecord>;
  updateMany(args: QueryArgs): Promise<{ count: number }>;
  createMany(args: QueryArgs): Promise<{ count: number }>;
};

export type ContabilPrisma = {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  $transaction<T>(
    input: readonly Promise<unknown>[] | ((transaction: ContabilPrisma) => Promise<T>),
    options?: QueryArgs,
  ): Promise<T | unknown[]>;
  client: Delegate;
  controlContabil: Delegate;
  triageClosing: Delegate;
  relationshipContabil: Delegate;
  responsibleContabil: Delegate;
  triageConfig: Delegate;
  triageMonthly: Delegate;
  triageBankStatement: Delegate;
  triageResponsible: Delegate;
  triageCompetence: Delegate;
  triageCatalogItem: Delegate;
  triageCompetenceCatalogSnapshot: Delegate;
};

export type AuthContext = {
  userId: string;
  organizationId: string;
  permission?: number;
  modules?: Record<string, number>;
};

export type Audit = {
  createLog(params: AuditParams): Promise<void>;
  logUpdateIfChanged(params: AuditUpdateParams): Promise<void>;
};

export type ControlService = {
  list(competence: string, organizationId: string): Promise<JsonRecord>;
  create(input: JsonRecord): Promise<JsonRecord>;
  createYear(input: JsonRecord): Promise<JsonRecord>;
  detail(clientId: string, competence: string, organizationId: string): Promise<JsonRecord>;
  updateField(
    id: string,
    field: string,
    value: boolean | string,
    auth: AuthContext,
  ): Promise<JsonRecord>;
  completeAll(id: string, auth: AuthContext): Promise<JsonRecord>;
  archiveCompetence(input: JsonRecord): Promise<JsonRecord>;
  restoreCompetence(input: JsonRecord): Promise<JsonRecord>;
};

export type RelationshipService = {
  create(input: JsonRecord, auth: AuthContext): Promise<JsonRecord>;
  update(id: string, input: JsonRecord, auth: AuthContext): Promise<JsonRecord>;
  getByClientId(clientId: string, organizationId: string): Promise<JsonRecord>;
  delete(id: string, organizationId: string): Promise<JsonRecord>;
};

export type ResponsibleService = RelationshipService;

export type ClosingService = {
  get(input: JsonRecord, organizationId: string): Promise<JsonRecord>;
  update(input: JsonRecord, auth: AuthContext): Promise<JsonRecord>;
  archive(input: JsonRecord, auth: AuthContext): Promise<JsonRecord>;
};

export type OverviewClient = {
  getSummary(input: {
    organizationId: string;
    userId: string;
    permission?: number;
    modules?: Record<string, number>;
    clientId: string;
    competence: string;
    requestId?: string;
  }): Promise<TriageAccountingSummaryDto>;
};

export type DocumentsService = {
  getEditability(
    clientId: string,
    auth: AuthContext,
    type?: "CONTABIL" | "FISCAL",
  ): Promise<JsonRecord>;
  getMonthly(input: JsonRecord, auth: AuthContext): Promise<JsonRecord>;
  getOrCreateMonthly(input: JsonRecord, auth: AuthContext): Promise<JsonRecord>;
  updateItem(id: string, input: JsonRecord, auth: AuthContext): Promise<JsonRecord>;
  updateAll(id: string, input: JsonRecord, auth: AuthContext): Promise<JsonRecord>;
  listStatements(input: JsonRecord, organizationId: string): Promise<unknown[]>;
  upsertStatement(input: JsonRecord, auth: AuthContext): Promise<JsonRecord>;
  archiveStatement(input: JsonRecord, auth: AuthContext): Promise<JsonRecord>;
};

type ReportingDelegate = Pick<Delegate, "findMany">;
export type ReportingService = {
  extract(input: {
    query?: ReportingQuery;
    organizationId: string;
    source: string;
    fields: readonly string[];
    limit: number;
    offset?: number;
  }): Promise<{ rows: readonly JsonRecord[]; reachedLimit: boolean }>;
};

const DEFAULT_CONTROL_DATA: JsonRecord = {
  regenerate_accounting_entries: false,
  check_summary_by_accumulator: false,
  post_accounting_transaction: false,
  import_bank_statements: false,
  reconcile_bank_statements: false,
  reconcile_vendors: false,
  integrate_taxes: false,
  settle_federal_taxes_via_ecac: false,
  settle_state_taxes_via_sefaz_ba: false,
  integrate_payroll: false,
  suspense_accounts: false,
  check_overdrawn_accounts: false,
  general_account_reconciliation: false,
  check_loan_and_interest_accounts: false,
  monthly_closing: false,
  reconcile_icms_pis_cofins: false,
  depreciation: false,
  notes: "",
};
const COMPLETED_CONTROL_DATA: JsonRecord = Object.fromEntries(
  Object.keys(DEFAULT_CONTROL_DATA)
    .filter((key) => key !== "notes")
    .map((key) => [key, true]),
);
const CONTROL_FIELDS = new Set(Object.keys(DEFAULT_CONTROL_DATA));

function serviceError(error: unknown, fallback: string): ServiceError {
  return error instanceof ServiceError ? error : new ServiceError(500, fallback, error);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
}

function authData(input: JsonRecord): AuthContext {
  return {
    userId: String(input.userId),
    organizationId: String(input.organizationId),
    ...(typeof input.permission === "number" ? { permission: input.permission } : {}),
    ...(input.modules && typeof input.modules === "object"
      ? { modules: input.modules as Record<string, number> }
      : {}),
  };
}

function competenceInterval(competence: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/u.exec(competence);
  if (!match) throw new ServiceError(400, "competence deve estar no formato YYYY-MM.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  };
}

function auditCreate(
  audit: Audit,
  input: AuthContext,
  referring: string,
  id: string,
  action: string,
) {
  return audit.createLog({
    userId: input.userId,
    organizationId: input.organizationId,
    permission: input.permission ?? null,
    action,
    referring,
    referringId: id,
    changes: "{}",
  });
}

export function createControlService(prisma: ContabilPrisma, audit: Audit): ControlService {
  return {
    async list(competence, organizationId) {
      const { start, end } = competenceInterval(competence);
      try {
        const clients = await prisma.client.findMany({
          where: {
            organization_id: organizationId,
            contabil: true,
            AND: [
              { OR: [{ competence_entry: null }, { competence_entry: { lte: end } }] },
              { OR: [{ competence_output: null }, { competence_output: { gte: start } }] },
            ],
          },
          select: {
            id: true,
            name: true,
            company_name: true,
            controlContabil: {
              where: { competence, organization_id: organizationId, archived_at: null },
              orderBy: { id: "asc" },
              take: 1,
            },
            triageClosings: {
              where: { competence, organization_id: organizationId, archived_at: null },
              orderBy: { id: "asc" },
              take: 1,
            },
          },
        });
        return {
          competence,
          items: clients
            .map((client) => {
              const control = Array.isArray(client.controlContabil)
                ? client.controlContabil[0]
                : null;
              const closing = Array.isArray(client.triageClosings)
                ? client.triageClosings[0]
                : null;
              return {
                client_id: client.id,
                legal_name:
                  typeof client.company_name === "string" && client.company_name.trim()
                    ? client.company_name.trim()
                    : String(client.name),
                control: control ?? null,
                closing: closing ?? {
                  client_id: client.id,
                  competence,
                  status: "NOT_RECEIVED",
                  archived_at: null,
                },
              };
            })
            .sort((left, right) =>
              left.legal_name.localeCompare(right.legal_name, "pt-BR", { sensitivity: "base" }),
            ),
        };
      } catch (error) {
        throw serviceError(error, "Erro ao listar carteira operacional contábil.");
      }
    },
    async create(input) {
      const auth = authData(input);
      try {
        const identity = {
          client_id: String(input.clientId),
          competence: String(input.competence),
          organization_id: auth.organizationId,
        };
        const existing = await prisma.controlContabil.findFirst({ where: identity });
        if (existing) {
          if (existing.archived_at !== null) {
            await this.restoreCompetence({ ...input, permission: auth.permission });
            const restored = await prisma.controlContabil.findFirst({
              where: { ...identity, archived_at: null },
            });
            if (!restored)
              throw new ServiceError(
                409,
                "Não foi possível restaurar o controle contábil arquivado.",
              );
            return { control: restored, created: false };
          }
          return { control: existing, created: false };
        }
        const control = await prisma.controlContabil.create({
          data: { ...identity, ...DEFAULT_CONTROL_DATA },
        });
        await auditCreate(audit, auth, "contabil.control", String(control.id), "Cadastro");
        return { control, created: true };
      } catch (error) {
        if (isUniqueViolation(error))
          throw new ServiceError(409, "Controle contábil já existe.", error);
        throw serviceError(error, "Erro ao criar controle contábil.");
      }
    },
    async createYear(input) {
      const auth = authData(input);
      if (input.confirmed !== true)
        throw new ServiceError(400, "Confirmação explícita é obrigatória para criar o ano.");
      if (Number(auth.permission ?? 0) < 2 || Number(auth.modules?.contabil ?? 0) < 2)
        throw new ServiceError(403, "Permissão insuficiente para criar controles contábeis.");
      const year = Number(input.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100)
        throw new ServiceError(400, "year deve estar entre 2000 e 2100.");
      const competences = Array.from(
        { length: 12 },
        (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`,
      );
      try {
        const client = await prisma.client.findFirst({
          where: {
            id: String(input.clientId),
            organization_id: auth.organizationId,
            contabil: true,
          },
          select: { id: true },
        });
        if (!client) throw new ServiceError(404, "Cliente contábil não encontrado.");
        const existing = await prisma.controlContabil.findMany({
          where: {
            client_id: String(input.clientId),
            organization_id: auth.organizationId,
            competence: { in: competences },
          },
          select: { competence: true },
        });
        const existingCompetences = new Set(existing.map((row) => String(row.competence)));
        const missing = competences.filter((item) => !existingCompetences.has(item));
        const result = missing.length
          ? await prisma.controlContabil.createMany({
              data: missing.map((competence) => ({
                client_id: String(input.clientId),
                competence,
                organization_id: auth.organizationId,
                ...DEFAULT_CONTROL_DATA,
              })),
              skipDuplicates: true,
            })
          : { count: 0 };
        await auditCreate(
          audit,
          auth,
          "contabil.control.batch",
          String(input.clientId),
          "Criar controles contábeis anuais",
        );
        return { competences, created: result.count, existing: competences.length - result.count };
      } catch (error) {
        throw serviceError(error, "Erro ao criar controles contábeis anuais.");
      }
    },
    async detail(clientId, competence, organizationId) {
      const control = await prisma.controlContabil.findFirst({
        where: {
          client_id: clientId,
          competence,
          organization_id: organizationId,
          archived_at: null,
        },
      });
      if (!control) throw new ServiceError(404, "Controle contábil não encontrado.");
      return control;
    },
    async updateField(id, field, value, auth) {
      if (!CONTROL_FIELDS.has(field))
        throw new ServiceError(400, `Campo '${field}' é inválido ou não pode ser atualizado.`);
      if (field !== "notes" && typeof value !== "boolean")
        throw new ServiceError(400, `O valor para '${field}' deve ser um booleano (true/false).`);
      if (field === "notes" && typeof value !== "string")
        throw new ServiceError(400, "O valor para 'notes' deve ser um texto.");
      const current = await prisma.controlContabil.findFirst({
        where: { id, organization_id: auth.organizationId, archived_at: null },
      });
      if (!current) throw new ServiceError(404, "Controle contábil não encontrado.");
      try {
        const updated = await prisma.controlContabil.update({
          where: { id },
          data: { [field]: value },
        });
        await audit.logUpdateIfChanged({
          userId: auth.userId,
          organizationId: auth.organizationId,
          permission: auth.permission ?? null,
          action: "Atualização",
          referring: "contabil.control",
          referringId: id,
          oldData: current,
          updatedData: updated,
        });
        return updated;
      } catch (error) {
        throw serviceError(error, "Erro ao atualizar controle contábil.");
      }
    },
    async completeAll(id, auth) {
      if (Number(auth.permission ?? 0) < 2 || Number(auth.modules?.contabil ?? 0) < 2)
        throw new ServiceError(403, "Permissão insuficiente para atualizar controles contábeis.");
      const current = await prisma.controlContabil.findFirst({
        where: { id, organization_id: auth.organizationId, archived_at: null },
      });
      if (!current) throw new ServiceError(404, "Controle contábil não encontrado.");
      const updated = await prisma.controlContabil.update({
        where: { id },
        data: COMPLETED_CONTROL_DATA,
      });
      await audit.logUpdateIfChanged({
        userId: auth.userId,
        organizationId: auth.organizationId,
        permission: auth.permission ?? null,
        action: "Concluir todos os itens do controle contábil",
        referring: "contabil.control",
        referringId: id,
        oldData: current,
        updatedData: updated,
      });
      return updated;
    },
    async archiveCompetence(input) {
      const auth = authData(input);
      if (Number(auth.permission ?? 0) < 2 || Number(auth.modules?.contabil ?? 0) < 2)
        throw new ServiceError(403, "Permissão insuficiente para arquivar controles contábeis.");
      const identity = {
        client_id: String(input.clientId),
        competence: String(input.competence),
        organization_id: auth.organizationId,
      };
      const current = await prisma.controlContabil.findFirst({
        where: { ...identity, archived_at: null },
      });
      if (!current) throw new ServiceError(404, "Competência contábil ativa não encontrada.");
      const archivedAt = new Date();
      const result = (await prisma.$transaction([
        prisma.controlContabil.updateMany({
          where: { ...identity, archived_at: null },
          data: { archived_at: archivedAt },
        }),
        prisma.triageMonthly.updateMany({
          where: { ...identity, type: "CONTABIL", archived_at: null },
          data: { archived_at: archivedAt, updated_at: archivedAt },
        }),
        prisma.triageBankStatement.updateMany({
          where: { ...identity, archived_at: null },
          data: { archived_at: archivedAt, updated_at: archivedAt },
        }),
        prisma.triageClosing.updateMany({
          where: { ...identity, archived_at: null },
          data: { archived_at: archivedAt, updated_at: archivedAt },
        }),
      ])) as Array<{ count: number }>;
      const counts = {
        controls: result[0].count,
        monthly: result[1].count,
        statements: result[2].count,
        closings: result[3].count,
      };
      await audit.logUpdateIfChanged({
        userId: auth.userId,
        organizationId: auth.organizationId,
        permission: auth.permission ?? null,
        action: "Arquivar competência contábil",
        referring: "contabil.control",
        referringId: String(current.id),
        oldData: current,
        updatedData: { ...counts, archived_at: archivedAt.toISOString() },
      });
      return counts;
    },
    async restoreCompetence(input) {
      const auth = authData(input);
      if (Number(auth.permission ?? 0) < 2 || Number(auth.modules?.contabil ?? 0) < 2)
        throw new ServiceError(403, "Permissão insuficiente para restaurar controles contábeis.");
      const identity = {
        client_id: String(input.clientId),
        competence: String(input.competence),
        organization_id: auth.organizationId,
      };
      const restoredAt = new Date();
      const result = (await prisma.$transaction([
        prisma.controlContabil.updateMany({
          where: { ...identity, archived_at: { not: null } },
          data: { archived_at: null },
        }),
        prisma.triageMonthly.updateMany({
          where: { ...identity, type: "CONTABIL", archived_at: { not: null } },
          data: { archived_at: null, updated_at: restoredAt },
        }),
        prisma.triageBankStatement.updateMany({
          where: { ...identity, archived_at: { not: null } },
          data: { archived_at: null, updated_at: restoredAt },
        }),
        prisma.triageClosing.updateMany({
          where: { ...identity, archived_at: { not: null } },
          data: { archived_at: null, updated_at: restoredAt },
        }),
      ])) as Array<{ count: number }>;
      if (result[0].count === 0)
        throw new ServiceError(404, "Competência contábil arquivada não encontrada.");
      const counts = {
        controls: result[0].count,
        monthly: result[1].count,
        statements: result[2].count,
        closings: result[3].count,
      };
      await auditCreate(
        audit,
        auth,
        "contabil.control",
        String(input.clientId),
        "Restaurar competência contábil",
      );
      return counts;
    },
  };
}

function createSimpleEntityService(
  prisma: ContabilPrisma,
  audit: Audit,
  delegateName: "relationshipContabil" | "responsibleContabil",
  referring: string,
  messages: { get: string },
): RelationshipService {
  const delegate = prisma[delegateName];
  return {
    async create(input, auth) {
      const duplicate = await delegate.findFirst({
        where: { client_id: input.client_id, organization_id: auth.organizationId },
      });
      if (duplicate) throw new ServiceError(409, "Já está cadastrado para esta organização.");
      try {
        const row = await delegate.create({
          data: { ...input, organization_id: auth.organizationId },
        });
        await auditCreate(audit, auth, referring, String(row.id), "Cadastro");
        return row;
      } catch (error) {
        if (isUniqueViolation(error))
          throw new ServiceError(409, "Já está cadastrado para esta organização.", error);
        throw serviceError(error, `Erro ao criar ${referring}.`);
      }
    },
    async update(id, input, auth) {
      const current = await delegate.findFirst({
        where: { id, organization_id: auth.organizationId },
      });
      if (!current) throw new ServiceError(404, "Não está cadastrado.");
      try {
        const updated = await delegate.update({ where: { id }, data: input });
        await audit.logUpdateIfChanged({
          userId: auth.userId,
          organizationId: auth.organizationId,
          permission: auth.permission ?? null,
          action: "Atualização",
          referring,
          referringId: id,
          oldData: current,
          updatedData: updated,
        });
        return updated;
      } catch (error) {
        throw serviceError(error, `Erro ao atualizar ${referring}.`);
      }
    },
    async getByClientId(clientId, organizationId) {
      const row = await delegate.findFirst({
        where: { client_id: clientId, organization_id: organizationId },
      });
      if (!row) throw new ServiceError(404, messages.get);
      return row;
    },
    async delete(id, organizationId) {
      const current = await delegate.findFirst({ where: { id, organization_id: organizationId } });
      if (!current) throw new ServiceError(404, "Não está cadastrado.");
      try {
        await delegate.delete({ where: { id } });
        return { message: "Registro deletado com sucesso." };
      } catch (error) {
        throw serviceError(error, `Erro ao deletar ${referring}.`);
      }
    },
  };
}

export function createRelationshipService(
  prisma: ContabilPrisma,
  audit: Audit,
): RelationshipService {
  return createSimpleEntityService(prisma, audit, "relationshipContabil", "contabil.relationship", {
    get: "Registro de relacionamento não encontrado para este cliente.",
  });
}

export function createResponsibleService(prisma: ContabilPrisma, audit: Audit): ResponsibleService {
  return createSimpleEntityService(prisma, audit, "responsibleContabil", "contabil.responsibles", {
    get: "Registro de responsáveis não encontrado para este cliente.",
  });
}

const CLOSING_STATUSES = new Set([
  "NOT_RECEIVED",
  "RECEIVED",
  "UNDER_REVIEW",
  "CLOSED",
  "REOPENED",
]);

export function createClosingService(prisma: ContabilPrisma, audit: Audit): ClosingService {
  return {
    async get(input, organizationId) {
      return (
        (await prisma.triageClosing.findFirst({
          where: { ...input, organization_id: organizationId, archived_at: null },
        })) ?? {
          ...input,
          status: "NOT_RECEIVED",
          archived_at: null,
        }
      );
    },
    async update(input, auth) {
      if (!CLOSING_STATUSES.has(String(input.status)))
        throw new ServiceError(400, "Status de fechamento inválido.");
      if (Number(auth.modules?.contabil ?? 0) < 2)
        throw new ServiceError(403, "Permissão insuficiente para alterar o fechamento.");
      const identity = {
        organization_id: auth.organizationId,
        client_id: input.client_id,
        competence: input.competence,
      };
      const current = await prisma.triageClosing.findFirst({
        where: { ...identity, archived_at: null },
      });
      const now = new Date();
      const closing = await prisma.triageClosing.upsert({
        where: { organization_id_client_id_competence: identity },
        create: { ...identity, status: input.status, created_at: now, updated_at: now },
        update: { status: input.status, archived_at: null, updated_at: now },
      });
      await audit.logUpdateIfChanged({
        userId: auth.userId,
        organizationId: auth.organizationId,
        permission: auth.permission ?? null,
        action: "Atualizar fechamento recebido",
        referring: "triagem.closings",
        referringId: String(closing.id),
        oldData: current,
        updatedData: closing,
      });
      return closing;
    },
    async archive(input, auth) {
      if (Number(auth.modules?.contabil ?? 0) < 2)
        throw new ServiceError(403, "Permissão insuficiente para alterar o fechamento.");
      const current = await prisma.triageClosing.findFirst({
        where: { ...input, organization_id: auth.organizationId, archived_at: null },
      });
      if (!current) throw new ServiceError(404, "Fechamento recebido não encontrado.");
      const archived = await prisma.triageClosing.update({
        where: { id: current.id },
        data: { archived_at: new Date(), updated_at: new Date() },
      });
      await audit.logUpdateIfChanged({
        userId: auth.userId,
        organizationId: auth.organizationId,
        permission: auth.permission ?? null,
        action: "Arquivar fechamento recebido",
        referring: "triagem.closings",
        referringId: String(archived.id),
        oldData: current,
        updatedData: archived,
      });
      return archived;
    },
  };
}

function routineType(input: unknown): "CONTABIL" | "FISCAL" {
  return input === "FISCAL" ? "FISCAL" : "CONTABIL";
}

function validStatus(value: unknown): value is TriageDocumentStatus {
  return typeof value === "string" && (triageDocumentStatuses as readonly string[]).includes(value);
}

function checklist(
  value: unknown,
  fields: readonly string[],
): Record<string, TriageDocumentStatus> {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
  return Object.fromEntries(
    fields.map((field) => [field, validStatus(source[field]) ? source[field] : "NOT_APPLICABLE"]),
  ) as Record<string, TriageDocumentStatus>;
}

function itemNotes(value: unknown, fields: readonly string[]): JsonRecord {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
  return Object.fromEntries(
    fields.map((field) => {
      const raw = source[field];
      const item = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as JsonRecord) : {};
      return [
        field,
        {
          note: typeof item.note === "string" && item.note.trim() ? item.note.trim() : null,
          justification:
            typeof item.justification === "string" && item.justification.trim()
              ? item.justification.trim()
              : null,
          ...(typeof item.priority === "string" ? { priority: item.priority } : {}),
          ...(typeof item.delivery_method === "string"
            ? { delivery_method: item.delivery_method }
            : {}),
          ...(typeof item.state_site === "string" ? { state_site: item.state_site } : {}),
          ...(typeof item.required === "boolean" ? { required: item.required } : {}),
        },
      ];
    }),
  );
}

function summary(values: Record<string, TriageDocumentStatus>, fields: readonly string[]) {
  const statuses = fields.map((field) => values[field]);
  const notApplicable = statuses.filter((status) => status === "NOT_APPLICABLE").length;
  const notPresent = statuses.filter((status) => status === "NOT_PRESENT").length;
  const applicable = statuses.length - notApplicable - notPresent;
  const completed = statuses.filter((status) => status === "COMPLETED").length;
  return {
    applicable,
    attention: statuses.filter((status) => status === "ATTENTION" || status === "UNDER_REVIEW")
      .length,
    completed,
    notApplicable,
    notPresent,
    pending: statuses.filter((status) => status === "PENDING").length,
    percentage: applicable === 0 ? 0 : Math.round((completed / applicable) * 100),
  };
}

function monthlyDto(row: JsonRecord, type: "CONTABIL" | "FISCAL"): JsonRecord {
  const fields = type === "FISCAL" ? triageFiscalFields : triageDocumentFields;
  const normalized = checklist(
    row.checklist,
    type === "FISCAL" ? triageFiscalFields.slice(0, -1) : fields,
  );
  return {
    ...row,
    checklist: normalized,
    item_notes: itemNotes(row.item_notes, fields),
    summary: summary(normalized, type === "FISCAL" ? triageFiscalFields.slice(0, -1) : fields),
  };
}

async function canEdit(
  prisma: ContabilPrisma,
  clientId: string,
  auth: AuthContext,
  type: "CONTABIL" | "FISCAL",
) {
  if (Number(auth.modules?.[type === "FISCAL" ? "fiscal" : "contabil"] ?? 0) >= 2) return;
  const assigned = await prisma.triageResponsible.findFirst({
    where: {
      client_id: clientId,
      organization_id: auth.organizationId,
      type,
      user_id: auth.userId,
    },
  });
  if (!assigned)
    throw new ServiceError(403, "Permissão insuficiente para alterar pendências documentais.");
}

function initialItems(value: unknown): JsonRecord {
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(
    value.flatMap((item) => {
      if (typeof item === "string")
        return [[item, { note: null, justification: null, required: true }]];
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as JsonRecord;
      return typeof record.field === "string"
        ? [[record.field, { ...record, note: null, justification: null }]]
        : [];
    }),
  );
}

const TRIAGE_CATALOG_CODE_MAX_LENGTH = 100;

function normalizeOptionalNote(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || value.trim().length > 2_000)
    throw new ServiceError(400, `${label} inválida.`);
  return value.trim() || null;
}

function normalizeOptionalCatalogCode(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.trim().length > TRIAGE_CATALOG_CODE_MAX_LENGTH
  ) {
    throw new ServiceError(400, `${label} inválido.`);
  }
  return value.trim();
}

async function ensureCatalogSnapshotForCompetence(
  transaction: ContabilPrisma,
  organizationId: string,
  competenceId: string,
): Promise<void> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`triage.catalog.snapshot:${competenceId}`}, 0))`;
  const competence = await transaction.triageCompetence.findFirst({
    where: { id: competenceId, organization_id: organizationId },
    select: { id: true, catalog_snapshot_initialized_at: true },
  });
  if (!competence) return;
  const existingSnapshot = await transaction.triageCompetenceCatalogSnapshot.findFirst({
    where: { organization_id: organizationId, competence_id: competenceId },
    select: { id: true },
  });
  if (existingSnapshot || competence.catalog_snapshot_initialized_at !== null) {
    if (existingSnapshot && competence.catalog_snapshot_initialized_at === null) {
      await transaction.triageCompetence.update({
        where: { id: competenceId },
        data: { catalog_snapshot_initialized_at: new Date() },
      });
    }
    return;
  }
  const items = await transaction.triageCatalogItem.findMany({
    where: { organization_id: organizationId, archived_at: null },
    select: { id: true, kind: true, code: true, label: true, url: true },
  });
  if (items.length > 0) {
    await transaction.triageCompetenceCatalogSnapshot.createMany({
      data: items.map((item) => ({
        organization_id: organizationId,
        competence_id: competenceId,
        catalog_item_id: item.id,
        kind: item.kind,
        code: item.code,
        label: item.label,
        url: item.url,
      })),
      skipDuplicates: true,
    });
  }
  await transaction.triageCompetence.update({
    where: { id: competenceId },
    data: { catalog_snapshot_initialized_at: new Date() },
  });
}

async function assertActiveCatalogItems(
  transaction: ContabilPrisma,
  kind: "JUSTIFICATION" | "DELIVERY_METHOD" | "STATE_SITE",
  codes: readonly (string | null | undefined)[],
  organizationId: string,
  clientId: string,
  competence: string,
): Promise<void> {
  const uniqueCodes = [
    ...new Set(codes.map((code) => code?.trim()).filter((code): code is string => Boolean(code))),
  ].sort();
  if (uniqueCodes.length === 0) return;
  await setRlsContext(transaction, organizationId);
  for (const code of uniqueCodes) {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`triage.catalog.item:${organizationId}:${kind}:${code}`}, 0))`;
  }
  const competenceRecord = await transaction.triageCompetence.findFirst({
    where: { organization_id: organizationId, client_id: clientId, competence },
    select: { id: true, catalog_snapshot_initialized_at: true },
  });
  if (
    typeof competenceRecord?.id === "string" &&
    competenceRecord.catalog_snapshot_initialized_at === null
  ) {
    await ensureCatalogSnapshotForCompetence(transaction, organizationId, competenceRecord.id);
  }
  const competenceId = typeof competenceRecord?.id === "string" ? competenceRecord.id : undefined;
  const catalogCodes = competenceId
    ? await transaction.triageCompetenceCatalogSnapshot.findMany({
        where: {
          organization_id: organizationId,
          competence_id: competenceId,
          kind,
          code: { in: uniqueCodes },
        },
        select: { code: true },
      })
    : await transaction.triageCatalogItem.findMany({
        where: {
          organization_id: organizationId,
          kind,
          code: { in: uniqueCodes },
          archived_at: null,
        },
        select: { code: true },
      });
  const available = new Set(catalogCodes.map((item) => item.code));
  const missing = uniqueCodes.find((code) => !available.has(code));
  if (missing)
    throw new ServiceError(400, `Valor ${missing} não está disponível no catálogo da competência.`);
}

async function assertClientInOrganization(
  prisma: ContabilPrisma,
  clientId: string,
  organizationId: string,
): Promise<void> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organization_id: organizationId },
    select: { id: true },
  });
  if (!client) throw new ServiceError(404, "Cliente não encontrado.");
}

async function lock(transaction: ContabilPrisma, key: string) {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

async function setRlsContext(transaction: ContabilPrisma, organizationId: string): Promise<void> {
  await transaction.$executeRaw`SET LOCAL ROLE "giro_user_runtime"`;
  await transaction.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
}

export function createDocumentsService(
  prisma: ContabilPrisma,
  audit: Audit,
  overviewClient?: OverviewClient,
): DocumentsService {
  return {
    async getEditability(clientId, auth, type = "CONTABIL") {
      try {
        await canEdit(prisma, clientId, auth, type);
        return { can_edit: true };
      } catch (error) {
        if (error instanceof ServiceError && error.statusCode === 403) return { can_edit: false };
        throw error;
      }
    },
    async getMonthly(input, auth) {
      const type = routineType(input.type);
      const row = await prisma.triageMonthly.findFirst({
        where: {
          client_id: input.client_id,
          competence: input.competence,
          organization_id: auth.organizationId,
          type,
          archived_at: null,
        },
      });
      if (!row) throw new ServiceError(404, "Pendência documental mensal não encontrada.");
      const result = monthlyDto(row, type);
      if (!overviewClient) return { ...result, triagem_summary: null };
      try {
        return {
          ...result,
          triagem_summary: await overviewClient.getSummary({
            organizationId: auth.organizationId,
            userId: auth.userId,
            permission: auth.permission,
            modules: auth.modules,
            clientId: String(input.client_id),
            competence: String(input.competence),
          }),
        };
      } catch (error) {
        if (error instanceof ServiceError && [403, 503, 504].includes(error.statusCode))
          return { ...result, triagem_summary: null };
        throw error;
      }
    },
    async getOrCreateMonthly(input, auth) {
      const type = routineType(input.type);
      const identity = {
        client_id: input.client_id,
        competence: input.competence,
        organization_id: auth.organizationId,
        type,
        archived_at: null,
      };
      try {
        const monthly = await prisma.$transaction(
          async (transaction) => {
            await setRlsContext(transaction, auth.organizationId);
            const existing = await transaction.triageMonthly.findFirst({ where: identity });
            if (existing) return existing;
            await canEdit(transaction, String(input.client_id), auth, type);
            let configured: JsonRecord = {};
            if (type === "FISCAL") {
              const competence = await transaction.triageCompetence.findFirst({
                where: {
                  client_id: input.client_id,
                  competence: input.competence,
                  organization_id: auth.organizationId,
                  archived_at: null,
                },
                select: { configuration_snapshot: true },
              });
              if (!competence)
                throw new ServiceError(
                  409,
                  "Crie a competência fiscal antes de iniciar a rotina mensal.",
                );
              const snapshot = competence.configuration_snapshot;
              const configs =
                snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
                  ? (snapshot as JsonRecord).configs
                  : undefined;
              const fiscal = Array.isArray(configs)
                ? (configs.find(
                    (item) =>
                      item && typeof item === "object" && (item as JsonRecord).type === "FISCAL",
                  ) as JsonRecord | undefined)
                : undefined;
              configured = initialItems(fiscal?.active_items);
            } else {
              const config = await transaction.triageConfig.findFirst({
                where: { client_id: input.client_id, organization_id: auth.organizationId, type },
                select: { active_items: true },
              });
              configured = initialItems(config?.active_items);
            }
            const fields = type === "FISCAL" ? triageFiscalFields : triageDocumentFields;
            const checklistValue = Object.fromEntries(
              fields.map((field) => {
                const value = configured[field];
                const required =
                  value && typeof value === "object" && !Array.isArray(value)
                    ? (value as JsonRecord).required === true
                    : false;
                return [field, required ? "PENDING" : "NOT_APPLICABLE"];
              }),
            );
            const notes = Object.fromEntries(
              fields.map((field) => [
                field,
                configured[field] ?? { note: null, justification: null },
              ]),
            );
            const values = Object.values(notes) as JsonRecord[];
            await assertActiveCatalogItems(
              transaction,
              "JUSTIFICATION",
              values.map((value) => value.justification as string | undefined),
              auth.organizationId,
              String(input.client_id),
              String(input.competence),
            );
            await assertActiveCatalogItems(
              transaction,
              "DELIVERY_METHOD",
              values.map((value) => value.delivery_method as string | undefined),
              auth.organizationId,
              String(input.client_id),
              String(input.competence),
            );
            await assertActiveCatalogItems(
              transaction,
              "STATE_SITE",
              values.map((value) => value.state_site as string | undefined),
              auth.organizationId,
              String(input.client_id),
              String(input.competence),
            );
            const now = new Date();
            return transaction.triageMonthly.create({
              data: {
                ...identity,
                checklist: checklistValue,
                item_notes: notes,
                created_at: now,
                updated_at: now,
              },
            });
          },
          { isolationLevel: "Serializable" },
        );
        return monthlyDto(monthly as JsonRecord, type);
      } catch (error) {
        if (!isUniqueViolation(error))
          throw serviceError(error, "Erro ao criar pendência documental mensal.");
        const concurrent = await prisma.$transaction(async (transaction) => {
          await setRlsContext(transaction, auth.organizationId);
          return transaction.triageMonthly.findFirst({ where: identity });
        });
        if (concurrent) return monthlyDto(concurrent as JsonRecord, type);
        throw new ServiceError(409, "Não foi possível criar a pendência documental mensal.", error);
      }
    },
    async updateItem(id, input, auth) {
      const type = routineType(input.type);
      const field = String(input.field);
      const billing = type === "FISCAL" && field === "billing_amount";
      const fields = type === "FISCAL" ? triageFiscalFields : triageDocumentFields;
      if (!fields.includes(field as never) || (!billing && !validStatus(input.status)))
        throw new ServiceError(400, "Item ou status documental inválido.");
      if (
        type !== "FISCAL" &&
        (input.delivery_method !== undefined || input.state_site !== undefined)
      )
        throw new ServiceError(400, "Campos fiscais não aceitos na rotina contábil.");
      const note = normalizeOptionalNote(input.note, "Nota documental");
      const justification = normalizeOptionalCatalogCode(
        input.justification,
        "Justificativa documental",
      );
      const delivery = normalizeOptionalCatalogCode(
        input.delivery_method,
        "Método de entrega fiscal",
      );
      const site = normalizeOptionalCatalogCode(input.state_site, "Site estadual");
      const value = billing
        ? normalizeOptionalNote(input.value, "Valor de faturamento")
        : undefined;
      const result = await prisma.$transaction(
        async (transaction) => {
          await lock(transaction, `triagem.monthly:${id}`);
          const current = await transaction.triageMonthly.findFirst({
            where: { id, organization_id: auth.organizationId, type, archived_at: null },
          });
          if (!current) throw new ServiceError(404, "Pendência documental mensal não encontrada.");
          await canEdit(transaction, String(current.client_id), auth, type);
          await assertActiveCatalogItems(
            transaction,
            "JUSTIFICATION",
            [justification],
            auth.organizationId,
            String(current.client_id),
            String(current.competence),
          );
          await assertActiveCatalogItems(
            transaction,
            "DELIVERY_METHOD",
            [delivery],
            auth.organizationId,
            String(current.client_id),
            String(current.competence),
          );
          await assertActiveCatalogItems(
            transaction,
            "STATE_SITE",
            [site],
            auth.organizationId,
            String(current.client_id),
            String(current.competence),
          );
          const currentChecklist = checklist(
            current.checklist,
            type === "FISCAL" ? triageFiscalFields.slice(0, -1) : fields,
          );
          const currentNotes = itemNotes(current.item_notes, fields);
          const nextNotes = {
            ...currentNotes,
            [field]: {
              ...(currentNotes[field] as JsonRecord),
              ...(note !== undefined ? { note } : {}),
              ...(justification !== undefined ? { justification } : {}),
              ...(delivery !== undefined ? { delivery_method: delivery } : {}),
              ...(site !== undefined ? { state_site: site } : {}),
            },
          };
          const data: JsonRecord = billing
            ? { billing_amount: value }
            : { checklist: { ...currentChecklist, [field]: input.status }, item_notes: nextNotes };
          const updated = await transaction.triageMonthly.update({
            where: { id },
            data: { ...data, updated_at: new Date() },
          });
          return { current, updated };
        },
        { isolationLevel: "Serializable" },
      );
      const changed = result as { current: JsonRecord; updated: JsonRecord };
      await audit.logUpdateIfChanged({
        userId: auth.userId,
        organizationId: auth.organizationId,
        permission: auth.permission ?? null,
        action: "Atualizar pendência documental",
        referring: "triagem.monthly",
        referringId: id,
        oldData: changed.current,
        updatedData: changed.updated,
      });
      return monthlyDto(changed.updated, type);
    },
    async updateAll(id, input, auth) {
      if (!validStatus(input.status)) throw new ServiceError(400, "Status documental inválido.");
      const type = routineType(input.type);
      const fields = type === "FISCAL" ? triageFiscalFields.slice(0, -1) : triageDocumentFields;
      const result = await prisma.$transaction(
        async (transaction) => {
          await lock(transaction, `triagem.monthly:${id}`);
          const current = await transaction.triageMonthly.findFirst({
            where: { id, organization_id: auth.organizationId, type, archived_at: null },
          });
          if (!current) throw new ServiceError(404, "Pendência documental mensal não encontrada.");
          await canEdit(transaction, String(current.client_id), auth, type);
          const values = checklist(current.checklist, fields);
          const updated = await transaction.triageMonthly.update({
            where: { id },
            data: {
              checklist: Object.fromEntries(
                fields.map((field) => [
                  field,
                  values[field] === "NOT_APPLICABLE" ? values[field] : input.status,
                ]),
              ),
              updated_at: new Date(),
            },
          });
          return { current, updated };
        },
        { isolationLevel: "Serializable" },
      );
      const changed = result as { current: JsonRecord; updated: JsonRecord };
      await audit.logUpdateIfChanged({
        userId: auth.userId,
        organizationId: auth.organizationId,
        permission: auth.permission ?? null,
        action: "Atualizar todas as pendências documentais",
        referring: "triagem.monthly",
        referringId: id,
        oldData: changed.current,
        updatedData: changed.updated,
      });
      return monthlyDto(changed.updated, type);
    },
    async listStatements(input, organizationId) {
      return prisma.triageBankStatement.findMany({
        where: {
          client_id: input.client_id,
          competence: input.competence,
          organization_id: organizationId,
          archived_at: null,
        },
        orderBy: { bank_id: "asc" },
      });
    },
    async upsertStatement(input, auth) {
      if (!validStatus(input.status))
        throw new ServiceError(400, "Marcador de extrato bancário inválido.");
      await assertClientInOrganization(prisma, String(input.client_id), auth.organizationId);
      await canEdit(prisma, String(input.client_id), auth, "CONTABIL");
      const identity = {
        organization_id: auth.organizationId,
        client_id: input.client_id,
        competence: input.competence,
        bank_id: input.bank_id,
      };
      const now = new Date();
      const result = await prisma.$transaction(async (transaction) => {
        await lock(transaction, `triagem.statement:${JSON.stringify(identity)}`);
        const current = await transaction.triageBankStatement.findFirst({
          where: { ...identity, archived_at: null },
        });
        const statement = await transaction.triageBankStatement.upsert({
          where: { organization_id_client_id_competence_bank_id: identity },
          create: { ...identity, status: input.status, created_at: now, updated_at: now },
          update: { status: input.status, archived_at: null, updated_at: now },
        });
        return { current, statement };
      });
      const changed = result as { current: JsonRecord | null; statement: JsonRecord };
      await audit.logUpdateIfChanged({
        userId: auth.userId,
        organizationId: auth.organizationId,
        permission: auth.permission ?? null,
        action: "Atualizar marcador de extrato bancário",
        referring: "triagem.bank_statements",
        referringId: String(changed.statement.id),
        oldData: changed.current,
        updatedData: changed.statement,
      });
      return changed.statement;
    },
    async archiveStatement(input, auth) {
      await assertClientInOrganization(prisma, String(input.client_id), auth.organizationId);
      await canEdit(prisma, String(input.client_id), auth, "CONTABIL");
      const identity = {
        organization_id: auth.organizationId,
        client_id: input.client_id,
        competence: input.competence,
        bank_id: input.bank_id,
      };
      const result = await prisma.$transaction(async (transaction) => {
        await lock(transaction, `triagem.statement:${JSON.stringify(identity)}`);
        const current = await transaction.triageBankStatement.findFirst({
          where: { ...identity, archived_at: null },
        });
        if (!current) throw new ServiceError(404, "Marcador de extrato bancário não encontrado.");
        const archived = await transaction.triageBankStatement.update({
          where: { id: current.id },
          data: { archived_at: new Date(), updated_at: new Date() },
        });
        return { current, archived };
      });
      const changed = result as { current: JsonRecord; archived: JsonRecord };
      await audit.logUpdateIfChanged({
        userId: auth.userId,
        organizationId: auth.organizationId,
        permission: auth.permission ?? null,
        action: "Arquivar marcador de extrato bancário",
        referring: "triagem.bank_statements",
        referringId: String(changed.archived.id),
        oldData: changed.current,
        updatedData: changed.archived,
      });
      return changed.archived;
    },
  };
}

export function createReportingService(
  prisma: ContabilPrisma,
  inSnapshot = false,
): ReportingService {
  const extractPage = async (input: {
    prisma: {
      controlContabil: ReportingDelegate;
      responsibleContabil: ReportingDelegate;
      relationshipContabil: ReportingDelegate;
    };
    source: string;
    organizationId: string;
    fields: readonly string[];
    limit: number;
    offset?: number;
  }) => {
    const allowed = getContabilReportingFields(input.source as never);
    if (input.fields.some((field) => !allowed.includes(field)))
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    const delegate =
      input.source === "contabil.control"
        ? input.prisma.controlContabil
        : input.source === "contabil.responsibles"
          ? input.prisma.responsibleContabil
          : input.prisma.relationshipContabil;
    const rows = await delegate.findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
      ...(input.offset !== undefined ? { skip: input.offset, orderBy: { id: "asc" } } : {}),
      take: input.limit + 1,
    });
    return { rows: rows.slice(0, input.limit), reachedLimit: rows.length > input.limit };
  };
  return {
    async extract(input) {
      if (input.query && !inSnapshot) {
        return withReportingSnapshot(prisma, (transaction) =>
          createReportingService(transaction, true).extract({ ...input, query: input.query }),
        );
      }
      if (input.query) {
        return executeReportingQuery(
          { source: input.source, fields: input.fields, limit: input.limit, query: input.query },
          (fields, limit, offset) =>
            extractPage({
              prisma,
              source: input.source,
              organizationId: input.organizationId,
              fields,
              limit,
              offset,
            }),
        );
      }
      return extractPage({
        prisma,
        source: input.source,
        organizationId: input.organizationId,
        fields: input.fields,
        limit: input.limit,
        offset: input.offset,
      });
    },
  };
}
