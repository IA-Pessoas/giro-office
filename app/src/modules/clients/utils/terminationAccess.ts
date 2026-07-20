export const CLIENT_ALREADY_INACTIVE_MESSAGE = "Cliente já está inativo";

export type ClientTerminationAccess =
  | {
      canOpen: true;
    }
  | {
      canOpen: false;
      message: string;
    };

export function getClientTerminationAccess(
  status: string | null | undefined,
): ClientTerminationAccess {
  const normalizedStatus = status?.trim().toLowerCase() ?? "";

  if (normalizedStatus === "inactive" || normalizedStatus.startsWith("inativo")) {
    return {
      canOpen: false,
      message: CLIENT_ALREADY_INACTIVE_MESSAGE,
    };
  }

  return { canOpen: true };
}
