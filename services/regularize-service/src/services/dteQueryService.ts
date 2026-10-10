import { normalizeCpfCnpj, ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { RegularizeLogService } from "./regularizeLogService.js";

// Consultas diárias ao DTE (#1746), a partir de regularize/pages/dte/registros.php, list.php e
// Fiscal::atualizarRegistrosDte do legado. Lá cada dia guardava duas listas de CPF/CNPJ
// (feitos e nFeitos), e a correção tirava o cliente da lista errada; aqui é uma linha por
// cliente e dia.

export const DTE_QUERY_STATUSES = ["feita", "nao_feita", "sem_registro"] as const;
export type DteQueryStatus = (typeof DTE_QUERY_STATUSES)[number];

export const DTE_QUERY_IMPORT_LIMITS = {
  maxListLength: 200_000,
  maxDocuments: 5_000,
} as const;

// Recorte de clientes do registros.php: comércio ou indústria, da BA, com inscrição estadual.
const ELIGIBLE_SEGMENT_TYPES = ["comercio", "industria"];
const ELIGIBLE_STATE = "BA";
const EXEMPT_STATE_REGISTRATION = "ISENTO";

const LOG_REFERRING = "regularize.dte_queries";

export type DteQueryGridRow = {
  client_id: string;
  name: string;
  fantasy_name: string | null;
  cpf_cnpj: string | null;
  status: DteQueryStatus;
};

export type DteQueryGrid = {
  date: string;
  rows: DteQueryGridRow[];
  totals: Record<DteQueryStatus, number>;
};

export type DteQueryImportResult = {
  date: string;
  done: number;
  not_done: number;
  conflicts: string[];
  unknown: string[];
};

function toStatus(done: boolean | undefined): DteQueryStatus {
  if (done === undefined) return "sem_registro";
  return done ? "feita" : "nao_feita";
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Lista textual do legado: CPF/CNPJ separados por vírgula, com ou sem máscara.
export function parseDocumentList(text: string): string[] {
  const documents = text
    .split(/[\s,;]+/)
    .map((item) => normalizeCpfCnpj(item))
    .filter((item) => item !== "");
  return [...new Set(documents)];
}

export class DteQueryService {
  constructor(private readonly prisma: PrismaClient) {}

  async grid(input: { organizationId: string; date: Date }): Promise<DteQueryGrid> {
    const monthStart = new Date(Date.UTC(input.date.getUTCFullYear(), input.date.getUTCMonth(), 1));
    const nextMonthStart = new Date(
      Date.UTC(input.date.getUTCFullYear(), input.date.getUTCMonth() + 1, 1),
    );
    const [segments, records] = await Promise.all([
      this.prisma.clientSegment.findMany({
        where: { organization_id: input.organizationId, type: { in: ELIGIBLE_SEGMENT_TYPES } },
        select: { name: true },
      }),
      this.prisma.regularizeDteQuery.findMany({
        where: { organization_id: input.organizationId, date: input.date },
        select: { client_id: true, done: true },
      }),
    ]);
    const doneByClient = new Map(records.map((record) => [record.client_id, record.done]));

    // Quem já tem registro no dia aparece mesmo fora do recorte: uma lista colada pode trazer
    // cliente cujo cadastro ainda não tem segmento, UF ou inscrição estadual.
    const where: Prisma.ClientWhereInput = {
      organization_id: input.organizationId,
      OR: [
        { id: { in: [...doneByClient.keys()] } },
        {
          segment: { in: segments.map((segment) => segment.name) },
          state: ELIGIBLE_STATE,
          AND: [
            {
              OR: [
                { state_registration: null },
                { state_registration: { not: EXEMPT_STATE_REGISTRATION, mode: "insensitive" } },
              ],
            },
            // Carteira da competência do dia, como Cliente::compGeralCliente.
            { OR: [{ customer_since: null }, { customer_since: { lt: nextMonthStart } }] },
            { OR: [{ status: "Ativo" }, { competence_output: { gte: monthStart } }] },
          ],
        },
      ],
    };
    const clients = await this.prisma.client.findMany({
      where,
      select: { id: true, name: true, fantasy_name: true, cpf_cnpj: true },
      orderBy: { name: "asc" },
    });

    const totals: Record<DteQueryStatus, number> = { feita: 0, nao_feita: 0, sem_registro: 0 };
    const rows = clients.map((client) => {
      const status = toStatus(doneByClient.get(client.id));
      totals[status]++;
      return {
        client_id: client.id,
        name: client.name,
        fantasy_name: client.fantasy_name,
        cpf_cnpj: client.cpf_cnpj,
        status,
      };
    });
    return { date: isoDay(input.date), rows, totals };
  }

  async setStatus(input: {
    organizationId: string;
    userId: string;
    clientId: string;
    date: Date;
    status: DteQueryStatus;
  }): Promise<{ client_id: string; date: string; status: DteQueryStatus }> {
    const client = await this.prisma.client.findFirst({
      where: { id: input.clientId, organization_id: input.organizationId },
      select: { id: true },
    });
    if (!client) throw new ServiceError(404, "Cliente não encontrado.");

    const existing = await this.prisma.regularizeDteQuery.findUnique({
      where: {
        organization_id_client_id_date: {
          organization_id: input.organizationId,
          client_id: client.id,
          date: input.date,
        },
      },
    });
    const from = toStatus(existing?.done);
    const result = { client_id: client.id, date: isoDay(input.date), status: input.status };
    if (from === input.status) return result;

    await this.prisma.$transaction(async (transaction) => {
      const done = input.status === "feita";
      let referringId: string;
      let action: string;
      if (!existing) {
        const created = await transaction.regularizeDteQuery.create({
          data: {
            organization_id: input.organizationId,
            client_id: client.id,
            date: input.date,
            done,
            updated_by_user_id: input.userId,
          },
        });
        referringId = created.id;
        action = "Cadastro";
      } else if (input.status === "sem_registro") {
        await transaction.regularizeDteQuery.delete({ where: { id: existing.id } });
        referringId = existing.id;
        action = "Exclusao";
      } else {
        await transaction.regularizeDteQuery.update({
          where: { id: existing.id },
          data: { done, updated_by_user_id: input.userId },
        });
        referringId = existing.id;
        action = "Atualizacao";
      }
      await new RegularizeLogService(transaction).createLog({
        userId: input.userId,
        organizationId: input.organizationId,
        action,
        referring: LOG_REFERRING,
        referringId,
        changes: {
          client_id: client.id,
          date: result.date,
          status: { from, to: input.status },
        },
      });
    });
    return result;
  }

  async importLists(input: {
    organizationId: string;
    userId: string;
    date: Date;
    done: string;
    notDone: string;
  }): Promise<DteQueryImportResult> {
    const doneDocuments = parseDocumentList(input.done);
    const notDoneDocuments = parseDocumentList(input.notDone);
    if (doneDocuments.length + notDoneDocuments.length === 0) {
      throw new ServiceError(422, "Informe ao menos um CPF ou CNPJ em uma das listas.");
    }
    if (doneDocuments.length + notDoneDocuments.length > DTE_QUERY_IMPORT_LIMITS.maxDocuments) {
      throw new ServiceError(
        422,
        `Limite de ${DTE_QUERY_IMPORT_LIMITS.maxDocuments} documentos por registro excedido.`,
      );
    }

    // Documento nas duas listas não é aplicado: não dá para saber qual vale.
    const notDoneSet = new Set(notDoneDocuments);
    const conflicts = doneDocuments.filter((document) => notDoneSet.has(document));
    const conflictSet = new Set(conflicts);

    // ponytail: carrega todos os documentos da organização para comparar sem máscara;
    // trocar por coluna normalizada indexada se a carteira passar de dezenas de milhares.
    const clients = await this.prisma.client.findMany({
      where: { organization_id: input.organizationId },
      select: { id: true, cpf_cnpj: true },
    });
    const clientByDocument = new Map<string, string>();
    for (const client of clients) {
      const document = normalizeCpfCnpj(client.cpf_cnpj);
      if (document) clientByDocument.set(document, client.id);
    }

    const unknown: string[] = [];
    const doneByClient = new Map<string, boolean>();
    for (const [documents, done] of [
      [doneDocuments, true],
      [notDoneDocuments, false],
    ] as const) {
      for (const document of documents) {
        if (conflictSet.has(document)) continue;
        const clientId = clientByDocument.get(document);
        if (clientId) doneByClient.set(clientId, done);
        else unknown.push(document);
      }
    }

    const date = isoDay(input.date);
    const clientIds = [...doneByClient.keys()];
    const idsWith = (done: boolean) => clientIds.filter((id) => doneByClient.get(id) === done);
    await this.prisma.$transaction(async (transaction) => {
      const scope = { organization_id: input.organizationId, date: input.date };
      const existing = await transaction.regularizeDteQuery.findMany({
        where: { ...scope, client_id: { in: clientIds } },
        select: { client_id: true },
      });
      const existingIds = new Set(existing.map((record) => record.client_id));
      await transaction.regularizeDteQuery.createMany({
        data: clientIds
          .filter((id) => !existingIds.has(id))
          .map((id) => ({
            ...scope,
            client_id: id,
            done: doneByClient.get(id) === true,
            updated_by_user_id: input.userId,
          })),
        skipDuplicates: true,
      });
      for (const done of [true, false]) {
        const ids = idsWith(done).filter((id) => existingIds.has(id));
        if (ids.length === 0) continue;
        await transaction.regularizeDteQuery.updateMany({
          where: { ...scope, client_id: { in: ids } },
          data: { done, updated_by_user_id: input.userId },
        });
      }
      await new RegularizeLogService(transaction).createLog({
        userId: input.userId,
        organizationId: input.organizationId,
        action: "Cadastro",
        referring: LOG_REFERRING,
        referringId: date,
        changes: {
          date,
          done_client_ids: idsWith(true),
          not_done_client_ids: idsWith(false),
          conflicts,
          unknown,
        },
      });
    });

    return {
      date,
      done: idsWith(true).length,
      not_done: idsWith(false).length,
      conflicts,
      unknown,
    };
  }
}
