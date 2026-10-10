import type { PessoalLdd } from "../types/tracking";

/**
 * Ficha LDD do cliente, como `pessoal/pages/clientes/ldd.php`: débitos previdenciários e PGFN em
 * blocos separados, com subtotal de cada um e total geral. Os registros migrados do legado trazem
 * o tipo numérico (1 previdenciário, 0 PGFN); o cadastro manual e o importador usam o nome.
 * Tipos que a ficha antiga não tinha (FGTS, IRRF, ISS) ficam num bloco próprio, para o total da
 * ficha bater com o que está cadastrado.
 */
const PREVIDENCIARIO_TYPES = new Set(["INSS", "1"]);
const PGFN_TYPES = new Set(["PGFN", "0"]);

export interface LddSheetSection {
  rows: PessoalLdd[];
  subtotal: number;
}

export interface LddSheet {
  previdenciario: LddSheetSection;
  pgfn: LddSheetSection;
  other: LddSheetSection;
  total: number;
}

const toCents = (value: number | null) => Math.round((value ?? 0) * 100);

function section(rows: PessoalLdd[]): LddSheetSection & { cents: number } {
  const cents = rows.reduce((sum, row) => sum + toCents(row.balance_amount), 0);
  return {
    // Vencimento mais recente primeiro; sem vencimento no fim.
    rows: [...rows].sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? "")),
    subtotal: cents / 100,
    cents,
  };
}

export function buildLddSheet(ldd: PessoalLdd[]): LddSheet {
  const kind = (row: PessoalLdd) => {
    const type = row.type.trim().toUpperCase();
    if (PREVIDENCIARIO_TYPES.has(type)) return "previdenciario";
    return PGFN_TYPES.has(type) ? "pgfn" : "other";
  };
  const of = (wanted: ReturnType<typeof kind>) => section(ldd.filter((row) => kind(row) === wanted));
  const [previdenciario, pgfn, other] = [of("previdenciario"), of("pgfn"), of("other")];
  const strip = ({ rows, subtotal }: LddSheetSection) => ({ rows, subtotal });

  return {
    previdenciario: strip(previdenciario),
    pgfn: strip(pgfn),
    other: strip(other),
    total: (previdenciario.cents + pgfn.cents + other.cents) / 100,
  };
}
