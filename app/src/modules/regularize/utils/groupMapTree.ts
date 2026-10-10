import type { RegularizeGroupMap } from "../types";

// Árvore do mapa de grupo (#1748): grupo → cidade → sócio → empresa → dados da empresa, como
// o mapas/mapa.php do legado montava para o gráfico.

export type GroupMapNode = {
  id: string;
  lines: string[];
  children: GroupMapNode[];
};

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
} as const;

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

// Quebra em palavras para caber na caixa, como o Painel::quebrarTexto do legado.
export function wrapGroupMapLine(text: string, maxLength = MAX_LINE_LENGTH): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
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

function node(id: string, texts: string[], children: GroupMapNode[] = []): GroupMapNode {
  return { id, lines: texts.flatMap((text) => wrapGroupMapLine(text)), children };
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
