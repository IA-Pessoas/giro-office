import { z } from "zod";

import { paginationQuerySchema } from "./pagination.schemas.js";

const nonEmptyText = (field: string) =>
  z
    .string()
    .trim()
    .min(1, { message: `${field} é obrigatório.` });

const optionalResponsavelId = z
  .string()
  .uuid({ message: "responsavel_id inválido." })
  .optional()
  .nullable();

const panoramaCreateBooleanFields = {
  cnd_municipal: z.boolean().optional().default(false),
  cnd_state: z.boolean().optional().default(false),
  cnd_federal: z.boolean().optional().default(false),
  cnd_fgts: z.boolean().optional().default(false),
  cnd_labor: z.boolean().optional().default(false),
  protests: z.boolean().optional().default(false),
  state_tax_situation: z.boolean().optional().default(false),
  federal_tax_situation: z.boolean().optional().default(false),
} as const;

const panoramaPatchBooleanFields = {
  cnd_municipal: z.boolean().optional(),
  cnd_state: z.boolean().optional(),
  cnd_federal: z.boolean().optional(),
  cnd_fgts: z.boolean().optional(),
  cnd_labor: z.boolean().optional(),
  protests: z.boolean().optional(),
  state_tax_situation: z.boolean().optional(),
  federal_tax_situation: z.boolean().optional(),
} as const;

export const panoramaIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

export const panoramaCompetenceParamsSchema = z
  .object({
    competence: nonEmptyText("competence"),
  })
  .strict();

export const listPanoramasQuerySchema = paginationQuerySchema
  .extend({
    competence: nonEmptyText("competence").optional(),
    client_id: z.string().uuid({ message: "client_id inválido." }).optional(),
    responsavel_id: z.string().uuid({ message: "responsavel_id inválido." }).optional(),
  })
  .strict();

export const createPanoramaBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    competence: nonEmptyText("competence"),
    ...panoramaCreateBooleanFields,
    responsavel_id: optionalResponsavelId,
  })
  .strict();

export const patchPanoramaBodySchema = z
  .object({
    ...panoramaPatchBooleanFields,
    responsavel_id: optionalResponsavelId,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export const generatePanoramasBodySchema = z.object({}).strict();

export type PanoramaIdParams = z.infer<typeof panoramaIdParamsSchema>;
export type PanoramaCompetenceParams = z.infer<typeof panoramaCompetenceParamsSchema>;
export type ListPanoramasQuery = z.infer<typeof listPanoramasQuerySchema>;
export type CreatePanoramaBody = z.infer<typeof createPanoramaBodySchema>;
export type PatchPanoramaBody = z.infer<typeof patchPanoramaBodySchema>;
