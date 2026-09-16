import type {
  RhCategoryListFilters,
  RhPointAdjustmentListFilters,
  RhPointListFilters,
  RhPointSummaryFilters,
  RhRequestListFilters,
  RhScoreQuestionListFilters,
  RhTimeBankReleaseListFilters,
  RhTimeSheetListFilters,
} from "../types";

export const RH_ENDPOINTS = {
  categories: "/rh/categories",
  requests: "/rh/requests",
  requestDetail: (id: string) => `/rh/requests/${id}`,
  messages: "/rh/messages",
  operationalUsers: "/rh/operational-users",
  dossier: "/rh/profile/colaborator",
  dossierList: "/rh/profile/colaborator/list",
  contact: "/rh/profile/contact",
  allergy: "/rh/profile/allergy",
  pointConfig: "/rh/point-config",
  pointConfigByUser: (userId: string) => `/rh/point-config/${userId}`,
  points: "/rh/point",
  myTodayPoint: "/rh/point/me/today",
  pointAdjustmentRequests: "/rh/point/adjustment/requests",
  pointSummary: "/rh/point/summary",
  registerPoint: "/rh/point/register",
  calculatePoint: (pointId: string) => `/rh/point/${pointId}/calculate`,
  recalculatePoints: "/rh/point/recalculate",
  requestPointAdjustment: "/rh/point/adjustment/request",
  approvePointAdjustment: "/rh/point/adjustment/approve",
  rejectPointAdjustment: "/rh/point/adjustment/reject",
  approvePointAdjustmentsBulk: "/rh/point/adjustment/approve-bulk",
  retroactivePointAdjustment: "/rh/point/adjustment/retroactive",
  pointAdjustmentAttachment: (requestId: string) =>
    `/rh/point/adjustment/${requestId}/attachment`,
  holidays: "/rh/holidays",
  timeBankSummary: "/rh/time-bank/summary",
  timeBankSummaryByUser: (userId: string) => `/rh/time-bank/summary/${userId}`,
  timeBankOverview: "/rh/time-bank/overview",
  timeBankReleaseList: "/rh/time-bank-releases/list",
  timeBankReleases: "/rh/time-bank-releases",
  timeBankReleaseApprove: "/rh/time-bank-releases/approve",
  timeSheets: "/rh/timesheets",
  timeSheetDetail: (id: string) => `/rh/timesheets/${id}`,
  timeSheetPdf: (id: string) => `/rh/timesheets/${id}/pdf`,
  signTimeSheet: "/rh/timesheets/sign",
  reopenTimeSheet: "/rh/timesheets/reopen",
  rebuildTimeSheet: "/rh/timesheets/rebuild",
  scoreQuestions: "/rh/score/questions",
  scoreQuartersGenerate: "/rh/score/quarters/generate",
  scoreQuartersNitro: "/rh/score/quarters/nitro",
  myScoreQuarters: "/rh/score/quarters/me",
  scoreQuarterDetail: (id: string) => `/rh/score/quarters/${id}`,
  pendingScoreEvaluations: "/rh/score/evaluations/pending",
  submitScoreEvaluation: "/rh/score/evaluations/submit",
  scoreNitroUpdate: "/rh/score/nitro/update",
} as const;

export function buildRhDossierTargetParams(userId?: string) {
  return { user_id: userId };
}

export interface RhOperationalUserQueryParams {
  module?: string;
  department_id?: string;
  department_name?: string;
}

export function buildRhCategoryListParams(filters: RhCategoryListFilters = {}) {
  return {
    activeOnly: filters.activeOnly ? "true" : undefined,
  };
}

export function buildRhRequestListParams(filters: RhRequestListFilters = {}) {
  return {
    status: filters.status,
    category_id: filters.category_id,
    requester_user_id: filters.requester_user_id,
    assigned_to_user_id: filters.assigned_to_user_id,
    page: filters.page,
    limit: filters.limit,
  };
}

export function buildRhPointListParams(filters: RhPointListFilters = {}) {
  return {
    date_from: filters.date_from,
    date_to: filters.date_to,
    user_id: filters.user_id,
  };
}

export function buildRhPointSummaryParams(filters: RhPointSummaryFilters) {
  return {
    month: filters.month,
    user_id: filters.user_id,
  };
}

export function buildRhPointAdjustmentListParams(
  filters: RhPointAdjustmentListFilters = {},
) {
  return {
    status: filters.status,
    user_id: filters.user_id,
  };
}

export function buildRhTimeBankReleaseListParams(
  filters: RhTimeBankReleaseListFilters = {},
) {
  return {
    user_id: filters.user_id,
    is_approved:
      typeof filters.is_approved === "boolean"
        ? String(filters.is_approved)
        : undefined,
    date_from: filters.date_from,
    date_to: filters.date_to,
  };
}

export function buildRhTimeSheetListParams(filters: RhTimeSheetListFilters = {}) {
  return {
    target_user_id: filters.target_user_id,
  };
}

export function buildRhScoreQuestionListParams(
  filters: RhScoreQuestionListFilters = {},
) {
  return {
    type: filters.type,
    all: filters.all ? "true" : undefined,
  };
}

export function unwrapRhEnvelope<T>(body: unknown): T {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }

  return body as T;
}
