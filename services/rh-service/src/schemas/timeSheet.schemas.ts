import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const createTimeSheetBodySchema = z
  .object({
    user_id: z.string().uuid({ message: "user_id inválido." }),
    start_time: zIsoDate("start_time"),
    end_time: zIsoDate("end_time"),
  })
  .strict()
  .refine((data) => data.start_time.getTime() < data.end_time.getTime(), {
    message: "end_time deve ser posterior a start_time.",
    path: ["end_time"],
  });

export const listTimeSheetsQuerySchema = z
  .object({
    target_user_id: z
      .union([z.string().uuid({ message: "target_user_id inválido." }), z.literal("")])
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
  })
  .strict();

export const signTimeSheetBodySchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
    signature: zNonEmptyText("signature"),
  })
  .strict();
