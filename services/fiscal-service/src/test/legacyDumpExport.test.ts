import { describe, expect, it, vi } from "vitest";
import { simulateFiscalHistoryImport } from "../history/fiscalHistorySimulation.js";
import { buildFiscalHistoryExport, parseInsertRows } from "../history/legacyDumpExport.js";

const org = "a0000000-0000-4000-8000-000000000001";
const alfa = "d0000000-0000-4000-8000-000000000001";

/** Dump sintético no formato do phpMyAdmin; nada de dados reais. */
const dump = {
  controle_impostos: `-- phpMyAdmin SQL Dump
INSERT INTO \`tb_fiscal.controle_impostos\` (\`id\`, \`competencia\`, \`codigo_empresa\`, \`responsavel\`, \`anotacoes\`, \`tipo\`) VALUES
(1, '2024-07', 101, '32', 'it''s \\'ok\\', a,b)', 'Completo'),
(2, '2024-07', 102, '24', '', 'Normal');
INSERT INTO \`tb_fiscal.controle_impostos\` (\`id\`, \`competencia\`, \`codigo_empresa\`, \`responsavel\`, \`anotacoes\`, \`tipo\`) VALUES
(3, '2024-08', 103, '7', NULL, 'MEI');
COMMIT;`,
  controle_impostos_sn: `INSERT INTO \`tb_fiscal.controle_impostos_sn\` (\`id\`, \`id_comp\`, \`segmento\`, \`sn_tipo\`, \`das\`, \`dirbi\`) VALUES
(1, 1, 'Comércio', 'Completo', '2024-08-14', '0001-01-01');`,
  controle_impostos_normal: `INSERT INTO \`tb_fiscal.controle_impostos_normal\` (\`id\`, \`id_comp\`, \`dctf\`, \`sped_contribuicoes\`) VALUES
(1, 2, '0000-00-00', '2024-08-15');`,
  controle_impostos_mei: "",
  controle_impostos_anual: `INSERT INTO \`tb_fiscal.controle_impostos_anual\` (\`id\`, \`tipo\`, \`competencia\`, \`codigo_empresa\`, \`responsavel\`, \`defis\`, \`dmed\`, \`dimob\`, \`dirb\`) VALUES
(1, 'SN', '2025', 101, 212, '0000-00-00', '0000-00-00', '0000-00-00', '0001-01-01');`,
};

describe("parseInsertRows", () => {
  it("lê vários INSERT, aspas escapadas, vírgulas e parênteses dentro de texto e NULL", () => {
    const rows = parseInsertRows(dump.controle_impostos);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ id: 1, codigo_empresa: 101, anotacoes: "it's 'ok', a,b)" });
    expect(rows[2]).toMatchObject({ id: 3, anotacoes: null, tipo: "MEI" });
  });

  it("recusa linha com quantidade de valores diferente das colunas", () => {
    expect(() => parseInsertRows("INSERT INTO `t` (`a`, `b`) VALUES\n(1);")).toThrow(/1 valores/);
  });
});

describe("buildFiscalHistoryExport", () => {
  it("liga o detalhe do regime pelo id_comp e entrega um export que a simulação aceita", async () => {
    const file = buildFiscalHistoryExport(dump, org);

    expect(file.monthly[0]).toEqual({
      legacy_id: 1,
      codigo_empresa: 101,
      competencia: "2024-07",
      tipo: "Completo",
      responsavel: "32",
      obligations: { das: "2024-08-14", dirbi: "0001-01-01" },
    });
    expect(file.monthly[1].obligations).toEqual({
      dctf: "0000-00-00",
      sped_contribuicoes: "2024-08-15",
    });
    // MEI sem linha de detalhe: cabeçalho segue, sem obrigações.
    expect(file.monthly[2].obligations).toEqual({});
    expect(file.annual[0]).toMatchObject({ competencia: "2025", dirb: "0001-01-01" });

    const report = await simulateFiscalHistoryImport(
      file,
      { organizationId: org },
      {
        clientsByIds: vi.fn(async () => []),
        clientsByDominioCodes: vi.fn(async () => [
          { id: alfa, organization_id: org, dominio_code: "101" },
        ]),
        existingMonthlyControls: vi.fn(async () => []),
        existingAnnualControls: vi.fn(async () => []),
      },
    );
    expect(report.monthly.map((row) => row.result)).toEqual(["ACCEPTED", "IGNORED", "IGNORED"]);
    expect(report.annual[0].result).toBe("ACCEPTED");
  });
});
