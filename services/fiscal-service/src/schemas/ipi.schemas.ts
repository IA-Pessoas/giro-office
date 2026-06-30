import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

const ipiIdSchema = z.string().uuid({ message: "ipi_id inválido." });

export const createIpiBodySchema = z
  .object({
    ncm: zNonEmptyText("ncm"),
    ex: z.string().optional(),
    description: z.string().optional(),
    aliquot: z.string().optional(),
  })
  .strict();

export const updateIpiBodySchema = z
  .object({
    ipi_id: ipiIdSchema,
    ncm: zNonEmptyText("ncm"),
    ex: z.string().optional(),
    description: z.string().optional(),
    aliquot: z.string().optional(),
  })
  .strict();

export const detailIpiQuerySchema = z
  .object({
    ipi_id: ipiIdSchema,
  })
  .strict();

export const listIpiQuerySchema = z
  .object({
    ipiCodes: z.preprocess(
      (value) => {
        if (Array.isArray(value)) return value;
        if (typeof value === "string") return value.split(",").filter(Boolean);
        return [];
      },
      z.array(z.string().min(1)).min(1, "ipiCodes é obrigatório."),
    ),
  })
  .strict();
