import { z } from "zod";

export const platformOrganizationUsersParamsSchema = z
  .object({
    organizationId: z.string().trim().min(1, "organizationId e obrigatorio."),
  })
  .strict();

export const listPlatformUsersQuerySchema = z
  .object({
    skip: z.coerce.number().int().min(0).optional().default(0),
    take: z.coerce.number().int().min(1).max(100).optional().default(20),
    search: z.string().trim().max(100).optional().default(""),
  })
  .strict();
