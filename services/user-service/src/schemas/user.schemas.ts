import { z } from "zod";

const userTypeSchema = z.enum(["admin", "owner", "user"]);

const modulesSchema = z.record(z.union([z.number().int(), z.null()]));

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
    login: z.string().trim().min(1, "login e obrigatorio."),
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
    if ((body.type !== undefined || body.modules !== undefined) && !body.organization_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "organization_id e obrigatorio quando type ou modules forem enviados.",
      });
    }

    if (body.first_owner_flag === true && body.type !== "owner") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "first_owner_flag so pode ser true quando type for owner.",
      });
    }
  });

export const updateUserBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    login: z.string().trim().min(1).optional(),
    password: z.string().min(1).optional(),
    department_id: z.string().trim().min(1).optional(),
    permission: z.number().int().optional(),
    status: z.string().trim().min(1).optional(),
    photo_url: z.union([z.string().trim().min(1), z.null()]).optional(),
    organization_id: z.union([z.string().trim().min(1), z.null()]).optional(),
    type: z.union([userTypeSchema, z.null()]).optional(),
    first_owner_flag: z.boolean().optional(),
    modules: modulesSchema.optional(),
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
