import { ServiceError } from "@workspace/shared";
import { PROJECT_STATUS_WAITING_COMMERCIAL } from "@workspace/shared/database";
import {
  TASK_BILLING_REALIZE,
  TASK_HIRING_STATUS_CONTRACTED,
} from "../constants/integracaoTask.js";

export interface CommercialValidationTask {
  billing: string;
  hiring_status: string | null;
}

export interface CommercialValidationProject {
  status: string;
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

export function assertProjectCommercialValidationReleased(
  project: CommercialValidationProject | null,
): void {
  if (project?.status === PROJECT_STATUS_WAITING_COMMERCIAL) {
    throw new ServiceError(409, "O projeto aguarda liberação do Comercial.");
  }
}

export async function assertTaskProjectCommercialValidationReleased(
  prisma: {
    project: {
      findFirst(args: {
        where: { id: string; organization_id: string };
        select: { status: true };
      }): Promise<CommercialValidationProject | null>;
    };
  },
  task: { project_id: string; organization_id: string },
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: task.project_id, organization_id: task.organization_id },
    select: { status: true },
  });
  assertProjectCommercialValidationReleased(project);
}
