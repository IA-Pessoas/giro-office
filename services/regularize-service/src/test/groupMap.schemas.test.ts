import { describe, expect, it } from "vitest";

import {
  GROUP_MAP_TREE_LIMITS,
  type GroupMapTreeNode,
  parseSaveGroupMapBody,
} from "../schemas/groupMap.schemas.js";

function node(id: string, children: GroupMapTreeNode[] = []): GroupMapTreeNode {
  return { id, lines: [`Item ${id}`], children };
}

describe("parseSaveGroupMapBody", () => {
  it("aceita a árvore editada com cor, acentos e emoji inteiro", () => {
    const tree = {
      ...node("raiz", [{ id: "filho", lines: ["Ação 😀 & <teste>"], children: [] }]),
      color: "#ff0000",
    };

    expect(parseSaveGroupMapBody({ tree })).toEqual({ tree });
  });

  it.each([
    ["cor fora do formato", { ...node("raiz"), color: "vermelho" }],
    ["cor que tenta injetar estilo", { ...node("raiz"), color: "#fff;background:url(x)" }],
    ["item sem linhas", { id: "raiz", lines: [], children: [] }],
    ["linha longa demais", { id: "raiz", lines: ["a".repeat(201)], children: [] }],
    ["campo desconhecido", { ...node("raiz"), onclick: "alert(1)" }],
    ["caractere nulo no texto", { id: "raiz", lines: ["a\u0000b"], children: [] }],
    ["caractere de controle no texto", { id: "raiz", lines: ["a\u0001b"], children: [] }],
    ["metade solta de emoji", { id: "raiz", lines: ["a\ud83d"], children: [] }],
    ["filhos que não são lista", { id: "raiz", lines: ["a"], children: "x" }],
  ])("recusa %s", (_name, tree) => {
    expect(() => parseSaveGroupMapBody({ tree })).toThrow();
  });

  it("recusa corpo sem árvore", () => {
    expect(() => parseSaveGroupMapBody({})).toThrow();
    expect(() => parseSaveGroupMapBody(null)).toThrow();
  });

  it("recusa dois itens com o mesmo id", () => {
    expect(() => parseSaveGroupMapBody({ tree: node("raiz", [node("a"), node("a")]) })).toThrow(
      /mesmo id/,
    );
  });

  it("recusa árvore com itens demais", () => {
    const children = Array.from({ length: GROUP_MAP_TREE_LIMITS.maxNodes }, (_, index) =>
      node(`n${index}`),
    );

    expect(() => parseSaveGroupMapBody({ tree: node("raiz", children) })).toThrow(/itens/);
  });

  it("recusa árvore funda demais sem estourar a pilha", () => {
    let tree = node("folha");
    for (let depth = 0; depth < 50_000; depth++) tree = node(`n${depth}`, [tree]);

    expect(() => parseSaveGroupMapBody({ tree })).toThrow(/itens|níveis/);
  });
});
