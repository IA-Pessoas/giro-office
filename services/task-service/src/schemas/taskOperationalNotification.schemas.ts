import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const taskOperationalNotificationReadBodySchema = z
  .object({ notification_id: zNonEmptyText("notification_id") })
  .strict();
