import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { PESSOAL_GROUP_POLICIES } from "../services/pessoalGroupPolicy.js";

export const groupIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

export const createGroupBodySchema = z
  .object({
    name: zNonEmptyText("name"),
    policy: z.enum(PESSOAL_GROUP_POLICIES).optional(),
  })
  .strict();

export const updateGroupBodySchema = z
  .object({
    name: zNonEmptyText("name").optional(),
    policy: z.enum(PESSOAL_GROUP_POLICIES).optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.policy !== undefined, {
    message: "Informe name ou policy para atualizar.",
  });

export type CreateGroupBody = z.infer<typeof createGroupBodySchema>;
export type UpdateGroupBody = z.infer<typeof updateGroupBodySchema>;
