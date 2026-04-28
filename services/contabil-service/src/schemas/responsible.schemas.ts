import { z } from "zod";

export const createResponsibleBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    person_responsible_id: z.string().uuid({ message: "person_responsible_id inválido." }).optional(),
    posted_by_id: z.string().uuid({ message: "posted_by_id inválido." }).optional(),
    customer_with_movement: z.boolean().optional(),
  })
  .strict();

export const updateResponsibleBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }).optional(),
    person_responsible_id: z
      .string()
      .uuid({ message: "person_responsible_id inválido." })
      .optional()
      .nullable(),
    posted_by_id: z
      .string()
      .uuid({ message: "posted_by_id inválido." })
      .optional()
      .nullable(),
    customer_with_movement: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.client_id !== undefined ||
      data.person_responsible_id !== undefined ||
      data.posted_by_id !== undefined ||
      data.customer_with_movement !== undefined,
    { message: "Informe ao menos um campo para atualizar." },
  );

export const responsibleIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

export const responsibleClientIdParamsSchema = z
  .object({
    clientId: z.string().uuid({ message: "clientId inválido." }),
  })
  .strict();
