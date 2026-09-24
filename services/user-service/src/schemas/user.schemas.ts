import { z } from "zod";

import { modulesSchema } from "./permission.schemas.js";

const userTypeSchema = z.enum(["admin", "owner", "user"]);

export const listUsersQuerySchema = z
  .object({
    skip: z.coerce.number().int().min(0).optional().default(0),
    take: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .strict();

export const userIdParamsSchema = z.object({
  id: z.string().trim().min(1, "id e obrigatorio."),
});

export const createUserBodySchema = z
  .object({
    name: z.string().trim().min(1, "name e obrigatorio."),
    login: z.string().trim().toLowerCase().min(1, "login e obrigatorio."),
    password: z.string().min(1, "password e obrigatorio."),
    department_id: z.string().trim().min(1, "department_id e obrigatorio."),
    permission: z.number().int(),
    status: z.string().trim().min(1).optional(),
    photo_url: z.string().trim().min(1).optional(),
    invited_by: z.string().trim().min(1).optional(),
    organization_id: z.string().trim().min(1).optional(),
    type: userTypeSchema.optional(),
    first_owner_flag: z.boolean().optional(),
    modules: modulesSchema.optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    const hasMutableField = [
      "name",
      "login",
      "password",
      "department_id",
      "permission",
      "status",
      "photo_url",
      "organization_id",
      "type",
      "first_owner_flag",
      "modules",
    ].some((field) => field in body);

    if (!hasMutableField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe ao menos um campo para atualizar.",
      });
    }

    if (body.first_owner_flag === true && body.type !== "owner") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "first_owner_flag so pode ser true quando type for owner.",
      });
    }
  });

export const MIN_PASSWORD_LENGTH = 10;

/** Política da troca da própria senha (#1341); null quando a nova senha é aceita. */
export function ownPasswordPolicyError(
  currentPassword: string,
  nextPassword: string,
): string | null {
  if (nextPassword.length < MIN_PASSWORD_LENGTH) {
    return `A nova senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (nextPassword === currentPassword) return "A nova senha deve ser diferente da atual.";
  return null;
}

/** Link de redefinição (#1342): o token vem do e-mail. */
export const confirmPasswordResetBodySchema = z
  .object({
    token: z.string().trim().min(1, "token e obrigatorio.").max(256),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `A nova senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`)
      .max(255),
  })
  .strict();

export const updateUserBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    login: z.string().trim().toLowerCase().min(1).optional(),
    password: z.string().min(1).optional(),
    current_password: z.string().min(1).optional(),
    department_id: z.string().trim().min(1).optional(),
    permission: z.number().int().optional(),
    status: z.string().trim().min(1).optional(),
    photo_url: z.union([z.string().trim().min(1), z.null()]).optional(),
    organization_id: z.union([z.string().trim().min(1), z.null()]).optional(),
    type: z.union([userTypeSchema, z.null()]).optional(),
    first_owner_flag: z.boolean().optional(),
    modules: modulesSchema.optional(),
    expected_version: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.first_owner_flag === true && body.type !== "owner") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "first_owner_flag so pode ser true quando type for owner.",
      });
    }
  });
