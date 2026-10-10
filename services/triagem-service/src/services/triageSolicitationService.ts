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
  | "triageNoteCount"
>;

const NOTE_COUNT_SELECT = {
  xml_inbound: true,
  xml_outbound: true,
  nfse_issued: true,
  nfse_received: true,
  updated_at: true,
  updated_by: { select: { id: true, name: true, full_name: true } },
} as const;

type NoteCountRecord = Prisma.TriageNoteCountGetPayload<{ select: typeof NOTE_COUNT_SELECT }>;

export interface TriageNoteCountsInput {
  xml_inbound: number;
  xml_outbound: number;
  nfse_issued: number;
  nfse_received: number;
}

// Contadores são do cliente+competência: todo pedido da mesma competência vê a mesma linha.
export type TriageNoteCountsDto = TriageNoteCountsInput & {
  client_id: string;
  competence: string;
  updated_at: Date | null;
  updated_by: NoteCountRecord["updated_by"] | null;
};

const EMPTY_NOTE_COUNTS = {
  xml_inbound: 0,
  xml_outbound: 0,
  nfse_issued: 0,
  nfse_received: 0,
  updated_at: null,
  updated_by: null,
};

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

type UserRef = { id: string; name: string; full_name: string | null };

export interface TriageSolicitationIndicatorsInput {
  competence: string;
  status?: "OPEN" | "CLOSED";
}

export interface TriageSolicitationIndicatorsDto {
  competence: string;
  notes_by_responsible: Array<
    TriageNoteCountsInput & { user: UserRef; clients: number; total: number }
  >;
  solicitations_by_requester: Array<{ user: UserRef; total: number }>;
  totals: { solicitations: number; clients: number; notes: number };
}

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
    // Tamanho e obrigatoriedade já vêm do schema Zod da rota.
    const description = input.description.trim();

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

  async getNoteCounts(
    id: string,
    auth: TriageSolicitationAuthContext,
  ): Promise<TriageNoteCountsDto> {
    requireLevel(auth, 1);
    const { client_id, competence } = await this.findVisible(id, auth);
    const counts = await this.withOrganization(auth, (transaction) =>
      transaction.triageNoteCount.findFirst({
        where: { organization_id: auth.organizationId, client_id, competence },
        select: NOTE_COUNT_SELECT,
      }),
    );
    return { client_id, competence, ...(counts ?? EMPTY_NOTE_COUNTS) };
  }

  async updateNoteCounts(
    id: string,
    input: TriageNoteCountsInput,
    auth: TriageSolicitationAuthContext,
  ): Promise<TriageNoteCountsDto> {
    requireLevel(auth, 2);
    const { client_id, competence, status } = await this.findVisible(id, auth);
    if (status === "CLOSED") {
      throw new ServiceError(409, "Solicitação fechada não altera os contadores de notas.");
    }
    const counts = {
      xml_inbound: input.xml_inbound,
      xml_outbound: input.xml_outbound,
      nfse_issued: input.nfse_issued,
      nfse_received: input.nfse_received,
    };
    const saved = await this.withOrganization(auth, async (transaction) => {
      await assertCompetenceWritable(transaction, auth.organizationId, client_id, competence);
      return transaction.triageNoteCount.upsert({
        where: {
          organization_id_client_id_competence: {
            organization_id: auth.organizationId,
            client_id,
            competence,
          },
        },
        create: {
          organization_id: auth.organizationId,
          client_id,
          competence,
          ...counts,
          updated_by_id: auth.userId,
        },
        update: { ...counts, updated_by_id: auth.userId },
        select: NOTE_COUNT_SELECT,
      });
    });
    return { client_id, competence, ...saved };
  }

  // Notas por responsável e pedidos por solicitante na competência. Cada cliente entra uma
  // vez por responsável (e uma vez no total), então pedidos repetidos não multiplicam notas.
  async indicators(
    input: TriageSolicitationIndicatorsInput,
    auth: TriageSolicitationAuthContext,
  ): Promise<TriageSolicitationIndicatorsDto> {
    requireLevel(auth, 1);
    const userSelect = { select: { id: true, name: true, full_name: true } } as const;
    const solicitations = await this.withOrganization(auth, (transaction) =>
      transaction.triageSolicitation.findMany({
        where: {
          organization_id: auth.organizationId,
          competence: input.competence,
          ...(input.status ? { status: input.status } : {}),
          ...(isAdmin(auth) ? {} : { responsible_id: auth.userId }),
        },
        select: { client_id: true, requester: userSelect, responsible: userSelect },
      }),
    );
    const clientIds = [...new Set(solicitations.map((item) => item.client_id))];
    const counts = clientIds.length
      ? await this.withOrganization(auth, (transaction) =>
          transaction.triageNoteCount.findMany({
            where: {
              organization_id: auth.organizationId,
              competence: input.competence,
              client_id: { in: clientIds },
            },
            select: {
              client_id: true,
              xml_inbound: true,
              xml_outbound: true,
              nfse_issued: true,
              nfse_received: true,
            },
          }),
        )
      : [];
    const countByClient = new Map(counts.map((count) => [count.client_id, count]));

    const responsibles = new Map<string, { user: UserRef; clients: Set<string> }>();
    const requesters = new Map<string, { user: UserRef; total: number }>();
    for (const item of solicitations) {
      const responsible = responsibles.get(item.responsible.id) ?? {
        user: item.responsible,
        clients: new Set<string>(),
      };
      responsible.clients.add(item.client_id);
      responsibles.set(item.responsible.id, responsible);
      const requester = requesters.get(item.requester.id) ?? { user: item.requester, total: 0 };
      requester.total += 1;
      requesters.set(item.requester.id, requester);
    }

    const sumNotes = (ids: Iterable<string>) => {
      const sum = { xml_inbound: 0, xml_outbound: 0, nfse_issued: 0, nfse_received: 0 };
      for (const id of ids) {
        const count = countByClient.get(id);
        if (!count) continue;
        sum.xml_inbound += count.xml_inbound;
        sum.xml_outbound += count.xml_outbound;
        sum.nfse_issued += count.nfse_issued;
        sum.nfse_received += count.nfse_received;
      }
      return {
        ...sum,
        total: sum.xml_inbound + sum.xml_outbound + sum.nfse_issued + sum.nfse_received,
      };
    };

    return {
      competence: input.competence,
      notes_by_responsible: [...responsibles.values()]
        .map(({ user, clients }) => ({ user, clients: clients.size, ...sumNotes(clients) }))
        .sort((a, b) => b.total - a.total),
      solicitations_by_requester: [...requesters.values()].sort((a, b) => b.total - a.total),
      totals: {
        solicitations: solicitations.length,
        clients: clientIds.length,
        notes: sumNotes(clientIds).total,
      },
    };
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
