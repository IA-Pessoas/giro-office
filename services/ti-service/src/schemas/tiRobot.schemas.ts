import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { paginationQuerySchema } from "./pagination.schemas.js";

const ROBOT_NAME_REQUIRED_MESSAGE = "Informe o nome do robô.";
const ROBOT_TYPE_REQUIRED_MESSAGE = "Selecione o tipo do robô.";
const ROBOT_TYPE_INVALID_MESSAGE = "Tipo de robô inválido.";

export const tiRobotTypeSchema = z.enum(
  ["Backup", "Relatorio", "Integracao", "Manutencao", "Monitoramento"],
  {
    errorMap: (issue) => ({
      message:
        issue.code === z.ZodIssueCode.invalid_type && issue.received === "undefined"
          ? ROBOT_TYPE_REQUIRED_MESSAGE
          : ROBOT_TYPE_INVALID_MESSAGE,
    }),
  },
);

const requiredTiRobotNameSchema = z
  .string({
    required_error: ROBOT_NAME_REQUIRED_MESSAGE,
    invalid_type_error: ROBOT_NAME_REQUIRED_MESSAGE,
  })
  .trim()
  .min(1, { message: ROBOT_NAME_REQUIRED_MESSAGE });

export const tiRobotStatusSchema = z.enum(["active", "inactive", "running", "failed"]);

export const tiRobotRunStatusSchema = z.enum(["success", "failed", "running", "cancelled"]);

export const tiRobotIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Robo de TI invalido." }),
  })
  .strict();

export const listTiRobotsQuerySchema = paginationQuerySchema
  .merge(
    z.object({
      type: tiRobotTypeSchema.optional(),
      status: tiRobotStatusSchema.optional(),
      active: z
        .enum(["true", "false"])
        .optional()
        .transform((value) => (value === undefined ? undefined : value === "true")),
    }),
  )
  .strict();

export const createTiRobotBodySchema = z
  .object({
    name: requiredTiRobotNameSchema,
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

export const listTiRobotRunsQuerySchema = paginationQuerySchema
  .merge(
    z.object({
      status: tiRobotRunStatusSchema.optional(),
    }),
  )
  .strict();

export type CreateTiRobotBody = z.infer<typeof createTiRobotBodySchema>;
export type UpdateTiRobotBody = z.infer<typeof updateTiRobotBodySchema>;
export type ListTiRobotsQuery = z.infer<typeof listTiRobotsQuerySchema>;
export type CreateTiRobotRunBody = z.infer<typeof createTiRobotRunBodySchema>;
export type ListTiRobotRunsQuery = z.infer<typeof listTiRobotRunsQuerySchema>;
