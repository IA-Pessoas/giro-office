import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const createTimeSheetBodySchema = z
  .object({
    user_id: z.string().uuid({ message: "user_id invalido." }),
    start_time: zIsoDate("start_time").optional(),
    end_time: zIsoDate("end_time").optional(),
  })
  .strict()
  .refine((data) => data.start_time === undefined || data.end_time !== undefined, {
    message: "start_time e end_time devem ser informados juntos.",
    path: ["end_time"],
  })
  .refine((data) => data.end_time === undefined || data.start_time !== undefined, {
    message: "start_time e end_time devem ser informados juntos.",
    path: ["start_time"],
  })
  .refine(
    (data) =>
      data.start_time === undefined ||
      data.end_time === undefined ||
      data.start_time.getTime() < data.end_time.getTime(),
    {
      message: "end_time deve ser posterior a start_time.",
      path: ["end_time"],
    },
  );

export const rebuildTimeSheetBodySchema = z
  .object({
    id: z.string().uuid({ message: "id invalido." }),
  })
  .strict();

export const listTimeSheetsQuerySchema = z
  .object({
    target_user_id: z
      .union([z.string().uuid({ message: "target_user_id invalido." }), z.literal("")])
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
  })
  .strict();

export const timeSheetIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id invalido." }),
  })
  .strict();

export const signTimeSheetBodySchema = z
  .object({
    id: z.string().uuid({ message: "id invalido." }),
    signature: zNonEmptyText("signature").optional(),
  })
  .strict();

export const reopenTimeSheetBodySchema = z
  .object({
    id: z.string().uuid({ message: "id invalido." }),
    reason: zNonEmptyText("reason"),
  })
  .strict();
