import { ServiceError } from "@workspace/shared";

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
