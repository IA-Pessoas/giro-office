/**
 * Regra do computador ativo do inventário de TI (#1931), usada pelo serviço Node e pelo
 * Worker: uma pessoa não termina com mais de um computador ativo na organização. Ativo é o
 * computador que está com uma pessoa (`user_id`) e sem devolução (`return_date` nulo); a data
 * sentinela do legado (`0000-00-00`) migra como `return_date` nulo.
 */

/** Categoria canônica: é reconhecida pelo nome, que não pode ser trocado nem desativado. */
const COMPUTER_CATEGORY_NAME = "computador";

export const ACTIVE_COMPUTER_CONFLICT_MESSAGE = "Esse usuário já possui um computador ativo.";

export const COMPUTER_CATEGORY_LOCKED_MESSAGE =
  "A categoria Computador é usada pela regra do computador ativo e não pode ser renomeada nem desativada.";

/** Compara nomes do inventário sem depender de caixa, acento ou espaços nas pontas. */
export function normalizeTiName(name: unknown): string {
  if (typeof name !== "string") return "";
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function isComputerCategoryName(name: unknown): boolean {
  return normalizeTiName(name) === COMPUTER_CATEGORY_NAME;
}

export const COMPUTER_CATEGORY_RENAME_CONFLICT_MESSAGE =
  "Há pessoas com mais de um item ativo nesta categoria; ela não pode virar Computador.";

/** Pessoas que ficariam com mais de um computador ativo se estes itens fossem computadores. */
export function hasUserWithSeveralActiveAssets(assets: Array<{ user_id?: unknown }>): boolean {
  const seen = new Set<unknown>();
  return assets.some((asset) => {
    if (seen.has(asset.user_id)) return true;
    seen.add(asset.user_id);
    return false;
  });
}

/** Nome de catálogo de TI para comparação: sem caixa, acento, pontas nem espaços repetidos. */
export function normalizeTiCatalogName(name: unknown): string {
  return normalizeTiName(name).replace(/\s+/gu, " ");
}

/** Há outro registro com este nome? `rows` são os registros ativos do mesmo catálogo. */
export function hasTiCatalogNameConflict(
  rows: Array<{ id?: unknown; name?: unknown }>,
  name: unknown,
  exceptId?: unknown,
): boolean {
  const normalized = normalizeTiCatalogName(name);
  return rows.some((row) => row.id !== exceptId && normalizeTiCatalogName(row.name) === normalized);
}

/**
 * Nome a conferir numa edição de catálogo de TI (categoria ou local, #1937): o nome final,
 * quando o registro termina ativo e foi renomeado ou reativado. `null` quando não há o que
 * conferir — desativar ou mexer em outro campo nunca esbarra em nome duplicado.
 */
export function tiCatalogNameToCheck(
  current: { name: unknown; active: unknown },
  next: { name?: unknown; active?: unknown },
): string | null {
  const endsActive = next.active === undefined ? current.active === true : next.active === true;
  if (!endsActive) return null;
  const renamed =
    next.name !== undefined &&
    normalizeTiCatalogName(next.name) !== normalizeTiCatalogName(current.name);
  const reactivated = current.active !== true;
  return renamed || reactivated ? String(next.name ?? current.name) : null;
}

/** Chave do bloqueio transacional que serializa as escritas de computador de uma pessoa. */
export function activeComputerLockKey(organizationId: string, userId: string): string {
  return `ti.inventory.active-computer:${organizationId}:${userId}`;
}
