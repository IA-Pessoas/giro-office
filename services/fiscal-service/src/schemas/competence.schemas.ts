import { z } from "zod";

/** Competência mensal no formato AAAA-MM. */
export const competenceSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida.");

/** AAAA-MM → data do dia 1 (coluna DATE das competências). */
export function competenceDate(competence: string): Date {
  return new Date(`${competence}-01T00:00:00.000Z`);
}

/** Data de competência → AAAA-MM. */
export function competenceKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}
