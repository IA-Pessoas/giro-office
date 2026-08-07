import type { TiRobotPayload, TiRobotType } from "../types";

export const ROBOT_NAME_REQUIRED_MESSAGE = "Informe o nome do robô.";
export const ROBOT_TYPE_REQUIRED_MESSAGE = "Selecione o tipo do robô.";

export type RobotField = "name" | "type";
export type RobotFieldErrors = Partial<Record<RobotField, string>>;

export interface RobotDraft {
  name: string;
  description: string;
  type: TiRobotType | string;
  status: string;
  active: boolean;
  schedule: string;
}

export function validateRobotDraft(draft: RobotDraft): RobotFieldErrors {
  const errors: RobotFieldErrors = {};

  if (!draft.name.trim()) {
    errors.name = ROBOT_NAME_REQUIRED_MESSAGE;
  }

  if (!draft.type) {
    errors.type = ROBOT_TYPE_REQUIRED_MESSAGE;
  }

  return errors;
}

export function getFirstInvalidRobotField(
  errors: RobotFieldErrors,
): RobotField | undefined {
  return (["name", "type"] as const).find((field) => errors[field]);
}

function baseRobotPayload(draft: RobotDraft): TiRobotPayload {
  return {
    name: draft.name.trim(),
    type: draft.type,
    status: draft.status,
    active: draft.active,
  };
}

export function buildCreateRobotPayload(draft: RobotDraft): TiRobotPayload {
  const description = draft.description.trim();
  const schedule = draft.schedule.trim();

  return {
    ...baseRobotPayload(draft),
    ...(description ? { description } : {}),
    ...(schedule ? { schedule } : {}),
  };
}

export function buildUpdateRobotPayload(draft: RobotDraft): TiRobotPayload {
  return {
    ...baseRobotPayload(draft),
    description: draft.description.trim() || null,
    schedule: draft.schedule.trim() || null,
  };
}

export function getRobotMutationErrorMessage(
  error: unknown,
  fallback = "Não foi possível concluir a ação.",
): string {
  const responseData =
    error && typeof error === "object" && "response" in error
      ? (
          error as {
            response?: {
              data?: {
                error?: unknown;
                message?: unknown;
              };
            };
          }
        ).response?.data
      : undefined;

  for (const candidate of [responseData?.error, responseData?.message]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}
