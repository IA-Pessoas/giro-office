import { z } from "zod";

/** Competência mensal no formato AAAA-MM. */
export const competenceSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida.");
