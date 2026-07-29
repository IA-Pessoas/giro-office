import { z } from "zod";

export const switchOrganizationBodySchema = z
  .object({
    organization_id: z.string().uuid("organization_id inválido."),
  })
  .strict();
