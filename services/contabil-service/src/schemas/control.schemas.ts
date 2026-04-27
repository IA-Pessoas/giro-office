import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const createControlBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    competence: zNonEmptyText("competence"),
  })
  .strict();

export const updateControlFieldBodySchema = z
  .object({
    field: z.string().min(1, "Campo obrigatório."),
    value: z.union([z.boolean(), z.string()]),
  })
  .strict();

export const controlIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

export const detailControlQuerySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    competence: zNonEmptyText("competence"),
  })
  .strict();
