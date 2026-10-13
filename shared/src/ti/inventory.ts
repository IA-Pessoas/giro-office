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

/** Chave do bloqueio transacional que serializa as escritas de computador de uma pessoa. */
export function activeComputerLockKey(organizationId: string, userId: string): string {
  return `ti.inventory.active-computer:${organizationId}:${userId}`;
}
