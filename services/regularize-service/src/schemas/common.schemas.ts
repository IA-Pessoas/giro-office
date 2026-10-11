import { z } from "zod";

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  throw new Error("Booleano inválido.");
}

// Dia AAAA-MM-DD que existe no calendário: "2024-02-31" não pode rolar para março em silêncio.
export function isCalendarDay(day: string): boolean {
  const date = new Date(day);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

export const idQuerySchema = z
  .object({
    id: z.string().uuid("id inválido."),
  })
  .strict();

export const booleanQuerySchema = z.union([z.boolean(), z.string()]).transform((value, ctx) => {
  try {
    return parseBoolean(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Valor booleano inválido.",
    });
    return z.NEVER;
  }
});
