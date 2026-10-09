import { z } from "zod";

export const clientWholesaleParamsSchema = z
  .object({ client_id: z.string().uuid("Cliente inválido.") })
  .strict();

export const updateClientWholesaleBodySchema = z
  .object({
    is_wholesale: z.boolean({
      required_error: "Informe se o cliente é atacadista.",
      invalid_type_error: "Informe se o cliente é atacadista.",
    }),
  })
  .strict();
