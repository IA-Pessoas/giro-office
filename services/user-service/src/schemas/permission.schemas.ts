import { z } from "zod";

export const permissionModuleValueSchema = z.union([
  z.null(),
  z.coerce.number().int().min(0).max(3),
]);

export const permissionUserIdParamsSchema = z.object({
  userId: z.string().trim().min(1, "userId e obrigatorio."),
});

export const permissionQuerySchema = z
  .object({
    modulo: z.string().trim().min(1).optional(),
  })
  .strict();

export const updatePermissionBodySchema = z
  .record(permissionModuleValueSchema)
  .refine((value) => Object.keys(value).length > 0, {
    message: "Body deve conter ao menos um modulo para atualizar.",
  });
