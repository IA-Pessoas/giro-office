import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

const uuid = z.string().uuid("id inválido.");

export const employeeMeetingMinuteQuerySchema = z.object({ user_id: uuid.optional() }).strict();

export const createEmployeeMeetingMinuteBodySchema = z
  .object({
    target_user_id: uuid.optional(),
    meeting_date: zIsoDate("meeting_date"),
    agenda: zNonEmptyText("agenda").max(500),
    participants: z.string().trim().max(5000).optional().default(""),
    report: z.string().trim().max(20000).optional().default(""),
  })
  .strict();

export const employeeMeetingMinuteIdParamSchema = z.object({ id: uuid }).strict();

export const updateEmployeeMeetingMinuteBodySchema = z
  .object({
    meeting_date: zIsoDate("meeting_date").optional(),
    agenda: zNonEmptyText("agenda").max(500).optional(),
    participants: z.string().trim().max(5000).optional(),
    report: zNonEmptyText("report").max(20000),
  })
  .strict();

export type CreateEmployeeMeetingMinuteInput = z.infer<
  typeof createEmployeeMeetingMinuteBodySchema
>;
export type UpdateEmployeeMeetingMinuteInput = z.infer<
  typeof updateEmployeeMeetingMinuteBodySchema
>;
