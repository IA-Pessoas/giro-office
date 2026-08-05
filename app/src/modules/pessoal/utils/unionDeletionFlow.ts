import type { PessoalUnion } from "../types/unions";

export type UnionDeletionState = {
  union: PessoalUnion;
  error: string | null;
};

export function openUnionDeletion(
  current: UnionDeletionState | null,
  union: PessoalUnion,
  { canEdit, isPending }: { canEdit: boolean; isPending: boolean },
): UnionDeletionState | null {
  if (!canEdit || isPending) {
    return current;
  }

  return { union, error: null };
}

export function cancelUnionDeletion(
  current: UnionDeletionState | null,
  isPending: boolean,
): UnionDeletionState | null {
  return isPending ? current : null;
}

export function getUnionDeletionTargetId(current: UnionDeletionState | null): string | null {
  return current?.union.id ?? null;
}

export function completeUnionDeletion(
  current: UnionDeletionState | null,
  unionId: string,
): UnionDeletionState | null {
  return current?.union.id === unionId ? null : current;
}

export function failUnionDeletion(
  current: UnionDeletionState | null,
  unionId: string,
  error: string,
): UnionDeletionState | null {
  if (current?.union.id !== unionId) {
    return current;
  }

  return { ...current, error };
}
