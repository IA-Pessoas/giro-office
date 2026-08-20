import { z } from "zod";

export const reportingAccessContextBodySchema = z
  .object({
    userId: z.string().uuid({ message: "userId inválido." }),
    organizationId: z.string().uuid({ message: "organizationId inválido." }),
  })
  .strict();
