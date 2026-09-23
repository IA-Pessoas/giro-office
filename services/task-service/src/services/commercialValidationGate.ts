import { ServiceError } from "@workspace/shared";

export interface CommercialValidationTask {
  billing: string;
  hiring_status: string | null;
}

export function isAwaitingCommercialValidation(task: CommercialValidationTask): boolean {
  return task.billing === "Realizar" && task.hiring_status !== "Contratado";
}

export function assertCommercialValidationReleased(task: CommercialValidationTask): void {
  if (isAwaitingCommercialValidation(task)) {
    throw new ServiceError(409, "A tarefa aguarda validação do Comercial.");
  }
}
