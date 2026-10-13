import { z } from "zod";

export const taskCronogramaQuerySchema = z
  .object({ client_id: z.string().uuid({ message: "client_id inválido." }) })
  .strict();
