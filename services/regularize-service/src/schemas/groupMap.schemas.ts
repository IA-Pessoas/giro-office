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

const groupMapTreeNodeSchema: z.ZodType<GroupMapTreeNode> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1).max(GROUP_MAP_TREE_LIMITS.maxIdLength),
      lines: z
        .array(z.string().max(GROUP_MAP_TREE_LIMITS.maxLineLength))
        .min(1)
        .max(GROUP_MAP_TREE_LIMITS.maxLines),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.")
        .optional(),
      children: z.array(groupMapTreeNodeSchema),
    })
    .strict(),
);

const saveGroupMapBodySchema = z.object({ tree: groupMapTreeNodeSchema }).strict();

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
