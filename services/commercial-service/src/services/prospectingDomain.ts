import { ServiceError } from "@workspace/shared";

import { type ProspectingStatus, prospectingStatuses } from "../schemas/prospecting.schemas.js";

export { prospectingStatuses };
export type { ProspectingStatus };

const allowedTransitions: Readonly<Record<ProspectingStatus, readonly ProspectingStatus[]>> = {
  "Análise Financeira": prospectingStatuses,
  "Análise/Agendamento": prospectingStatuses,
  "Envio de Proposta": prospectingStatuses,
  Paralisado: ["Paralisado", "Análise/Agendamento"],
  "Recusado pelo Cliente": ["Recusado pelo Cliente", "Análise/Agendamento"],
  Fechado: ["Fechado"],
};

export function assertProspectingTransition(
  currentStatus: string,
  nextStatus: ProspectingStatus,
): void {
  if (!prospectingStatuses.includes(currentStatus as ProspectingStatus)) {
    throw new ServiceError(409, "A prospecção possui um status legado não suportado.");
  }
  const current = currentStatus as ProspectingStatus;
  if (!allowedTransitions[current].includes(nextStatus)) {
    throw new ServiceError(
      409,
      `A transição de ${currentStatus} para ${nextStatus} não é permitida.`,
    );
  }
}
