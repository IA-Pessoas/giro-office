import { isAdminPermission } from "../../auth/utils/permissions.ts";

type HistoryActor = { id: string; permission?: number | null; type?: string | null } | null | undefined;

// Mesma regra do backend: owner ou admin (permission >= 2) gerenciam históricos e pendências.
export function canManageClientHistories(user: HistoryActor): boolean {
  return Boolean(user) && (user?.type === "owner" || isAdminPermission(user?.permission));
}

export function canDeleteClientHistory(user: HistoryActor, history: { user_id?: string | null }): boolean {
  return canManageClientHistories(user) || (Boolean(user) && user?.id === history.user_id);
}
