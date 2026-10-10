import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { VeriComparisonService } from "../services/veriComparisonService.js";
import { veriWorkbook } from "./veriFixtures.js";

const organizationId = "10000000-0000-4000-8000-000000000001";

describe("VeriComparisonService", () => {
  it("mostra correspondências, ausências dos dois lados e entradas inválidas", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { name: "Alfa (cadastro)", cpf_cnpj: "11.222.333/0001-81" },
      { name: "Delta só no Workspace", cpf_cnpj: "11444777000161" },
      { name: "Sem documento", cpf_cnpj: "" },
    ]);
    const service = new VeriComparisonService({ client: { findMany } });

    const result = await service.compare({
      organizationId,
      file: veriWorkbook([
        ["cabeçalho"],
        ["cabeçalho"],
        ["Alfa (planilha)", "", "11222333000181"],
        ["Beta só no Veri", "", "45.723.174/0001-10"],
        ["Inválida", "", "123"],
      ]),
    });

    expect(result.rows).toEqual([
      {
        name: "Alfa (cadastro)",
        document: "11222333000181",
        in_veri: true,
        in_workspace: true,
        status: "Ambos",
      },
      {
        name: "Beta só no Veri",
        document: "45723174000110",
        in_veri: true,
        in_workspace: false,
        status: "Veri",
      },
      {
        name: "Delta só no Workspace",
        document: "11444777000161",
        in_veri: false,
        in_workspace: true,
        status: "Workspace",
      },
    ]);
    expect(result.invalid).toEqual([
      {
        row: 5,
        name: "Inválida",
        value: "123",
        reason: "CPF/CNPJ deve ter 11 ou 14 dígitos; a célula tem 3.",
      },
    ]);
    expect(result.totals).toEqual({
      veri: 2,
      workspace: 2,
      both: 1,
      veri_only: 1,
      workspace_only: 1,
      invalid: 1,
      workspace_without_document: 1,
    });
  });

  it("compara só com clientes ativos ou em inativação da organização", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new VeriComparisonService({ client: { findMany } });

    await service.compare({ organizationId, file: veriWorkbook([["a"], ["b"]]) });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        status: { in: ["Ativo", "Processo de Inativação", "A", "P"] },
      },
      select: { name: true, cpf_cnpj: true },
      orderBy: { name: "asc" },
    });
  });

  it("não consulta o cadastro quando o arquivo é recusado", async () => {
    const findMany = vi.fn();
    const service = new VeriComparisonService({ client: { findMany } });

    await expect(
      service.compare({ organizationId, file: Buffer.from("não é planilha") }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(findMany).not.toHaveBeenCalled();
  });
});
