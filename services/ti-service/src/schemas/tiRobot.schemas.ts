import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const tiRobotTypeSchema = z.enum([
  "Backup",
  "Relatorio",
  "Integracao",
  "Manutencao",
  "Monitoramento",
]);

export const tiRobotStatusSchema = z.enum(["active", "inactive", "running", "failed"]);

export const tiRobotRunStatusSchema = z.enum(["success", "failed", "running", "cancelled"]);

export const tiRobotIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Robo de TI invalido." }),
  })
  .strict();

export const listTiRobotsQuerySchema = z
  .object({
    type: tiRobotTypeSchema.optional(),
    status: tiRobotStatusSchema.optional(),
    active: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "true")),
  })
  .strict();

export const createTiRobotBodySchema = z
  .object({
    name: zNonEmptyText("name"),
    description: z.string().optional(),
    type: tiRobotTypeSchema,
    schedule: z.string().optional(),
    status: tiRobotStatusSchema.default("active"),
    active: z.boolean().optional().default(true),
  })
  .strict();

export const updateTiRobotBodySchema = z
  .object({
    name: zNonEmptyText("name").optional(),
    description: z.string().nullable().optional(),
    type: tiRobotTypeSchema.optional(),
    schedule: z.string().nullable().optional(),
    status: tiRobotStatusSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export const createTiRobotRunBodySchema = z
  .object({
    status: tiRobotRunStatusSchema,
    finished_at: zIsoDate("finished_at").optional(),
    message: z.string().optional(),
    metadata_json: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const listTiRobotRunsQuerySchema = z
  .object({
    status: tiRobotRunStatusSchema.optional(),
  })
  .strict();

export type CreateTiRobotBody = z.infer<typeof createTiRobotBodySchema>;
export type UpdateTiRobotBody = z.infer<typeof updateTiRobotBodySchema>;
export type ListTiRobotsQuery = z.infer<typeof listTiRobotsQuerySchema>;
export type CreateTiRobotRunBody = z.infer<typeof createTiRobotRunBodySchema>;
export type ListTiRobotRunsQuery = z.infer<typeof listTiRobotRunsQuerySchema>;
