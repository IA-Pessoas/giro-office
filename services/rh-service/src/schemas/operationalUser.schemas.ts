import { ACTIVE_MODULE_KEYS } from "@workspace/shared/auth";
import { z } from "zod";

export const operationalUserListQuerySchema = z
  .object({
    department_id: z.string().uuid("department_id inválido.").optional(),
    department_name: z.string().trim().min(1, "department_name obrigatório.").optional(),
    module: z
      .enum(ACTIVE_MODULE_KEYS, { errorMap: () => ({ message: "module inválido." }) })
      .optional(),
  })
  .strict();

export type OperationalUserListQuery = z.infer<typeof operationalUserListQuerySchema>;
