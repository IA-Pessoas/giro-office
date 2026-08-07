import type { UpdateCurrentUserPayload } from "@workspace/api";

export const PROFILE_UPDATE_ERROR_MESSAGE = "Não foi possível atualizar o perfil.";

interface BuildSelfProfileUpdatePayloadOptions {
  canManageUsers: boolean;
  currentName: string;
  name: string;
  password: string;
}

export function buildSelfProfileUpdatePayload({
  canManageUsers,
  currentName,
  name,
  password,
}: BuildSelfProfileUpdatePayloadOptions): UpdateCurrentUserPayload | null {
  const trimmedPassword = password.trim();

  if (!canManageUsers) {
    return trimmedPassword ? { password: trimmedPassword } : null;
  }

  const trimmedName = name.trim();
  if (trimmedName !== currentName) {
    if (!trimmedName) {
      return null;
    }

    return trimmedPassword ? { name: trimmedName, password: trimmedPassword } : { name: trimmedName };
  }

  return trimmedPassword ? { password: trimmedPassword } : null;
}
