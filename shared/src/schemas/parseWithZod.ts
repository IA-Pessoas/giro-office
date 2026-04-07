<<<<<<< HEAD
import { ZodError, type ZodTypeAny, type z } from "zod";

import { ServiceError } from "../http/errors.js";

/** Retorna o tipo de *saída* do schema (após defaults e transforms). */
export function parseWithZod<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
=======
import { ZodError, type ZodTypeAny, z } from "zod";

import { ServiceError } from "../http/errors.js";

export function parseWithZod<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
>>>>>>> develop
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
