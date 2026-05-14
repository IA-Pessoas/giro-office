import { z } from "zod";

import { idQuerySchema } from "./common.schema.js";

export const createMunicipalTaxesBodySchema = z
  .object({
    client_id: z.string().uuid("client_id invalido."),
    year: z.coerce.number().int(),
    tff_is_applicable: z.boolean(),
    tff_amount: z.coerce.number(),
    tff_notes: z.string().nullable().optional(),
    tff_analysis_is_done: z.boolean(),
    tff_analysis_notes: z.string().nullable().optional(),
    tff_sent_date: z.coerce.date().optional(),
    tff_due_date: z.coerce.date().optional(),
    tlp_is_applicable: z.boolean(),
    tlp_amount: z.coerce.number(),
    tlp_notes: z.string().nullable().optional(),
    tlp_is_sent: z.string().min(1, "tlp_is_sent obrigatorio."),
    tlp_sent_date: z.coerce.date().optional(),
    tlp_due_date: z.coerce.date().optional(),
    tlp_not_email: z.boolean(),
    tll_is_applicable: z.boolean(),
    tll_amount: z.coerce.number(),
    tll_notes: z.string().nullable().optional(),
    tll_is_sent: z.string().min(1, "tll_is_sent obrigatorio."),
    tll_sent_date: z.coerce.date().optional(),
    tll_due_date: z.coerce.date().optional(),
    tll_analysis_is_done: z.boolean(),
    tll_analysis_notes: z.string().nullable().optional(),
  })
  .strict();

export const updateMunicipalTaxesBodySchema = createMunicipalTaxesBodySchema
  .extend({
    id: z.string().uuid("id invalido."),
  })
  .strict();

export const municipalTaxesDetailQuerySchema = idQuerySchema;

export const listMunicipalTaxesQuerySchema = z
  .object({
    year: z.coerce.number().int(),
  })
  .strict();

export type CreateMunicipalTaxesBody = z.infer<typeof createMunicipalTaxesBodySchema>;
export type UpdateMunicipalTaxesBody = z.infer<typeof updateMunicipalTaxesBodySchema>;
