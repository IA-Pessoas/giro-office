import { describe, expect, it } from "vitest";

import {
  calculateSimplesPreview,
  previousCompetences,
  simplesBracket,
} from "../services/simplesNational.js";

// Onze meses anteriores a 2026-09, do mais recente para o mais antigo.
const MONTHS = previousCompetences("2026-09");

function revenues(amounts: number[]): Array<{ competence: string; amount: string }> {
  return amounts.map((amount, index) => ({ competence: MONTHS[index], amount: amount.toFixed(2) }));
}

function annex(result: ReturnType<typeof calculateSimplesPreview>, name: string) {
  const found = result.annexes.find((item) => item.annex === name);
  if (!found) throw new Error(`anexo ${name} ausente`);
  return found;
}

describe("previousCompetences", () => {
  it("devolve os 11 meses imediatamente anteriores, atravessando o ano", () => {
    expect(previousCompetences("2026-03")).toEqual([
      "2026-02",
      "2026-01",
      "2025-12",
      "2025-11",
      "2025-10",
      "2025-09",
      "2025-08",
      "2025-07",
      "2025-06",
      "2025-05",
      "2025-04",
    ]);
  });
});

describe("calculateSimplesPreview (tabelas do Fiscal.php legado)", () => {
  it("estima o 12º mês pela média dos 11 e soma no RBT12", () => {
    // 11 × 15.000 = 165.000; média 15.000; RBT12 180.000 (teto da 1ª faixa).
    const result = calculateSimplesPreview("2026-09", revenues(Array(11).fill(15_000)));

    expect(result.status).toBe("ok");
    expect(result.months).toHaveLength(11);
    expect(result.estimated_month).toEqual({ competence: "2026-09", amount: "15000.00" });
    expect(result.rbt12).toBe("180000.00");
    // 1ª faixa sem parcela a deduzir: efetiva = nominal.
    expect(annex(result, "I")).toMatchObject({
      tax: "ICMS",
      bracket: 1,
      nominal_rate: "4.00",
      deduction: "0.00",
      effective_rate: "4.0000",
      tax_share: "34.00",
      rate: "1.3600", // 4 × 34% = 1,36 (mínimo de ICMS da emissão)
    });
    expect(annex(result, "II")).toMatchObject({ tax: "ICMS", rate: "1.4400" }); // 4,5 × 32%
    expect(annex(result, "III")).toMatchObject({ tax: "ISS", rate: "2.0100" }); // 6 × 33,5%
    expect(annex(result, "IV")).toMatchObject({ tax: "ISS", rate: "2.0025" }); // 4,5 × 44,5%
    expect(annex(result, "V")).toMatchObject({ tax: "ISS", rate: "2.1700" }); // 15,5 × 14%
  });

  it("aplica alíquota nominal, parcela a deduzir e repartição da faixa do RBT12", () => {
    // 11 × 50.000 = 550.000; média 50.000; RBT12 600.000 → 3ª faixa.
    const result = calculateSimplesPreview("2026-09", revenues(Array(11).fill(50_000)));

    expect(result.rbt12).toBe("600000.00");
    // Anexo I, 3ª faixa: (600.000 × 9,5% − 13.860) ÷ 600.000 = 7,19%; ICMS 33,5% → 2,40865%.
    expect(annex(result, "I")).toMatchObject({
      bracket: 3,
      nominal_rate: "9.50",
      deduction: "13860.00",
      effective_rate: "7.1900",
      tax_share: "33.50",
      rate: "2.4087",
    });
    // Anexo II, 3ª faixa, com a parcela da LC 123 (13.860; o legado usava 17.640 do Anexo III):
    // (600.000 × 10% − 13.860) ÷ 600.000 = 7,69%; ICMS 32% → 2,4608%.
    expect(annex(result, "II")).toMatchObject({
      deduction: "13860.00",
      effective_rate: "7.6900",
      rate: "2.4608",
    });
    // Anexo III, 3ª faixa: (600.000 × 13,5% − 17.640) ÷ 600.000 = 10,56%; ISS 32,5% → 3,432%.
    expect(annex(result, "III")).toMatchObject({
      effective_rate: "10.5600",
      tax_share: "32.50",
      rate: "3.4320",
    });
    // Anexo V, 3ª faixa: (600.000 × 19,5% − 9.900) ÷ 600.000 = 17,85%; ISS 19% → 3,3915%.
    expect(annex(result, "V")).toMatchObject({ effective_rate: "17.8500", rate: "3.3915" });
  });

  it("identifica cada faixa pelo teto e trata qualquer valor acima dele como próxima faixa", () => {
    expect(
      [0.01, 180_000, 180_000.001, 360_000, 720_000, 1_800_000, 3_600_000, 4_800_000].map(
        simplesBracket,
      ),
    ).toEqual([1, 1, 2, 2, 3, 4, 5, 6]);
    expect(simplesBracket(4_800_000.01)).toBeNull();
  });

  it("zera ISS/ICMS na 6ª faixa, recolhidos fora do Simples", () => {
    const result = calculateSimplesPreview("2026-09", revenues(Array(11).fill(350_000)));

    expect(result.rbt12).toBe("4200000.00");
    for (const item of result.annexes) {
      expect(item.bracket).toBe(6);
      expect(item.tax_share).toBe("0.00");
      expect(item.rate).toBe("0.0000");
    }
  });

  it("conta mês sem receita registrada como zero e marca que não houve registro", () => {
    // Só 2 meses registrados: 110.000 no total; média 10.000; RBT12 120.000.
    const result = calculateSimplesPreview("2026-09", [
      { competence: "2026-08", amount: "60000.00" },
      { competence: "2026-02", amount: "50000.00" },
    ]);

    expect(result.months[0]).toEqual({
      competence: "2026-08",
      amount: "60000.00",
      registered: true,
    });
    expect(result.months[1]).toEqual({ competence: "2026-07", amount: "0.00", registered: false });
    expect(result.months.filter((month) => month.registered)).toHaveLength(2);
    expect(result.estimated_month.amount).toBe("10000.00");
    expect(result.rbt12).toBe("120000.00");
  });

  it("ignora receitas fora dos 11 meses anteriores, inclusive a da própria competência", () => {
    const result = calculateSimplesPreview("2026-09", [
      { competence: "2026-09", amount: "999999.00" },
      { competence: "2025-10", amount: "11000.00" },
      { competence: "2025-09", amount: "999999.00" },
    ]);

    expect(result.rbt12).toBe("12000.00");
  });

  it("sem receita no período não há base: nenhum anexo é calculado", () => {
    const result = calculateSimplesPreview("2026-09", []);

    expect(result.status).toBe("no_base");
    expect(result.rbt12).toBe("0.00");
    expect(result.annexes).toEqual([]);
    expect(result.message).toMatch(/não há base/i);
  });

  it("RBT12 acima do teto do Simples não tem faixa: não calcula", () => {
    const result = calculateSimplesPreview("2026-09", revenues(Array(11).fill(400_001)));

    expect(result.status).toBe("above_limit");
    expect(result.annexes).toEqual([]);
    expect(result.message).toMatch(/4\.800\.000/);
  });
});
