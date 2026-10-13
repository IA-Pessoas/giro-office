import { z } from "zod";

import { paginationQuerySchema } from "./pagination.schemas.js";

export const tiAccessLogUserIdParamsSchema = z
  .object({
    userId: z.string().uuid({ message: "Usuário inválido." }),
  })
  .strict();

export const listTiAccessLogsQuerySchema = paginationQuerySchema;

export type ListTiAccessLogsQuery = z.infer<typeof listTiAccessLogsQuerySchema>;
