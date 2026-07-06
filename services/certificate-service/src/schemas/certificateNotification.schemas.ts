import { z } from "zod";

import { paginationQueryFields } from "./pagination.schemas.js";

export const certificateNotificationListQuerySchema = z.object(paginationQueryFields).strict();

export const certificateNotificationRunBodySchema = z.object({}).strict();

export type CertificateNotificationListQuery = z.infer<
  typeof certificateNotificationListQuerySchema
>;
export type CertificateNotificationRunBody = z.infer<typeof certificateNotificationRunBodySchema>;
