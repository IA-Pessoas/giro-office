import {
  REGULARIZE_GUIDANCE_CHECKLIST_CODES,
  REGULARIZE_GUIDANCE_CHECKLIST_STATUSES,
  type RegularizeGuidanceBranchData,
  type RegularizeGuidanceChecklistCode,
  type RegularizeGuidanceChecklistStatus,
  ServiceError,
} from "@workspace/shared";

export type GuidanceChecklistItem = {
  code: RegularizeGuidanceChecklistCode;
  status: RegularizeGuidanceChecklistStatus;
  observation?: string;
};

export function assertCompleteGuidanceChecklist(
  items: GuidanceChecklistItem[],
): GuidanceChecklistItem[] {
  const knownCodes = new Set<string>(REGULARIZE_GUIDANCE_CHECKLIST_CODES);
  const knownStatuses = new Set<string>(REGULARIZE_GUIDANCE_CHECKLIST_STATUSES);
  const codes = new Set<string>();

  if (items.length !== REGULARIZE_GUIDANCE_CHECKLIST_CODES.length) {
    throw new ServiceError(422, "Checklist deve conter todos os itens canônicos.");
  }

  for (const item of items) {
    if (!knownCodes.has(item.code) || !knownStatuses.has(item.status) || codes.has(item.code)) {
      throw new ServiceError(422, "Checklist contém item inválido, duplicado ou desconhecido.");
    }
    codes.add(item.code);
  }

  if (codes.size !== REGULARIZE_GUIDANCE_CHECKLIST_CODES.length) {
    throw new ServiceError(422, "Checklist deve conter todos os itens canônicos.");
  }

  const itemsByCode = new Map(items.map((item) => [item.code, item]));
  return REGULARIZE_GUIDANCE_CHECKLIST_CODES.map((code) => {
    const item = itemsByCode.get(code);
    if (!item) {
      throw new ServiceError(422, "Checklist deve conter todos os itens canônicos.");
    }
    return item;
  });
}

export function resolveBranchData(
  checklist: GuidanceChecklistItem[],
  branchData: unknown,
): RegularizeGuidanceBranchData | null {
  const completedChecklist = assertCompleteGuidanceChecklist(checklist);
  const branch = completedChecklist.find((item) => item.code === "branch");
  if (branch?.status !== "Concluído") {
    return null;
  }

  if (!isBranchData(branchData)) {
    throw new ServiceError(422, "Dados da filial são obrigatórios e inválidos.");
  }

  return branchData;
}

function isBranchData(value: unknown): value is RegularizeGuidanceBranchData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const data = value as Record<string, unknown>;
  return (
    isNonEmptyString(data.name) &&
    isNonEmptyString(data.address) &&
    isNonEmptyString(data.city) &&
    isNonEmptyString(data.state) &&
    (data.document === undefined || isNonEmptyString(data.document))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
