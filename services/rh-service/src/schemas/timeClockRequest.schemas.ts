import { z } from "zod";
import { zIsoDate, zNonEmptyText } from "@workspace/shared";

export const createAdjustmentRequestBodySchema = z
  .object({
    point_id: zNonEmptyText("point_id"),
    clock_in: zIsoDate("clock_in"),
    lunch_out: zIsoDate("lunch_out"),
    lunch_in: zIsoDate("lunch_in"),
    clock_out: zIsoDate("clock_out"),
    justification: zNonEmptyText("justification"),
    attachment: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((v): string | undefined => {
        if (v === undefined || v === null) {
          return undefined;
        }
        return String(v);
      }),
  })
  .strict();

export const approveAdjustmentBodySchema = z
  .object({
    request_id: zNonEmptyText("request_id"),
    obs_approver: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((v): string | null | undefined => {
        if (v === undefined) {
          return undefined;
        }
        if (v === null) {
          return null;
        }
        return String(v);
      }),
  })
  .strict();
