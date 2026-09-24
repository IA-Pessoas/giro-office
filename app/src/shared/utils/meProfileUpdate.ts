import type { UpdateCurrentUserPayload } from "@workspace/api";

export const PROFILE_UPDATE_ERROR_MESSAGE = "Não foi possível atualizar o perfil.";

/** Espelha a política do user-service (#1341). */
export const MIN_PASSWORD_LENGTH = 10;

interface SelfPasswordDraft {
  password: string;
  currentPassword: string;
  confirmPassword: string;
}

interface BuildSelfProfileUpdatePayloadOptions extends SelfPasswordDraft {
  canManageUsers: boolean;
  currentName: string;
  name: string;
}

/** Primeiro problema da troca de senha; null quando não há troca ou ela é válida. */
export function selfPasswordError({
  password,
  currentPassword,
  confirmPassword,
}: SelfPasswordDraft): string | null {
  const trimmedPassword = password.trim();
  if (!trimmedPassword) return null;
  if (!currentPassword) return "Informe a senha atual.";
  if (trimmedPassword.length < MIN_PASSWORD_LENGTH) {
    return `A nova senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (trimmedPassword !== confirmPassword.trim()) return "As senhas não conferem.";
  if (trimmedPassword === currentPassword) return "A nova senha deve ser diferente da atual.";
  return null;
}

export function buildSelfProfileUpdatePayload({
  canManageUsers,
  currentName,
  name,
  password,
  currentPassword,
  confirmPassword,
}: BuildSelfProfileUpdatePayloadOptions): UpdateCurrentUserPayload | null {
  if (selfPasswordError({ password, currentPassword, confirmPassword })) {
    return null;
  }

  const trimmedPassword = password.trim();
  const passwordChange = trimmedPassword ? { password: trimmedPassword, currentPassword } : null;

  if (!canManageUsers) {
    return passwordChange;
  }

  const trimmedName = name.trim();
  if (trimmedName !== currentName) {
    if (!trimmedName) {
      return null;
    }

    return passwordChange ? { name: trimmedName, ...passwordChange } : { name: trimmedName };
  }

  return passwordChange;
}
