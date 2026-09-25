import { ServiceError } from "@workspace/shared";

import { type ProspectingStatus, prospectingStatuses } from "../schemas/prospecting.schemas.js";

export { prospectingStatuses };
export type { ProspectingStatus };

export function assertProspectingTransition(
  currentStatus: string,
  nextStatus: ProspectingStatus,
): void {
  if (!prospectingStatuses.includes(currentStatus as ProspectingStatus)) {
    throw new ServiceError(409, "A prospecção possui um status antigo não suportado.");
  }
  if (currentStatus === "Fechado" && nextStatus !== "Fechado") {
    throw new ServiceError(409, "Uma prospecção fechada não pode ser reaberta.");
  }
}
