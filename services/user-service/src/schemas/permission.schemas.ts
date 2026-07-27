import { z } from "zod";

export const permissionModuleValueSchema = z.union([
  z.null(),
  z.coerce.number().int().min(0).max(3),
]);

const RETIRED_PERMISSION_MODULE_KEY_SET = new Set(["atendimento", "pec", "wiki"]);

function containsRetiredPermissionModule(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => RETIRED_PERMISSION_MODULE_KEY_SET.has(key));
}

export const permissionUserIdParamsSchema = z.object({
  userId: z.string().trim().min(1, "userId e obrigatorio."),
});

export const permissionQuerySchema = z
  .object({
    modulo: z
      .string()
      .trim()
      .min(1)
      .optional()
      .refine((value) => value === undefined || !RETIRED_PERMISSION_MODULE_KEY_SET.has(value), {
        message: "Módulo de permissão aposentado.",
      }),
  })
  .strict();

export const updatePermissionBodySchema = z
  .record(permissionModuleValueSchema)
  .refine((value) => Object.keys(value).length > 0, {
    message: "Body deve conter ao menos um modulo para atualizar.",
  })
  .refine((value) => !containsRetiredPermissionModule(value), {
    message: "Módulo de permissão aposentado.",
  });

export const modulesSchema = z
  .record(permissionModuleValueSchema)
  .refine((value) => !containsRetiredPermissionModule(value), {
    message: "Módulo de permissão aposentado.",
  });
