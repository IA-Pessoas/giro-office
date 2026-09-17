import { z } from "zod";

export const markRhNotificationReadBodySchema = z
  .object({
    id: z.string().uuid().optional(),
    request_id: z.string().uuid().optional(),
    all: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Boolean(body.id || body.request_id || body.all), {
    message: "Informe id, request_id ou all para marcar notificações como lidas.",
  });
