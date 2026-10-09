import { describe, expect, it, vi } from "vitest";

import {
  type FiscalHistoryExport,
  type FiscalHistoryReader,
  simulateFiscalHistoryImport,
} from "../history/fiscalHistorySimulation.js";

const org = "a0000000-0000-4000-8000-000000000001";
const otherOrg = "a0000000-0000-4000-8000-000000000002";
const alfa = "d0000000-0000-4000-8000-000000000001";
const beta = "d0000000-0000-4000-8000-000000000002";
const gamaA = "d0000000-0000-4000-8000-000000000003";
const gamaB = "d0000000-0000-4000-8000-000000000004";
const foreign = "d0000000-0000-4000-8000-000000000009";

/** Banco sintético: só leitura, nada de dados reais. */
function reader(): FiscalHistoryReader & { calls: string[] } {
  const clients = [
    { id: alfa, organization_id: org, dominio_code: "101" },
    { id: beta, organization_id: org, dominio_code: "102" },
    { id: gamaA, organization_id: org, dominio_code: "103" },
    { id: gamaB, organization_id: org, dominio_code: "103" },
    { id: foreign, organization_id: otherOrg, dominio_code: "104" },
  ];
  const calls: string[] = [];
  return {
    calls,
    clientsByIds: vi.fn(async (organizationId: string, ids: string[]) => {
      calls.push("clientsByIds");
      return clients.filter((c) => c.organization_id === organizationId && ids.includes(c.id));
    }),
    clientsByDominioCodes: vi.fn(async (organizationId: string, codes: string[]) => {
      calls.push("clientsByDominioCodes");
      return clients.filter(
        (c) => c.organization_id === organizationId && codes.includes(c.dominio_code),
      );
    }),
    existingMonthlyControls: vi.fn(async (organizationId: string) => {
      calls.push("existingMonthlyControls");
      return organizationId === org ? [{ client_id: alfa, competence: "2025-07" }] : [];
    }),
    existingAnnualControls: vi.fn(async () => {
      calls.push("existingAnnualControls");
      return [];
    }),
  };
}

function exportFile(overrides: Partial<FiscalHistoryExport> = {}): FiscalHistoryExport {
  return {
    format: "giro-fiscal-history/v1",
    organization_id: org,
    client_map: [{ legacy_code: 102, client_id: beta }],
    monthly: [
      {
        legacy_id: 1,
        codigo_empresa: 101,
        competencia: "2025-08",
        tipo: "SN",
        responsavel: "7",
        obligations: {
          das: "2025-09-18",
          efd_reinf: "0001-01-01",
          sped_fiscal: "0000-00-00",
          dirbi: "",
        },
      },
      {
        legacy_id: 2,
        codigo_empresa: 102,
        competencia: "2025-08",
        tipo: "Normal",
        responsavel: "7",
        obligations: { dctf: "2025-09-30", sped_contribuicoes: "2025-10-14", pis: "2025-09-25" },
      },
      {
        legacy_id: 3,
        codigo_empresa: 103,
        competencia: "2025-08",
        tipo: "SN",
        responsavel: "",
        obligations: { das: "2025-09-18" },
      },
      {
        legacy_id: 4,
        codigo_empresa: 999,
        competencia: "2025-08",
        tipo: "SN",
        responsavel: "",
        obligations: {},
      },
      {
        legacy_id: 5,
        codigo_empresa: 101,
        competencia: "2025-08",
        tipo: "SN",
        responsavel: "",
        obligations: {},
      },
      {
        legacy_id: 6,
        codigo_empresa: 101,
        competencia: "2025-07",
        tipo: "SN",
        responsavel: "",
        obligations: {},
      },
      {
        legacy_id: 7,
        codigo_empresa: 101,
        competencia: "08/2025",
        tipo: "SN",
        responsavel: "",
        obligations: {},
      },
    ],
    annual: [
      {
        legacy_id: 10,
        codigo_empresa: 101,
        competencia: "2024",
        tipo: "SN",
        responsavel: "7",
        defis: "2025-03-28",
        dmed: "0001-01-01",
        dimob: "",
        dirb: "2025-02-27",
      },
    ],
    ...overrides,
  };
}

