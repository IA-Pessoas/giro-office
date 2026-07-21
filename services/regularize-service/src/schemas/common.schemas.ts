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
  throw new Error("Booleano invalido.");
}

export const idQuerySchema = z
  .object({
    id: z.string().uuid("id invalido."),
  })
  .strict();

export const booleanQuerySchema = z.union([z.boolean(), z.string()]).transform((value, ctx) => {
  try {
    return parseBoolean(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Valor booleano invalido.",
    });
    return z.NEVER;
  }
});
