import { z } from "zod";

import { idQuerySchema } from "./common.schema.js";

export const createClientPfBodySchema = z
  .object({
    code: z.string().min(1, "code obrigatorio."),
    name: z.string().min(1, "name obrigatorio."),
    sex: z.string().min(1, "sex obrigatorio."),
    address: z.string().min(1, "address obrigatorio."),
    city: z.string().min(1, "city obrigatorio."),
    zip_code: z.string().min(1, "zip_code obrigatorio."),
    state: z.string().min(1, "state obrigatorio."),
    profession: z.string().min(1, "profession obrigatorio."),
    father: z.string().min(1, "father obrigatorio."),
    mother: z.string().min(1, "mother obrigatorio."),
    marital_status: z.string().min(1, "marital_status obrigatorio."),
    date_of_birth: z.coerce.date(),
    cpf: z.string().min(1, "cpf obrigatorio."),
    rg: z.string().min(1, "rg obrigatorio."),
    rg_expedition: z.coerce.date().optional(),
    rg_validity: z.coerce.date().optional(),
    military_certificate: z.string().optional().default(""),
    ctps: z.string().optional().default(""),
    cnh: z.string().optional().default(""),
    cnh_expedition: z.coerce.date().optional(),
    cnh_validity: z.coerce.date().optional(),
    spouse: z.string().optional().default(""),
    notes: z.string().optional().default(""),
    status: z.string().min(1, "status obrigatorio."),
  })
  .strict();

export const updateClientPfBodySchema = createClientPfBodySchema
  .extend({
    id: z.string().uuid("id invalido."),
  })
  .strict();

export const clientPfDetailQuerySchema = idQuerySchema;

export const listClientPfQuerySchema = z
  .object({
    status: z.string().min(1, "status obrigatorio."),
  })
  .strict();

export type CreateClientPfBody = z.infer<typeof createClientPfBodySchema>;
export type UpdateClientPfBody = z.infer<typeof updateClientPfBodySchema>;
