import { z } from "zod";

export const certificateNotificationRunBodySchema = z.object({}).strict();

export type CertificateNotificationRunBody = z.infer<typeof certificateNotificationRunBodySchema>;
