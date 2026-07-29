import { ServiceError } from "@workspace/shared";

export const PESSOAL_WRITE_PERMISSION = 2;

export interface PessoalAuthContext {
  organizationId: string;
  userId?: string;
  permission?: number;
  requestId?: string;
}

export function requireUserId(context: PessoalAuthContext): string {
  const userId = context.userId?.trim();
  if (!userId) {
    throw new ServiceError(401, "Autenticacao obrigatoria.");
  }

  return userId;
}

export function requireMinimumPermission(context: PessoalAuthContext, minPermission: number): void {
  if (typeof context.permission !== "number" || context.permission < minPermission) {
    throw new ServiceError(403, "Permissao insuficiente para acessar o pessoal-service.");
  }
}

export function toNullable<T>(value: T | null | undefined): T | null {
  return value === undefined ? null : value;
}

export function omitUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  const output: Partial<T> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key as keyof T] = value as T[keyof T];
    }
  }

  return output;
}
