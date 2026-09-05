import { z } from "zod";

import { idQuerySchema } from "./common.schemas.js";

export const createPartnerBodySchema = z
  .object({
    pj_id: z.string().uuid("pj_id invalido."),
    pf_id: z.string().uuid("pf_id invalido."),
    part: z.coerce.number(),
    entry: z.coerce.date(),
    exit: z.coerce.date().optional(),
  })
  .strict();

export const updatePartnerBodySchema = createPartnerBodySchema
  .extend({
    id: z.string().uuid("id invalido."),
  })
  .strict();

export const partnerDetailQuerySchema = idQuerySchema;

export const partnerIdParamsSchema = z
  .object({
    id: z.string().uuid("id invalido."),
  })
  .strict();

export const listPartnersQuerySchema = z
  .object({
    type: z.enum(["pf", "pj"]),
    client_id: z.string().uuid("client_id invalido."),
  })
  .strict();

export type CreatePartnerBody = z.infer<typeof createPartnerBodySchema>;
export type UpdatePartnerBody = z.infer<typeof updatePartnerBodySchema>;
