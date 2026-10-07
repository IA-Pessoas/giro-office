import { z } from "zod";

const optionalText = z.string().trim().min(1).max(120).optional();
const optionalBoolean = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

export const clientCoringaQuerySchema = z
  .object({
    organization_id: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(200).optional(),
    regime: optionalText,
    dataEntrada: z.string().date().optional(),
    porte: optionalText,
    segmento: optionalText,
    status: optionalText,
    contabil: optionalBoolean,
    fiscal: optionalBoolean,
    pessoal: optionalBoolean,
    tecnologia: optionalBoolean,
    infoproduto: optionalBoolean,
    consultoria: optionalBoolean,
    licitacao: optionalBoolean,
  })
  .strict();
