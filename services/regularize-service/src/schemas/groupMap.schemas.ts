import { parseWithZod, ServiceError } from "@workspace/shared";
import { z } from "zod";

export const groupMapParamsSchema = z
  .object({
    id: z.string().uuid("Grupo inválido."),
  })
  .strict();

// Árvore do mapa editado (#1749). Vem do navegador, então tem teto de tamanho.
export const GROUP_MAP_TREE_LIMITS = {
  maxNodes: 2_000,
  maxDepth: 12,
  maxLines: 20,
  maxLineLength: 200,
  maxIdLength: 300,
} as const;

export type GroupMapTreeNode = {
  id: string;
  lines: string[];
  color?: string;
  children: GroupMapTreeNode[];
};

// Caracteres de controle e metades soltas de par substituto: o Postgres recusa parte deles em
// JSONB e o restante quebraria o SVG do mapa na hora de exportar.
const UNSAFE_TEXT =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: é exatamente o que se recusa
  /[\u0000-\u001f\u007f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const UNSAFE_TEXT_MESSAGE = "O texto do mapa tem caracteres inválidos.";
function isSafeText(value: string): boolean {
  return !UNSAFE_TEXT.test(value);
}

const ITEM_ID_MESSAGE = "Item do mapa sem identificação válida.";
const ITEM_LINES_MESSAGE = "Todo item do mapa precisa de ao menos uma linha de texto.";
const ITEM_CHILDREN_MESSAGE = "Os itens abaixo de um item do mapa precisam vir em lista.";

const groupMapTreeNodeSchema: z.ZodType<GroupMapTreeNode> = z.lazy(() =>
  z
    .object({
      id: z
        .string({ required_error: ITEM_ID_MESSAGE, invalid_type_error: ITEM_ID_MESSAGE })
        .min(1, ITEM_ID_MESSAGE)
        .max(GROUP_MAP_TREE_LIMITS.maxIdLength, ITEM_ID_MESSAGE)
        .refine(isSafeText, ITEM_ID_MESSAGE),
      lines: z
        .array(
          z
            .string({ invalid_type_error: "Texto do item inválido." })
            .max(
              GROUP_MAP_TREE_LIMITS.maxLineLength,
              `Cada linha de um item tem até ${GROUP_MAP_TREE_LIMITS.maxLineLength} caracteres.`,
            )
            .refine(isSafeText, UNSAFE_TEXT_MESSAGE),
          { required_error: ITEM_LINES_MESSAGE, invalid_type_error: ITEM_LINES_MESSAGE },
        )
        .min(1, ITEM_LINES_MESSAGE)
        .max(
          GROUP_MAP_TREE_LIMITS.maxLines,
          `Cada item tem até ${GROUP_MAP_TREE_LIMITS.maxLines} linhas.`,
        ),
      color: z
        .string({ invalid_type_error: "Cor inválida." })
        .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.")
        .optional(),
      children: z.array(groupMapTreeNodeSchema, {
        required_error: ITEM_CHILDREN_MESSAGE,
        invalid_type_error: ITEM_CHILDREN_MESSAGE,
      }),
    })
    .strict(),
);

const saveGroupMapBodySchema = z
  .object(
    { tree: groupMapTreeNodeSchema },
    { required_error: "Envie o mapa.", invalid_type_error: "Envie o mapa." },
  )
  .strict();

// Conta nós e profundidade sem recursão, antes do Zod: uma árvore com milhares de níveis
// estouraria a pilha na validação recursiva.
function assertTreeSize(tree: unknown): void {
  const pending: Array<{ node: unknown; depth: number }> = [{ node: tree, depth: 1 }];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    if (++nodes > GROUP_MAP_TREE_LIMITS.maxNodes) {
      throw new ServiceError(400, `O mapa passa de ${GROUP_MAP_TREE_LIMITS.maxNodes} itens.`);
    }
    if (current.depth > GROUP_MAP_TREE_LIMITS.maxDepth) {
      throw new ServiceError(400, `O mapa passa de ${GROUP_MAP_TREE_LIMITS.maxDepth} níveis.`);
    }
    const children = (current.node as { children?: unknown } | null)?.children;
    if (Array.isArray(children)) {
      for (const child of children) pending.push({ node: child, depth: current.depth + 1 });
    }
  }
}

function assertUniqueIds(tree: GroupMapTreeNode): void {
  const seen = new Set<string>();
  const pending = [tree];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) break;
    if (seen.has(node.id)) throw new ServiceError(400, "O mapa tem itens com o mesmo id.");
    seen.add(node.id);
    pending.push(...node.children);
  }
}

export function parseSaveGroupMapBody(body: unknown): { tree: GroupMapTreeNode } {
  assertTreeSize((body as { tree?: unknown } | null)?.tree);
  const parsed = parseWithZod(saveGroupMapBodySchema, body);
  assertUniqueIds(parsed.tree);
  return parsed;
}
