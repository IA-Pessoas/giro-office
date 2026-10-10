import { normalizeCpfCnpj, ServiceError } from "@workspace/shared";
import type { ClientSegmentType } from "@workspace/shared/regularize";

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
const ELIGIBLE_SEGMENT_TYPES: ClientSegmentType[] = ["comercio", "industria"];
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
  done_count: number;
  not_done_count: number;
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

  // Grade do dia, como o registros.php: a competência do dia define a carteira.
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
          // O cliente guarda o nome do segmento; renomear no catálogo não reescreve o cadastro.
          segment: { in: segments.map((segment) => segment.name), mode: "insensitive" },
          state: { equals: ELIGIBLE_STATE, mode: "insensitive" },
          AND: [
            {
              OR: [
                { state_registration: null },
                { state_registration: { not: EXEMPT_STATE_REGISTRATION, mode: "insensitive" } },
              ],
            },
            // Carteira da competência, como Cliente::compGeralCliente. Diferença: cliente sem
            // "cliente desde" entra, porque o cadastro migrado nem sempre tem a data.
            { OR: [{ customer_since: null }, { customer_since: { lt: nextMonthStart } }] },
            {
              OR: [
                { status: "Ativo" },
                { competence_output: { gte: monthStart } },
                { deletion_date: { gte: input.date } },
              ],
            },
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

    const key = {
      organization_id: input.organizationId,
      client_id: client.id,
      date: input.date,
    };
    const result = { client_id: client.id, date: isoDay(input.date), status: input.status };

    // Leitura e escrita na mesma transação, e escrita pela chave única: duas correções
    // simultâneas do mesmo cliente não quebram no índice nem deixam o histórico defasado.
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.regularizeDteQuery.findUnique({
        where: { organization_id_client_id_date: key },
      });
      const from = toStatus(existing?.done);
      if (from === input.status) return;

      let referringId = existing?.id ?? "";
      if (input.status === "sem_registro") {
        await transaction.regularizeDteQuery.deleteMany({ where: key });
      } else {
        const done = input.status === "feita";
        const saved = await transaction.regularizeDteQuery.upsert({
          where: { organization_id_client_id_date: key },
          create: { ...key, done, updated_by_user_id: input.userId },
          update: { done, updated_by_user_id: input.userId },
        });
        referringId = saved.id;
      }
      await new RegularizeLogService(transaction).createLog({
        userId: input.userId,
        organizationId: input.organizationId,
        action: !existing
          ? "Cadastro"
          : input.status === "sem_registro"
            ? "Exclusao"
            : "Atualizacao",
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

  // Registro do dia pelas duas listas do list.php. Diferença do legado: lá a lista só valia se
  // o dia ainda não tinha registro; aqui ela substitui a situação de quem estiver nela.
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
      orderBy: { id: "asc" },
    });
    const clientByDocument = new Map<string, string>();
    for (const client of clients) {
      const document = normalizeCpfCnpj(client.cpf_cnpj);
      if (document && !clientByDocument.has(document)) clientByDocument.set(document, client.id);
    }

    const unknown: string[] = [];
    const resolve = (documents: string[]): string[] => {
      const ids: string[] = [];
      for (const document of documents) {
        if (conflictSet.has(document)) continue;
        const clientId = clientByDocument.get(document);
        if (clientId) ids.push(clientId);
        else unknown.push(document);
      }
      return ids;
    };
    const doneIds = resolve(doneDocuments);
    const notDoneIds = resolve(notDoneDocuments);
    const doneSet = new Set(doneIds);

    const date = isoDay(input.date);
    const clientIds = [...doneIds, ...notDoneIds];
    await this.prisma.$transaction(async (transaction) => {
      const scope = { organization_id: input.organizationId, date: input.date };
      const existing = await transaction.regularizeDteQuery.findMany({
        where: { ...scope, client_id: { in: clientIds } },
        select: { client_id: true, done: true },
      });
      const previous = new Map(existing.map((record) => [record.client_id, record.done]));
      await transaction.regularizeDteQuery.createMany({
        data: clientIds
          .filter((id) => !previous.has(id))
          .map((id) => ({
            ...scope,
            client_id: id,
            done: doneSet.has(id),
            updated_by_user_id: input.userId,
          })),
        skipDuplicates: true,
      });
      // Só quem muda de conjunto é atualizado: quem já estava certo não ganha novo autor.
      const moved = clientIds.filter(
        (id) => previous.has(id) && previous.get(id) !== doneSet.has(id),
      );
      for (const done of [true, false]) {
        const ids = moved.filter((id) => doneSet.has(id) === done);
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
          done_client_ids: doneIds,
          not_done_client_ids: notDoneIds,
          // Situação anterior de quem a lista trocou de conjunto.
          moved_from: Object.fromEntries(moved.map((id) => [id, toStatus(previous.get(id))])),
          conflicts,
          unknown,
        },
      });
    });

    return {
      date,
      done_count: doneIds.length,
      not_done_count: notDoneIds.length,
      conflicts,
      unknown,
    };
  }
}
