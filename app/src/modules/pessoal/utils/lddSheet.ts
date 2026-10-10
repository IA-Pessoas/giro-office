import type { PessoalLdd } from "../types/tracking";
import { toCents } from "./lddImportPreview.ts";

/**
 * Ficha LDD do cliente, como `pessoal/pages/clientes/ldd.php`: débitos previdenciários e PGFN em
 * blocos separados, com subtotal de cada um e total geral. Os registros migrados do legado trazem
 * o tipo numérico (1 previdenciário, 0 PGFN); o cadastro manual e o importador usam o nome.
 * Como na ficha antiga, os outros tipos acompanhados (FGTS, IRRF, ISS) ficam fora dela e do total.
 */
const PREVIDENCIARIO_TYPES = ["INSS", "1"];
const PGFN_TYPES = ["PGFN", "0"];

export interface LddSheetSection {
  rows: PessoalLdd[];
  subtotal: number;
}

export interface LddSheet {
  previdenciario: LddSheetSection;
  pgfn: LddSheetSection;
  /** Quantos LDD de outros tipos ficaram fora da ficha. */
  excluded: number;
  total: number;
}

function sheetSection(ldd: PessoalLdd[], types: string[]): LddSheetSection {
  const rows = ldd
    .filter((row) => types.includes(row.type.trim().toUpperCase()))
    // Vencimento mais recente primeiro; sem vencimento no fim.
    .sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""));
  const cents = rows.reduce((sum, row) => sum + toCents(row.balance_amount ?? 0), 0);

  return { rows, subtotal: cents / 100 };
}

export function buildLddSheet(ldd: PessoalLdd[]): LddSheet {
  const previdenciario = sheetSection(ldd, PREVIDENCIARIO_TYPES);
  const pgfn = sheetSection(ldd, PGFN_TYPES);

  return {
    previdenciario,
    pgfn,
    excluded: ldd.length - previdenciario.rows.length - pgfn.rows.length,
    total: (toCents(previdenciario.subtotal) + toCents(pgfn.subtotal)) / 100,
  };
}
