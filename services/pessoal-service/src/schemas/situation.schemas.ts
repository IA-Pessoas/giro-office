import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const situationStatusSchema = z.enum(["Em andamento", "Finalizado"], {
  message: "status inválido.",
});

export const situationIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

export const listSituationQuerySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
  })
  .strict();

export const createSituationBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    title: zNonEmptyText("title"),
    description: zNonEmptyText("description"),
  })
  .strict();

export const updateSituationBodySchema = z
  .object({
    status: situationStatusSchema.optional(),
    title: zNonEmptyText("title").optional(),
    description: zNonEmptyText("description").optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type CreateSituationBody = z.infer<typeof createSituationBodySchema>;
export type UpdateSituationBody = z.infer<typeof updateSituationBodySchema>;
export type ListSituationQuery = z.infer<typeof listSituationQuerySchema>;
