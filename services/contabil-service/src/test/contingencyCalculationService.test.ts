import { describe, expect, it } from "vitest";
import {
  CONTINGENCY_LIMITS,
  simulateContingencyXls,
} from "../services/contingencyCalculationService.js";
import { contingencyRows, contingencyXls } from "./contingencyFixtures.js";

describe("simulação de Contingência", () => {
  it("reproduz os dois cenários do PHP e informa a origem dos valores extraídos", () => {
    const result = simulateContingencyXls(contingencyXls(), 11, "11222333000181");
    expect(result.differenceCents).toBe(8000000);
    expect(result.internalTransfersCents).toBe(2200000);
    expect(result.minimum).toEqual({
      baseCents: 2000000,
      taxCents: 220000,
      penaltyCents: 165000,
      interestCents: 13200,
      totalCents: 398200,
    });
    expect(result.maximum).toEqual({
      baseCents: 4800000,
      taxCents: 528000,
      penaltyCents: 396000,
      interestCents: 31680,
      totalCents: 955680,
    });
    expect(result.extraction[0]).toMatchObject({
      key: "declaredRevenue",
      valueCents: 10000000,
      rawValue: "100.000,00",
      sheet: "Balancete",
      labelCell: "I2",
      valueCell: "U2",
    });
    expect(result.identity).toBe("matched");
  });

  it.each([
    "",
    "abc",
    "1.23,45",
    "100,00 lixo",
    "NaN",
  ])("recusa valor monetário inválido %j com a célula de origem", (value) => {
    const rows = contingencyRows();
    rows[1][20] = value;
    expect(() => simulateContingencyXls(contingencyXls(rows), 11, "11222333000181")).toThrow(
      /U2.*inválido/,
    );
  });

  it("aceita parênteses negativos e número decimal do PHP sem confundir reais com centavos", () => {
    const rows = contingencyRows();
    rows[4][20] = "(2.000,50)";
    rows[5][20] = "1000.25";
    const result = simulateContingencyXls(contingencyXls(rows), 11, "11222333000181");
    expect(result.extraction[3].valueCents).toBe(-200050);
    expect(result.extraction[4].valueCents).toBe(100025);
  });

  it("recusa CNPJ divergente, inclusive quando está na célula ao lado do rótulo", () => {
    const rows = contingencyRows();
    rows[0] = ["CNPJ", "99.888.777/0001-66"];
    expect(() => simulateContingencyXls(contingencyXls(rows), 11, "11222333000181")).toThrow(
      /CNPJ.*diverge/,
    );
  });

  it("recusa ausência de rótulos, arquivo falso e limites excedidos", () => {
    const rows = contingencyRows();
    rows[1][8] = "OUTRO RÓTULO";
    expect(() => simulateContingencyXls(contingencyXls(rows), 11, "11222333000181")).toThrow(
      /Rótulo ausente/,
    );
    for (const bytes of [Buffer.alloc(0), Buffer.from("<table>falso.xls</table>")]) {
      expect(() => simulateContingencyXls(bytes, 11, "11222333000181")).toThrow(/Assinatura/);
    }
    expect(() =>
      simulateContingencyXls(Buffer.alloc(CONTINGENCY_LIMITS.bytes + 1), 11, "11222333000181"),
    ).toThrow(/5 MiB/);
    const longRows = contingencyRows();
    longRows[CONTINGENCY_LIMITS.rows] = ["limite"];
    expect(() => simulateContingencyXls(contingencyXls(longRows), 11, "11222333000181")).toThrow(
      /limite.*linhas/,
    );
  });

  it("preserva a busca legada até o primeiro valor não zero e limita a base mínima a zero", () => {
    const rows = contingencyRows();
    rows[1][20] = 0;
    const last = [...rows[1]];
    last[20] = 200000;
    rows.push(last);
    const result = simulateContingencyXls(contingencyXls(rows), 11, "11222333000181");
    expect(result.extraction[0]).toMatchObject({ valueCents: 20000000, valueCell: "U9" });
    expect(result.minimum.baseCents).toBe(0);
    expect(result.maximum.baseCents).toBe(2800000);
  });

  it("arredonda cada saída como o PHP, sem arredondar o tributo antes de calcular multa e total", () => {
    const rows = contingencyRows();
    rows[3][20] = 100000.05;
    rows[0] = [];
    const result = simulateContingencyXls(contingencyXls(rows), 11, "11222333000181");
    expect(result.minimum).toEqual({
      baseCents: 5,
      taxCents: 1,
      penaltyCents: 0,
      interestCents: 0,
      totalCents: 1,
    });
    expect(result.identity).toBe("not_found");
  });
});
