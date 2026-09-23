import { ServiceError } from "@workspace/shared";
import {
  TASK_BILLING_REALIZE,
  TASK_HIRING_STATUS_CONTRACTED,
} from "../constants/integracaoTask.js";

export interface CommercialValidationTask {
  billing: string;
  hiring_status: string | null;
}

export function isAwaitingCommercialValidation(task: CommercialValidationTask): boolean {
  return (
    task.billing === TASK_BILLING_REALIZE && task.hiring_status !== TASK_HIRING_STATUS_CONTRACTED
  );
}

export function assertCommercialValidationReleased(task: CommercialValidationTask): void {
  if (isAwaitingCommercialValidation(task)) {
    throw new ServiceError(409, "A tarefa aguarda validação do Comercial.");
  }
}
