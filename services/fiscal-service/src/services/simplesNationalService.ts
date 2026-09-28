// Cálculo da alíquota de ISS/ICMS do Simples Nacional (LC 123/2006, Anexos I a V), portado de
// Fiscal::meses/aliquota/porcentAnexo do sistema legado (classes/Fiscal.php). Os tetos, as
// alíquotas nominais, as parcelas a deduzir e a repartição do ISS/ICMS são os mesmos da tabela
// legada; a 6ª faixa reparte 0% porque ali ISS e ICMS são recolhidos fora do Simples.
// Exceção: no Anexo II o legado repetia as parcelas a deduzir do Anexo III (9.360, 17.640...);
// aqui valem as da LC 123 (5.940, 13.860, 22.500, 85.500, 720.000).

export type SimplesAnnex = "I" | "II" | "III" | "IV" | "V";
export type SimplesTax = "ICMS" | "ISS";

interface AnnexTable {
  tax: SimplesTax;
  /** [alíquota nominal %, parcela a deduzir R$, repartição do ISS/ICMS %] por faixa. */
  brackets: ReadonlyArray<readonly [number, number, number]>;
}

const BRACKET_CEILINGS = [180_000, 360_000, 720_000, 1_800_000, 3_600_000, 4_800_000] as const;
export const SIMPLES_RBT12_LIMIT = BRACKET_CEILINGS[BRACKET_CEILINGS.length - 1];

export const SIMPLES_ANNEXES: Readonly<Record<SimplesAnnex, AnnexTable>> = {
  I: {
    tax: "ICMS",
    brackets: [
      [4, 0, 34],
      [7.3, 5_940, 34],
      [9.5, 13_860, 33.5],
      [10.7, 22_500, 33.5],
      [14.3, 87_300, 33.5],
      [19, 378_000, 0],
    ],
  },
  II: {
    tax: "ICMS",
    brackets: [
      [4.5, 0, 32],
      [7.8, 5_940, 32],
      [10, 13_860, 32],
      [11.2, 22_500, 32],
      [14.7, 85_500, 32],
      [30, 720_000, 0],
    ],
  },
  III: {
    tax: "ISS",
    brackets: [
      [6, 0, 33.5],
      [11.2, 9_360, 32],
      [13.5, 17_640, 32.5],
      [16, 35_640, 32.5],
      [21, 125_640, 33.5],
      [33, 648_000, 0],
    ],
  },
  IV: {
    tax: "ISS",
    brackets: [
      [4.5, 0, 44.5],
      [9, 8_100, 40],
      [10.2, 12_420, 40],
      [14, 39_780, 40],
      [22, 183_780, 40],
      [33, 828_000, 0],
    ],
  },
  V: {
    tax: "ISS",
    brackets: [
      [15.5, 0, 14],
      [18, 4_500, 17],
      [19.5, 9_900, 19],
      [20.5, 17_100, 21],
      [23, 62_100, 23.5],
      [30.5, 540_000, 0],
    ],
  },
};

export interface SimplesAnnexRate {
  annex: SimplesAnnex;
  tax: SimplesTax;
  bracket: number;
  nominal_rate: string;
  deduction: string;
  effective_rate: string;
  tax_share: string;
  /** Percentual do ISS/ICMS sem os limites de emissão (#1562). */
  rate: string;
}

/** ok: calculado; no_base: RBT12 zero; above_limit: RBT12 acima do teto do Simples. */
export type SimplesPreviewStatus = "ok" | "no_base" | "above_limit";

export interface SimplesPreview {
  competence: string;
  status: SimplesPreviewStatus;
  message: string | null;
  months: Array<{ competence: string; amount: string; registered: boolean }>;
  estimated_month: { competence: string; amount: string };
  rbt12: string;
  annexes: SimplesAnnexRate[];
}

// ponytail: arredondamento em ponto flutuante, como o legado; decimal exato se a conferência
// com a Receita apontar diferença na 4ª casa.
function fixed(value: number, digits: number): string {
  const scale = 10 ** digits;
  return (Math.round(value * scale + 1e-6) / scale).toFixed(digits);
}

/** Os 11 meses imediatamente anteriores à competência, do mais recente ao mais antigo. */
export function previousCompetences(competence: string): string[] {
  const [year, month] = competence.split("-").map(Number);
  return Array.from({ length: 11 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 2 - index, 1));
    return date.toISOString().slice(0, 7);
  });
}

/** Faixa (1 a 6) do RBT12, ou null acima do teto do Simples. */
export function simplesBracket(rbt12: number): number | null {
  const index = BRACKET_CEILINGS.findIndex((ceiling) => rbt12 <= ceiling);
  return index === -1 ? null : index + 1;
}

export function calculateSimplesPreview(
  competence: string,
  revenues: ReadonlyArray<{ competence: string; amount: string }>,
): SimplesPreview {
  const byCompetence = new Map(revenues.map((item) => [item.competence, Number(item.amount)]));
  const months = previousCompetences(competence).map((month) => ({
    competence: month,
    value: byCompetence.get(month) ?? 0,
    registered: byCompetence.has(month),
  }));
  const sum = months.reduce((total, month) => total + month.value, 0);
  const average = sum / months.length;
  const rbt12 = sum + average;
  const bracket = simplesBracket(rbt12);
  const status: SimplesPreviewStatus =
    rbt12 <= 0 ? "no_base" : bracket === null ? "above_limit" : "ok";

  return {
    competence,
    status,
    message:
      status === "no_base"
        ? "Não há base para calcular: nenhuma receita nos 11 meses anteriores à competência."
        : status === "above_limit"
          ? "RBT12 acima do teto do Simples Nacional (R$ 4.800.000,00): não há faixa para calcular."
          : null,
    months: months.map((month) => ({
      competence: month.competence,
      amount: fixed(month.value, 2),
      registered: month.registered,
    })),
    estimated_month: { competence, amount: fixed(average, 2) },
    rbt12: fixed(rbt12, 2),
    annexes:
      status === "ok" && bracket !== null
        ? (Object.keys(SIMPLES_ANNEXES) as SimplesAnnex[]).map((annex) => {
            const { tax, brackets } = SIMPLES_ANNEXES[annex];
            const [nominal, deduction, share] = brackets[bracket - 1];
            const effective = ((rbt12 * nominal) / 100 - deduction) / rbt12;
            return {
              annex,
              tax,
              bracket,
              nominal_rate: fixed(nominal, 2),
              deduction: fixed(deduction, 2),
              effective_rate: fixed(effective * 100, 4),
              tax_share: fixed(share, 2),
              rate: fixed(effective * share, 4),
            };
          })
        : [],
  };
}