describe("simulateFiscalHistoryImport", () => {
  it("exige organização de destino explícita igual à do export", async () => {
    await expect(
      simulateFiscalHistoryImport(exportFile(), { organizationId: otherOrg }, reader()),
    ).rejects.toThrow(/organização de destino/i);
    await expect(
      simulateFiscalHistoryImport(
        { ...exportFile(), format: "outro" as never },
        { organizationId: org },
        reader(),
      ),
    ).rejects.toThrow(/formato/i);
  });

  it("mapeia cliente sem associação ambígua e classifica cada linha", async () => {
    const report = await simulateFiscalHistoryImport(
      exportFile(),
      { organizationId: org },
      reader(),
    );
    const byId = new Map(report.monthly.map((row) => [row.legacy_id, row]));

    // 101: Domínio único → aceito, mas duplicado no próprio export (1 e 5) → ambíguo.
    expect(byId.get(1)).toMatchObject({
      result: "AMBIGUOUS",
      client_id: alfa,
      mapping: "DOMINIO_UNIQUE",
    });
    expect(byId.get(5)).toMatchObject({ result: "AMBIGUOUS" });
    // 102: mapa explícito.
    expect(byId.get(2)).toMatchObject({ result: "ACCEPTED", client_id: beta, mapping: "EXPLICIT" });
    // 103: Domínio com dois clientes → ambíguo, sem escolher.
    expect(byId.get(3)).toMatchObject({ result: "AMBIGUOUS", client_id: null });
    expect(byId.get(3)?.reason).toMatch(/2 clientes/);
    // 999: sem cliente → ignorado.
    expect(byId.get(4)).toMatchObject({ result: "IGNORED", client_id: null });
    // Já existe controle no Office para 101/2025-07: aceito, mas sem duplicar.
    expect(byId.get(6)).toMatchObject({ result: "ACCEPTED", existing_control: true });
    // Competência fora do formato → ignorado.
    expect(byId.get(7)).toMatchObject({ result: "IGNORED" });
    expect(byId.get(7)?.reason).toMatch(/competência/i);

    expect(report.summary.monthly).toEqual({ accepted: 2, ignored: 2, ambiguous: 3 });
  });

  it("converte a sentinela 0001-01-01 em não aplicável preservando o valor bruto", async () => {
    const report = await simulateFiscalHistoryImport(
      exportFile({ monthly: [exportFile().monthly[0]] }),
      { organizationId: org },
      reader(),
    );
    expect(report.monthly[0].items).toEqual([
      {
        legacy_field: "das",
        raw: "2025-09-18",
        code: "PGDAS_D",
        outcome: "COMPLETED",
        completed_on: "2025-09-18",
      },
      {
        legacy_field: "efd_reinf",
        raw: "0001-01-01",
        code: null,
        outcome: "NOT_APPLICABLE",
        completed_on: null,
      },
      {
        legacy_field: "sped_fiscal",
        raw: "0000-00-00",
        code: null,
        outcome: "PENDING",
        completed_on: null,
      },
      { legacy_field: "dirbi", raw: "", code: "DIRBI", outcome: "PENDING", completed_on: null },
    ]);
  });

  it("DCTF só vira DCTFWeb a partir de 2025 e campos sem catálogo ficam como dado bruto", async () => {
    const before = exportFile().monthly[1];
    const report = await simulateFiscalHistoryImport(
      exportFile({ monthly: [{ ...before, competencia: "2024-11" }, before] }),
      { organizationId: org },
      reader(),
    );
    const codes = (index: number) =>
      Object.fromEntries(report.monthly[index].items.map((item) => [item.legacy_field, item.code]));
    expect(codes(0)).toEqual({ dctf: null, sped_contribuicoes: "EFD_CONTRIBUICOES", pis: null });
    expect(codes(1)).toEqual({
      dctf: "DCTFWEB",
      sped_contribuicoes: "EFD_CONTRIBUICOES",
      pis: null,
    });
  });

  it("anual: não infere conclusão das datas legadas e DIRB não gera obrigação", async () => {
    const report = await simulateFiscalHistoryImport(
      exportFile(),
      { organizationId: org },
      reader(),
    );
    expect(report.annual[0]).toMatchObject({ result: "ACCEPTED", client_id: alfa, year: 2024 });
    expect(report.annual[0].items).toEqual([
      {
        legacy_field: "defis",
        raw: "2025-03-28",
        code: "DEFIS",
        outcome: "RAW_ONLY",
        completed_on: null,
      },
      {
        legacy_field: "dmed",
        raw: "0001-01-01",
        code: "DMED",
        outcome: "NOT_APPLICABLE",
        completed_on: null,
      },
      { legacy_field: "dimob", raw: "", code: "DIMOB", outcome: "PENDING", completed_on: null },
      {
        legacy_field: "dirb",
        raw: "2025-02-27",
        code: null,
        outcome: "RAW_ONLY",
        completed_on: null,
      },
    ]);
  });

  it("é repetível, isola a organização e só lê", async () => {
    const db = reader();
    const first = await simulateFiscalHistoryImport(exportFile(), { organizationId: org }, db);
    const second = await simulateFiscalHistoryImport(exportFile(), { organizationId: org }, db);
    expect(second).toEqual(first);

    // Mapa explícito para cliente de outra organização não é aceito.
    const isolated = await simulateFiscalHistoryImport(
      exportFile({
        client_map: [{ legacy_code: 104, client_id: foreign }],
        monthly: [{ ...exportFile().monthly[1], codigo_empresa: 104 }],
        annual: [],
      }),
      { organizationId: org },
      db,
    );
    expect(isolated.monthly[0]).toMatchObject({ result: "IGNORED", client_id: null });
    expect(isolated.monthly[0].reason).toMatch(/organização/);

    // O leitor só expõe consultas; nenhuma outra chamada acontece.
    expect(new Set(db.calls)).toEqual(
      new Set([
        "clientsByIds",
        "clientsByDominioCodes",
        "existingMonthlyControls",
        "existingAnnualControls",
      ]),
    );
  });
});
