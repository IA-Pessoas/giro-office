import { z } from "zod";

const moduleValueSchema = z.union([z.number().int(), z.null()]);

export const permissionUserIdParamsSchema = z.object({
  userId: z.string().trim().min(1, "userId e obrigatorio."),
});

export const permissionQuerySchema = z
  .object({
    modulo: z.string().trim().min(1).optional(),
  })
  .strict();

export const updatePermissionBodySchema = z
  .record(moduleValueSchema)
  .refine((value) => Object.keys(value).length > 0, {
    message: "Body deve conter ao menos um modulo para atualizar.",
  });
