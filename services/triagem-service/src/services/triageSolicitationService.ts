import { ServiceError } from "@workspace/shared";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { assertCompetenceWritable } from "./triageCompetenceGuard.js";

// Solicitação legada da Triagem: pedido por cliente e competência, identificado por ID.
// Distinta de triagem.urgent_requests; nasce aberta e só fecha (sem reabertura no legado).

const SOLICITATION_SELECT = {
  id: true,
  organization_id: true,
  client_id: true,
  competence: true,
  category_id: true,
  description: true,
  requester_id: true,
  responsible_id: true,
  status: true,
  closed_at: true,
  created_at: true,
  updated_at: true,
  client: { select: { id: true, name: true } },
  category: { select: { id: true, code: true, label: true } },
  requester: { select: { id: true, name: true, full_name: true } },
  responsible: { select: { id: true, name: true, full_name: true } },
} as const;

type SolicitationRecord = Prisma.TriageSolicitationGetPayload<{
  select: typeof SOLICITATION_SELECT;
}>;

export type TriageSolicitationPrisma = Pick<
  PrismaClient,
  | "$executeRaw"
  | "$transaction"
  | "client"
  | "user"
  | "triageCatalogItem"
  | "triageCompetence"
  | "triageSolicitation"
>;

export interface TriageSolicitationAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
  modules?: Record<string, number>;
}

export interface CreateTriageSolicitationInput {
  client_id: string;
  competence: string;
  category_id: string;
  description: string;
  responsible_id: string;
}

export interface ListTriageSolicitationInput {
  status?: "OPEN" | "CLOSED";
  clientId?: string;
  competence?: string;
}

export type TriageSolicitationDto = Omit<SolicitationRecord, "organization_id">;

export const TRIAGE_SOLICITATION_CATEGORY_KIND = "REQUEST_CATEGORY";
const ADMIN_LEVEL = 3;

function modulePermission(auth: TriageSolicitationAuthContext): number {
  return auth.modules ? (auth.modules.triagem ?? 0) : (auth.permission ?? 0);
}

function requireLevel(auth: TriageSolicitationAuthContext, level: number): void {
  if (!auth.userId || !auth.organizationId) {
    throw new ServiceError(400, "Contexto autenticado incompleto.");
  }
  if (modulePermission(auth) < level) {
    throw new ServiceError(
      403,
      level < 2
        ? "Permissão insuficiente para consultar a Triagem."
        : "Permissão insuficiente para alterar a Triagem.",
    );
  }
}

// Operador comum (nível 1–2) só enxerga os pedidos sob sua responsabilidade.
function isAdmin(auth: TriageSolicitationAuthContext): boolean {
  return modulePermission(auth) >= ADMIN_LEVEL;
}

function toDto(record: SolicitationRecord): TriageSolicitationDto {
  const { organization_id: _organizationId, ...dto } = record;
  return dto;
}

export class TriageSolicitationService {
  constructor(
    private readonly prisma: TriageSolicitationPrisma,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async create(
    input: CreateTriageSolicitationInput,
    auth: TriageSolicitationAuthContext,
  ): Promise<TriageSolicitationDto> {
    requireLevel(auth, 2);
    const description = input.description.trim();
    if (!description || description.length > 2000) {
      throw new ServiceError(400, "A descrição deve conter entre 1 e 2.000 caracteres.");
    }

    const created = await this.withOrganization(auth, async (transaction) => {
      await assertCompetenceWritable(
        transaction,
        auth.organizationId,
        input.client_id,
        input.competence,
      );
      const client = await transaction.client.findFirst({
        where: { id: input.client_id, organization_id: auth.organizationId },
        select: { id: true },
      });
      if (!client) throw new ServiceError(404, "Cliente não encontrado na organização ativa.");
      const responsible = await transaction.user.findFirst({
        where: { id: input.responsible_id, organization_id: auth.organizationId },
        select: { id: true },
      });
      if (!responsible) {
        throw new ServiceError(404, "Responsável não encontrado na organização ativa.");
      }
      const category = await transaction.triageCatalogItem.findFirst({
        where: {
          id: input.category_id,
          organization_id: auth.organizationId,
          kind: TRIAGE_SOLICITATION_CATEGORY_KIND,
          archived_at: null,
        },
        select: { id: true },
      });
      if (!category) throw new ServiceError(404, "Categoria de solicitação não encontrada.");

      return transaction.triageSolicitation.create({
        data: {
          organization_id: auth.organizationId,
          client_id: input.client_id,
          competence: input.competence,
          category_id: input.category_id,
          description,
          requester_id: auth.userId,
          responsible_id: input.responsible_id,
          status: "OPEN",
        },
        select: SOLICITATION_SELECT,
      });
    });
    return toDto(created);
  }

  async list(
    input: ListTriageSolicitationInput,
    auth: TriageSolicitationAuthContext,
  ): Promise<TriageSolicitationDto[]> {
    requireLevel(auth, 1);
    const records = await this.withOrganization(auth, (transaction) =>
      transaction.triageSolicitation.findMany({
        where: {
          organization_id: auth.organizationId,
          ...(input.clientId ? { client_id: input.clientId } : {}),
          ...(input.competence ? { competence: input.competence } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(isAdmin(auth) ? {} : { responsible_id: auth.userId }),
        },
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
        // ponytail: teto fixo sem paginação; paginar quando uma organização passar disso.
        take: 500,
        select: SOLICITATION_SELECT,
      }),
    );
    return records.map(toDto);
  }

  async get(id: string, auth: TriageSolicitationAuthContext): Promise<TriageSolicitationDto> {
    requireLevel(auth, 1);
    return toDto(await this.findVisible(id, auth));
  }

  async close(id: string, auth: TriageSolicitationAuthContext): Promise<TriageSolicitationDto> {
    requireLevel(auth, 2);
    const current = await this.findVisible(id, auth);
    if (current.status === "CLOSED") return toDto(current);

    const updated = await this.withOrganization(auth, async (transaction) => {
      await assertCompetenceWritable(
        transaction,
        auth.organizationId,
        current.client_id,
        current.competence,
      );
      return transaction.triageSolicitation.update({
        where: { id },
        data: { status: "CLOSED", closed_at: this.clock() },
        select: SOLICITATION_SELECT,
      });
    });
    return toDto(updated);
  }

  // Pedido de outro responsável responde 404 ao operador comum, como se não existisse.
  private async findVisible(
    id: string,
    auth: TriageSolicitationAuthContext,
  ): Promise<SolicitationRecord> {
    const record = await this.withOrganization(auth, (transaction) =>
      transaction.triageSolicitation.findFirst({
        where: { id, organization_id: auth.organizationId },
        select: SOLICITATION_SELECT,
      }),
    );
    if (!record || (!isAdmin(auth) && record.responsible_id !== auth.userId)) {
      throw new ServiceError(404, "Solicitação não encontrada.");
    }
    return record;
  }

  private async withOrganization<T>(
    auth: TriageSolicitationAuthContext,
    callback: (transaction: TriageSolicitationPrisma) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "giro_user_runtime"`;
      await transaction.$executeRaw`SELECT set_config('app.organization_id', ${auth.organizationId}, true)`;
      return callback(transaction as unknown as TriageSolicitationPrisma);
    });
  }
}
