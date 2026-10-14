import { getPaginationParams } from "../schemas/pagination.schemas.js";
import type {
  ListTiChangeHistoryQuery,
  TiChangeHistoryItemType,
} from "../schemas/tiChangeHistory.schemas.js";

// Histórico de alterações de TI (#1936): uma linha por campo alterado, com valor anterior e
// novo, como `tb_historico.tecnologia` no legado. Movimentação patrimonial
// (`tecnologia.inventoryEvents`), movimentos de estoque e logs de acesso são outras trilhas.
// Serviço Node e Worker usam este mesmo arquivo.

type Row = Record<string, unknown>;

/** Só o que este arquivo usa do Prisma, para servir ao cliente Node e ao do Worker. */
export type TiChangeHistoryDatabase = {
  changeHistoryTecnologia: { findMany(args: Row): Promise<unknown[]> };
  inventoryTecnologia: { findMany(args: Row): Promise<unknown[]> };
  inventoryCategoryTecnologia: { findMany(args: Row): Promise<unknown[]> };
  user: { findMany(args: Row): Promise<unknown[]> };
};

export type TiChangeHistoryData = {
  item_type: TiChangeHistoryItemType;
  item_id: string;
  field: string;
  before: string | null;
  after: string | null;
  note: string;
  actor_user_id: string;
  organization_id: string;
};

const INVENTORY_UPDATE_NOTE = "Atualização do item";

/**
 * Valor de credencial nunca é devolvido, só o nome do campo. Quem grava (hoje só a edição de
 * inventário, que não tem campo sensível) também não deve persistir esses valores.
 */
const SENSITIVE_FIELD = /senha|pass|pwd|login|token|secret|segredo|chave|credencial/i;

export function isSensitiveTiChange(itemType: string, field: string): boolean {
  return itemType === "password" || SENSITIVE_FIELD.test(field);
}

function text(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function day(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
}

function ids(values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string"))];
}

/**
 * Linhas de histórico de uma edição de item de inventário: código, categoria, observação,
 * data de entrega e TI responsável. Pessoa, local e devolução são movimentação e ficam no
 * histórico patrimonial. Categoria e responsável são gravados pelo nome da época.
 */
export async function inventoryFieldChanges(
  database: Pick<TiChangeHistoryDatabase, "inventoryCategoryTecnologia" | "user">,
  context: { organizationId: string; userId: string },
  id: string,
  existing: Row,
  body: Row,
): Promise<TiChangeHistoryData[]> {
  const changed = (field: string) => body[field] !== undefined && body[field] !== existing[field];
  const categoryIds = changed("category_id") ? ids([existing.category_id, body.category_id]) : [];
  const staffIds = changed("responsible_it_staff_id")
    ? ids([existing.responsible_it_staff_id, body.responsible_it_staff_id])
    : [];
  const [categories, staff] = (await Promise.all([
    categoryIds.length === 0
      ? []
      : database.inventoryCategoryTecnologia.findMany({
          where: { id: { in: categoryIds }, organization_id: context.organizationId },
          select: { id: true, name: true },
        }),
    staffIds.length === 0
      ? []
      : database.user.findMany({
          where: { id: { in: staffIds }, organization_id: context.organizationId },
          select: { id: true, name: true, full_name: true },
        }),
  ])) as [Row[], Row[]];
  const nameOf = (rows: Row[], value: unknown) => {
    const found = rows.find((item) => item.id === value);
    return found ? text(found.full_name || found.name) : text(value);
  };

  const fields: Array<{ field: string; key: string; show: (value: unknown) => string | null }> = [
    { field: "asset_code", key: "asset_code", show: text },
    { field: "category", key: "category_id", show: (value) => nameOf(categories, value) },
    { field: "notes", key: "notes", show: text },
    { field: "delivery_date", key: "delivery_date", show: day },
    {
      field: "responsible_it_staff",
      key: "responsible_it_staff_id",
      show: (value) => nameOf(staff, value),
    },
  ];

  return (
    fields
      // A mudança é decidida pelo valor gravado (id, texto ou dia), não pelo nome exibido:
      // trocar por outra pessoa ou categoria de mesmo nome também entra no histórico.
      .filter(({ key }) => {
        const same = key === "delivery_date" ? day : text;
        return body[key] !== undefined && same(existing[key]) !== same(body[key]);
      })
      .map(({ field, key, show }) => ({
        field,
        before: show(existing[key]),
        after: show(body[key]),
      }))
      .map((change) => ({
        item_type: "inventory" as const,
        item_id: id,
        ...change,
        note: INVENTORY_UPDATE_NOTE,
        actor_user_id: context.userId,
        organization_id: context.organizationId,
      }))
  );
}

/** Alterações de TI da organização, da mais recente para a mais antiga. */
export async function listTiChangeHistory(
  database: TiChangeHistoryDatabase,
  context: { organizationId: string },
  query: ListTiChangeHistoryQuery,
) {
  const { skip, take } = getPaginationParams(query);
  const rows = (await database.changeHistoryTecnologia.findMany({
    where: {
      organization_id: context.organizationId,
      ...(query.item_type ? { item_type: query.item_type } : {}),
      ...(query.item_id ? { item_id: query.item_id } : {}),
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    skip,
    take: take + 1,
  })) as Row[];
  const page = rows.slice(0, take);

  const actorIds = ids(page.map((row) => row.actor_user_id));
  const inventoryIds = ids(
    page.filter((row) => row.item_type === "inventory").map((row) => row.item_id),
  );
  const [actors, assets] = (await Promise.all([
    actorIds.length === 0
      ? []
      : database.user.findMany({
          where: { id: { in: actorIds }, organization_id: context.organizationId },
          select: { id: true, name: true, full_name: true },
        }),
    inventoryIds.length === 0
      ? []
      : database.inventoryTecnologia.findMany({
          where: { id: { in: inventoryIds }, organization_id: context.organizationId },
          select: { id: true, asset_code: true },
        }),
  ])) as [Row[], Row[]];

  return {
    items: page.map((row) => {
      const masked = isSensitiveTiChange(String(row.item_type), String(row.field));
      return {
        id: row.id,
        item_type: row.item_type,
        item_id: row.item_id,
        // Código patrimonial quando o item é de inventário e ainda existe.
        item_label: text(assets.find((asset) => asset.id === row.item_id)?.asset_code),
        field: row.field,
        before: masked ? null : (row.before ?? null),
        after: masked ? null : (row.after ?? null),
        masked,
        note: row.note ?? null,
        actor: actors.find((actor) => actor.id === row.actor_user_id) ?? null,
        created_at: row.created_at,
      };
    }),
    page: query.page ?? 1,
    page_size: take,
    hasMore: rows.length > take,
  };
}
