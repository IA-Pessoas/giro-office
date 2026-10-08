import { z } from "zod";

export const platformOrganizationUsersParamsSchema = z
  .object({
    organizationId: z.string().trim().min(1, "organizationId é obrigatório."),
  })
  .strict();

export const platformOrganizationUserParamsSchema = platformOrganizationUsersParamsSchema
  .extend({ userId: z.string().trim().min(1, "userId é obrigatório.") })
  .strict();

export const platformSuperAdminParamsSchema = z
  .object({ superAdminId: z.string().uuid({ message: "superAdminId inválido." }) })
  .strict();

export const updatePlatformSuperAdminImpersonationPermissionSchema = z
  .object({ can_impersonate: z.boolean() })
  .strict();

export const listPlatformUsersQuerySchema = z
  .object({
    skip: z.coerce.number().int().min(0).max(10_000).optional().default(0),
    take: z.coerce.number().int().min(1).max(100).optional().default(20),
    search: z.string().trim().max(100).optional().default(""),
  })
  .strict();

export const transferPlatformOwnershipBodySchema = z
  .object({
    currentOwnerId: z.string().trim().min(1, "currentOwnerId é obrigatório."),
    successorUserId: z.string().trim().min(1, "successorUserId é obrigatório."),
    previousOwnerAction: z.enum(["demote", "deactivate"]),
    justification: z.string().trim().min(1, "justification é obrigatória.").max(500),
  })
  .strict()
  .refine((input) => input.currentOwnerId !== input.successorUserId, {
    message: "O sucessor deve ser diferente do owner atual.",
    path: ["successorUserId"],
  });

export const updatePlatformUserBodySchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    login: z.string().trim().toLowerCase().min(1).max(255).optional(),
    department_id: z.string().trim().min(1).optional(),
    permission: z.number().int().min(0).max(3).optional(),
    status: z.enum(["active", "inactive"]).optional(),
    expected_version: z.number().int().min(1),
  })
  .strict()
  .refine(
    (input) =>
      input.name !== undefined ||
      input.login !== undefined ||
      input.department_id !== undefined ||
      input.permission !== undefined ||
      input.status !== undefined,
    { message: "Informe ao menos um campo para atualizar." },
  );
