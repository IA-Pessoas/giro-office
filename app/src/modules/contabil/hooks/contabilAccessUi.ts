export type ContabilCardState = "hidden" | "disabled" | "enabled";

export function shouldShowContabilNav(canViewContabil: boolean): boolean {
  return canViewContabil;
}

export function getContabilCardState(
  clientHasContabil: boolean | null | undefined,
  canViewContabil: boolean,
): ContabilCardState {
  if (!canViewContabil) {
    return "hidden";
  }

  if (clientHasContabil === false) {
    return "disabled";
  }

  return "enabled";
}
