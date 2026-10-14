import { z } from "zod";

export const tiSpecificAccessUserIdParamsSchema = z
  .object({
    userId: z.string().uuid({ message: "Usuário inválido." }),
  })
  .strict();

export const updateTiSpecificAccessBodySchema = z
  .object({
    task_completion: z.boolean({ message: "Informe se o usuário pode concluir tarefas." }),
  })
  .strict();

export type UpdateTiSpecificAccessBody = z.infer<typeof updateTiSpecificAccessBodySchema>;
