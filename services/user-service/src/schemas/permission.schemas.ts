import { ACTIVE_MODULE_KEYS } from "@workspace/shared/auth";
import { z } from "zod";

export const permissionModuleValueSchema = z.number().int().min(0).max(3);

const ACTIVE_PERMISSION_MODULE_KEY_SET = new Set<string>(ACTIVE_MODULE_KEYS);

function containsInvalidPermissionModule(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => !ACTIVE_PERMISSION_MODULE_KEY_SET.has(key));
}

export const permissionUserIdParamsSchema = z.object({
  userId: z.string().trim().min(1, "userId é obrigatório."),
});

export const permissionQuerySchema = z
  .object({
    modulo: z
      .string()
      .trim()
      .min(1)
      .optional()
      .refine((value) => value === undefined || ACTIVE_PERMISSION_MODULE_KEY_SET.has(value), {
        message: "Módulo de permissão inválido ou aposentado.",
      }),
  })
  .strict();

export const updatePermissionBodySchema = z
  .record(permissionModuleValueSchema)
  .refine((value) => Object.keys(value).length > 0, {
    message: "Body deve conter ao menos um módulo para atualizar.",
  })
  .refine((value) => !containsInvalidPermissionModule(value), {
    message: "Módulo de permissão inválido ou aposentado.",
  });

export const modulesSchema = z
  .record(permissionModuleValueSchema)
  .refine((value) => !containsInvalidPermissionModule(value), {
    message: "Módulo de permissão inválido ou aposentado.",
  });
