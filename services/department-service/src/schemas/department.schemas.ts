import { z } from "zod";

export const listDepartmentsQuerySchema = z
  .object({
    status: z.enum(["Todos", "Ativo", "Inativo"]).optional(),
  })
  .strict();

export const departmentDetailQuerySchema = z
  .object({
    dep_id: z.string().min(1, "dep_id é obrigatório."),
  })
  .strict();

export const createDepartmentBodySchema = z
  .object({
    name: z.string().min(1, "name é obrigatório."),
    color: z.string().min(1, "color é obrigatório."),
    solution: z.boolean().optional(),
  })
  .strict();

export const updateDepartmentBodySchema = z
  .object({
    dep_id: z.string().min(1, "dep_id é obrigatório."),
    name: z.string().min(1).optional(),
    color: z.string().min(1).optional(),
    status: z.enum(["Ativo", "Inativo"]).optional(),
    solution: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined ||
      data.color !== undefined ||
      data.status !== undefined ||
      data.solution !== undefined,
    {
      message: "Informe ao menos um campo para atualizar (name, color, status ou solution).",
    },
  );
