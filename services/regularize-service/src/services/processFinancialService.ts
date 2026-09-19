import {
  FINANCIAL_STATUS_BY_LEGACY_CODE,
  FINANCIAL_STATUS_VALUES,
  type FinancialStatus,
} from "../schemas/status.schemas.js";

export const FINANCIAL_LOCKING_TYPE = "Financeiro" as const;

export function normalizeFinancialStatus(value: unknown): FinancialStatus {
  if (typeof value === "string" && (FINANCIAL_STATUS_VALUES as readonly string[]).includes(value)) {
    return value as FinancialStatus;
  }

  const code =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : undefined;
  const status = code === undefined ? undefined : FINANCIAL_STATUS_BY_LEGACY_CODE[code];

  if (status) {
    return status;
  }

  throw new Error("Status financeiro invalido.");
}

export function applyFinancialStatusTransition(input: {
  currentFinancialStatus: unknown;
  currentStatus: string;
  currentLockingType: string | null | undefined;
  nextFinancialStatus: FinancialStatus;
  requestedStatus: string;
  requestedLockingType: string | null | undefined;
}): { financialStatus: FinancialStatus; status: string; lockingType: string | null } {
  const currentFinancialPause =
    isPausedStatus(input.currentStatus) && input.currentLockingType === FINANCIAL_LOCKING_TYPE;
  const currentManualPause = isPausedStatus(input.currentStatus) && !currentFinancialPause;
  const currentFinancialStatus =
    input.currentFinancialStatus === null || input.currentFinancialStatus === undefined
      ? null
      : normalizeFinancialStatus(input.currentFinancialStatus);

  if (input.nextFinancialStatus === "Não Contratado") {
    if (currentManualPause) {
      return {
        financialStatus: input.nextFinancialStatus,
        status: input.currentStatus,
        lockingType: input.currentLockingType ?? null,
      };
    }

    return {
      financialStatus: input.nextFinancialStatus,
      status: "Paralisado",
      lockingType: FINANCIAL_LOCKING_TYPE,
    };
  }

  if (currentFinancialPause && currentFinancialStatus === "Não Contratado") {
    return { financialStatus: input.nextFinancialStatus, status: "Andamento", lockingType: null };
  }

  if (
    currentFinancialStatus === input.nextFinancialStatus &&
    !currentFinancialPause &&
    input.requestedStatus === "Paralisado" &&
    input.requestedLockingType === FINANCIAL_LOCKING_TYPE
  ) {
    return {
      financialStatus: input.nextFinancialStatus,
      status: input.currentStatus,
      lockingType: input.currentLockingType ?? null,
    };
  }

  return {
    financialStatus: input.nextFinancialStatus,
    status: input.requestedStatus,
    lockingType: input.requestedLockingType ?? null,
  };
}

function isPausedStatus(status: string): boolean {
  return status === "Paralisado" || status === "Paralizado";
}
