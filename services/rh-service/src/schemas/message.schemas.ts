import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const rhMessageTypeSchema = z.enum(["Message", "Solution", "Rejection", "Acceptance"]);

export const createMessageBodySchema = z
  .object({
    request_id: zNonEmptyText("request_id"),
    message: zNonEmptyText("message"),
    type: rhMessageTypeSchema,
    attachment: z.string().optional(),
  })
  .strict();

const requestIdFromQuery = z.preprocess(
  (val) => (Array.isArray(val) ? val[0] : val),
  zNonEmptyText("requestId"),
);

export const listMessagesQuerySchema = z
  .object({
    requestId: requestIdFromQuery,
  })
  .strict();
