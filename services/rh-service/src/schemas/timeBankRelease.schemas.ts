import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const createTimeBankReleaseBodySchema = z
  .object({
    user_id: z.string().uuid({ message: "user_id inválido." }),
    date: zIsoDate("date"),
    minutes: z.number().int({ message: "minutes deve ser um número inteiro." }),
    reason: zNonEmptyText("reason"),
  })
  .strict();

export const approveTimeBankReleaseBodySchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();
