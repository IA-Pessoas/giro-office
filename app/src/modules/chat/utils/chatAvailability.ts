export type ChatSessionUser = {
  auth_kind?: "organization" | "platform" | null;
} | null;

export function canUseOrganizationChat(user: ChatSessionUser) {
  return !!user && user.auth_kind !== "platform";
}
