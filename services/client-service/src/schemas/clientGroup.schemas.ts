import { z } from "zod";

export const clientGroupParamsSchema = z.object({ id: z.string().uuid() }).strict();
export const createClientGroupBodySchema = z
  .object({ name: z.string().trim().min(1).max(120) })
  .strict();
export const updateClientGroupBodySchema = createClientGroupBodySchema;
// Worker: renomeia e/ou ativa/inativa o grupo (#1742).
export const patchClientGroupBodySchema = z
  .object({ name: z.string().trim().min(1).max(120).optional(), status: z.boolean().optional() })
  .strict()
  .refine((body) => body.name !== undefined || body.status !== undefined, {
    message: "Informe o nome ou o status do grupo.",
  });
export const replaceClientGroupClientsBodySchema = z
  .object({ client_ids: z.array(z.string().uuid()) })
  .strict();
