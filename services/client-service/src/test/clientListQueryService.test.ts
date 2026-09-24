import { describe, expect, it } from "vitest";
import {
  buildLegacyListStatusWhere,
  mergeClientListSearchWhere,
} from "../services/clientListQueryService.js";

describe("buildLegacyListStatusWhere", () => {
  it("retorna undefined quando nao ha filtro aplicavel", () => {
    expect(buildLegacyListStatusWhere(undefined, undefined)).toBeUndefined();
    expect(buildLegacyListStatusWhere("deps", "Todos")).toBeUndefined();
  });

  it("integracao + Ativo exige dominio_code", () => {
    expect(buildLegacyListStatusWhere("integracao", "Ativo")).toEqual({
      AND: [{ status: "Ativo" }, { dominio_code: { not: null } }, { dominio_code: { not: "" } }],
    });
  });

  it("integracao aceita typo legado de nao contratados e paralisados", () => {
    expect(buildLegacyListStatusWhere("integracao", "Não Contradado e Paralisado")).toEqual({
      prospecting_status: { in: ["Paralisado", "Recusado pelo Cliente"] },
    });
  });

  it("deps + Departamento contabil filtra módulo e status Ativo", () => {
    expect(buildLegacyListStatusWhere("deps", "Departamento contabil")).toEqual({
      contabil: true,
      status: "Ativo",
    });
  });
});

describe("mergeClientListSearchWhere", () => {
  it("combina busca com base", () => {
    const merged = mergeClientListSearchWhere({ status: "Ativo" }, "acme");
    expect(merged).toEqual({
      AND: [
        { status: "Ativo" },
        {
          OR: [
            { name: { contains: "acme", mode: "insensitive" } },
            { company_name: { contains: "acme", mode: "insensitive" } },
            { fantasy_name: { contains: "acme", mode: "insensitive" } },
            { cpf_cnpj: { contains: "acme", mode: "insensitive" } },
          ],
        },
      ],
    });
  });

  it("normaliza pontuação na busca por CPF/CNPJ", () => {
    expect(mergeClientListSearchWhere({}, "12.345.678/0001-95")).toEqual({
      AND: [
        {},
        {
          OR: [
            { name: { contains: "12.345.678/0001-95", mode: "insensitive" } },
            { company_name: { contains: "12.345.678/0001-95", mode: "insensitive" } },
            { fantasy_name: { contains: "12.345.678/0001-95", mode: "insensitive" } },
            { cpf_cnpj: { contains: "12345678000195", mode: "insensitive" } },
          ],
        },
      ],
    });
  });
});
