import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const taskAttachmentBodySchema = z.object({ task_id: zNonEmptyText("task_id") }).strict();

export const taskAttachmentQuerySchema = z
  .object({ task_id: zNonEmptyText("task_id"), attachment_id: zNonEmptyText("attachment_id") })
  .strict();

export const taskAttachmentListQuerySchema = z
  .object({ task_id: zNonEmptyText("task_id") })
  .strict();

export const taskAttachmentDeleteBodySchema = z
  .object({ task_id: zNonEmptyText("task_id"), attachment_id: zNonEmptyText("attachment_id") })
  .strict();
