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
      status: "Ativo",
      dominio_code: { not: null },
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
});
