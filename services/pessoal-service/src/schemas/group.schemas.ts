import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const groupIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id invalido." }),
  })
  .strict();

export const createGroupBodySchema = z
  .object({
    name: zNonEmptyText("name"),
  })
  .strict();

export const updateGroupBodySchema = createGroupBodySchema;

export type CreateGroupBody = z.infer<typeof createGroupBodySchema>;
export type UpdateGroupBody = z.infer<typeof updateGroupBodySchema>;
