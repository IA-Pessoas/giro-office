import { ZodError, type ZodTypeAny, z } from "zod";

import { ServiceError } from "../http/errors.js";

export function parseWithZod<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  try {
    return schema.parse(data);
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const message = first?.message ?? "Dados inválidos.";
      throw new ServiceError(400, message);
    }
    throw err;
  }
}
