import type { RegularizeGroupMap, RegularizeGroupMapTreeNode } from "../types";

// Árvore do mapa de grupo (#1748, #1749): grupo → cidade → sócio → empresa → dados da empresa,
// como o mapas/mapa.php do legado montava para o gráfico, e as edições que ele permitia.

export type GroupMapNode = RegularizeGroupMapTreeNode;

export type GroupMapBox = {
  node: GroupMapNode;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GroupMapLayout = {
  boxes: GroupMapBox[];
  links: Array<{ from: GroupMapBox; to: GroupMapBox }>;
  width: number;
  height: number;
};

const MISSING = "não informado";
const MAX_LINE_LENGTH = 50;
// Mesmos tetos da API (GROUP_MAP_TREE_LIMITS).
const MAX_LINES = 20;
export const GROUP_MAP_MAX_NODES = 2_000;
export const GROUP_MAP_MAX_DEPTH = 12;

// Medidas do desenho em px; a largura do texto é estimada pela quantidade de caracteres.
export const GROUP_MAP_METRICS = {
  fontSize: 12,
  // Largura por caractere na fonte de 12px, com folga para razão social toda em maiúsculas.
  charWidth: 7.6,
  lineHeight: 16,
  // Quanto a primeira linha sobe para o texto ficar centrado na altura da linha.
  baselineOffset: 4,
  cornerRadius: 8,
  paddingX: 12,
  paddingY: 8,
  columnGap: 48,
  rowGap: 12,
  // Moldura da imagem: margem em volta e faixa do título.
  margin: 16,
  titleHeight: 40,
  titleFontSize: 18,
} as const;

// Cores do seletor do legado.
export const GROUP_MAP_COLORS = [
  { value: "#ffffff", label: "Branco" },
  { value: "#000000", label: "Preto" },
  { value: "#ff0000", label: "Vermelho" },
  { value: "#00ff00", label: "Verde" },
  { value: "#0000ff", label: "Azul" },
  { value: "#ffff00", label: "Amarelo" },
  { value: "#ff00ff", label: "Rosa" },
  { value: "#00ffff", label: "Ciano" },
] as const;

export const GROUP_MAP_DEFAULT_COLOR = "#ffffff";

// Texto preto em fundo claro e branco em fundo escuro, pela mesma luminância do legado.
export function groupMapTextColor(background: string): "#000000" | "#ffffff" {
  const rgb = Number.parseInt(background.slice(1), 16);
  const luminance =
    (0.299 * ((rgb >> 16) & 0xff) + 0.587 * ((rgb >> 8) & 0xff) + 0.114 * (rgb & 0xff)) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

// Cópia do formatCPF_CNPJ de @shared/utils/formatters: este arquivo roda direto no Node nos
// testes do módulo, onde o alias @shared não resolve.
function formatDocument(document: string | null): string {
  const digits = (document ?? "").replace(/\D/g, "");
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return document?.trim() || MISSING;
}

// Caracteres de controle e metades soltas de emoji: a API recusa, e o SVG serializado deixaria
// de ser XML válido na hora de gerar o PNG.
const UNSAFE_TEXT =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: é o que se quer tirar do texto
  /[\u0000-\u001f\u007f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

// Quebra em palavras para caber na caixa, como o Painel::quebrarTexto do legado. Palavra maior
// que a caixa (um link, por exemplo) é cortada em pedaços.
export function wrapGroupMapLine(text: string, maxLength = MAX_LINE_LENGTH): string[] {
  const lines: string[] = [];
  let current = "";
  const words = text
    .replace(UNSAFE_TEXT, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => word.match(new RegExp(`.{1,${maxLength}}`, "gu")) ?? []);
  for (const word of words) {
    if (current && current.length + 1 + word.length > maxLength) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// Texto digitado na edição → linhas do item: uma por linha digitada, quebradas na largura da
// caixa. Linha em branco some; devolve vazio quando não sobra texto.
export function groupMapLinesFromText(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => wrapGroupMapLine(line))
    .slice(0, MAX_LINES);
}

function node(id: string, texts: string[], children: GroupMapNode[] = []): GroupMapNode {
  return {
    id,
    lines: texts.flatMap((text) => wrapGroupMapLine(text)).slice(0, MAX_LINES),
    children,
  };
}

export function buildGroupMapTree(map: RegularizeGroupMap): GroupMapNode {
  return node(
    `group:${map.group.id}`,
    [map.group.name],
    map.cities.map((city, cityIndex) =>
      node(
        `city:${cityIndex}`,
        [city.name || "Cidade não informada"],
        city.partners.map((partner) => {
          const partnerId = `city:${cityIndex}/partner:${partner.pf_id}`;
          return node(
            partnerId,
            [partner.name],
            partner.companies.map((company) => {
              const companyId = `${partnerId}/company:${company.client_id}`;
              return node(
                companyId,
                [`Empresa: ${company.name}`, `CNPJ: ${formatDocument(company.cpf_cnpj)}`],
                [
                  node(`${companyId}/details`, [
                    `Situação: ${company.status || MISSING}`,
                    `Sede: ${company.address ?? MISSING}`,
                    `Regime: ${company.regime ?? MISSING}`,
                  ]),
                ],
              );
            }),
          );
        }),
      ),
    ),
  );
}

export function findGroupMapNode(root: GroupMapNode, id: string): GroupMapNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findGroupMapNode(child, id);
    if (found) return found;
  }
  return null;
}

// Nível do item na árvore (a raiz é 1), ou 0 quando o item não está nela.
export function groupMapNodeDepth(root: GroupMapNode, id: string): number {
  if (root.id === id) return 1;
  for (const child of root.children) {
    const depth = groupMapNodeDepth(child, id);
    if (depth > 0) return depth + 1;
  }
  return 0;
}

export function countGroupMapNodes(root: GroupMapNode): number {
  return 1 + root.children.reduce((total, child) => total + countGroupMapNodes(child), 0);
}

// As edições devolvem uma árvore nova: a que está na tela só muda quando a edição é aplicada.
function mapGroupMapNode(
  root: GroupMapNode,
  id: string,
  change: (target: GroupMapNode) => GroupMapNode,
): GroupMapNode {
  if (root.id === id) return change(root);
  return { ...root, children: root.children.map((child) => mapGroupMapNode(child, id, change)) };
}

export function updateGroupMapNode(
  root: GroupMapNode,
  id: string,
  patch: { lines: string[]; color: string },
): GroupMapNode {
  return mapGroupMapNode(root, id, (target) => ({ ...target, ...patch }));
}

export function addGroupMapChild(
  root: GroupMapNode,
  parentId: string,
  lines: string[],
): GroupMapNode {
  // O id novo não pode repetir nenhum da árvore, nem o de um item removido antes.
  let suffix = 1;
  while (findGroupMapNode(root, `${parentId}/extra:${suffix}`)) suffix++;
  const child: GroupMapNode = { id: `${parentId}/extra:${suffix}`, lines, children: [] };
  return mapGroupMapNode(root, parentId, (target) => ({
    ...target,
    children: [...target.children, child],
  }));
}

// Remove o item e tudo abaixo dele. A raiz (o grupo) não sai.
export function removeGroupMapNode(root: GroupMapNode, id: string): GroupMapNode {
  if (root.id === id) return root;
  return {
    ...root,
    children: root.children
      .filter((child) => child.id !== id)
      .map((child) => removeGroupMapNode(child, id)),
  };
}

// Árvore da esquerda para a direita: cada nível numa coluna, folhas empilhadas e o pai
// centralizado na altura dos filhos.
export function layoutGroupMapTree(root: GroupMapNode): GroupMapLayout {
  const { charWidth, lineHeight, paddingX, paddingY, columnGap, rowGap } = GROUP_MAP_METRICS;
  const columnWidths: number[] = [];
  const sizeOf = (item: GroupMapNode) => ({
    width: Math.max(...item.lines.map((line) => line.length)) * charWidth + paddingX * 2,
    height: item.lines.length * lineHeight + paddingY * 2,
  });
  const measure = (item: GroupMapNode, depth: number) => {
    columnWidths[depth] = Math.max(columnWidths[depth] ?? 0, sizeOf(item).width);
    for (const child of item.children) measure(child, depth + 1);
  };
  measure(root, 0);

  const columnX: number[] = [];
  columnWidths.reduce((x, width, depth) => {
    columnX[depth] = x;
    return x + width + columnGap;
  }, 0);

  const boxes: GroupMapBox[] = [];
  const links: GroupMapLayout["links"] = [];
  let nextY = 0;
  const place = (item: GroupMapNode, depth: number): GroupMapBox => {
    const { height } = sizeOf(item);
    const box: GroupMapBox = {
      node: item,
      x: columnX[depth] ?? 0,
      y: 0,
      width: columnWidths[depth] ?? 0,
      height,
    };
    if (item.children.length === 0) {
      box.y = nextY;
      nextY += height + rowGap;
    } else {
      const top = nextY;
      const children = item.children.map((child) => place(child, depth + 1));
      const first = children[0];
      const last = children[children.length - 1];
      if (first && last) {
        box.y = (first.y + last.y + last.height) / 2 - height / 2;
      }
      // Pai mais alto que a soma dos filhos não invade a linha seguinte.
      nextY = Math.max(nextY, Math.max(box.y, top) + height + rowGap);
      box.y = Math.max(box.y, top);
      for (const child of children) links.push({ from: box, to: child });
    }
    boxes.push(box);
    return box;
  };
  place(root, 0);

  return {
    boxes,
    links,
    width: Math.max(...boxes.map((box) => box.x + box.width)),
    height: Math.max(...boxes.map((box) => box.y + box.height)),
  };
}
