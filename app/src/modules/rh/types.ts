export type RhRequestUrgency = "Low" | "Medium" | "High";

export type RhRequestStatus = "New" | "In_Progress" | "Resolved" | "Closed";

export type RhMessageType = "Message" | "Solution" | "Rejection" | "Acceptance";

export type RhScoreQuestionType = "behavioral" | "technical" | "tech" | "leadership";

export type RhNitroMetricType = "projects" | "hours" | "errors" | "folders";

export interface RhCategory {
  id: string;
  name: string;
  active: boolean;
  organization_id: string;
}

export interface RhCategoryListFilters {
  activeOnly?: boolean;
}

export interface CreateRhCategoryPayload {
  name: string;
  active?: boolean;
}

export interface UpdateRhCategoryPayload {
  id: string;
  name?: string;
  active?: boolean;
}

export interface DeleteRhCategoryPayload {
  id: string;
}

export interface RhRequest {
  id: string;
  title: string;
  description: string;
  requester_user_id: string;
  category_id: string;
  assigned_to_user_id: string;
  urgency: RhRequestUrgency;
  status: RhRequestStatus;
  created_at: string;
  updated_at: string;
  organization_id: string;
}

export interface AssignableUser {
  id: string;
  name: string;
  status: string | null;
  departmentName: string | null;
  photoUrl: string | null;
}

export interface RhRequestRow {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  categoryLabel: string;
  assignedToUserId: string;
  assignedToUserLabel: string;
  urgency: RhRequestUrgency;
  urgencyLabel: string;
  urgencyClassName: string;
  status: RhRequestStatus;
  statusLabel: string;
  statusClassName: string;
  createdAt: string;
  createdAtLabel: string;
  updatedAt: string;
  updatedAtLabel: string;
}

export interface RhRequestListFilters {
  status?: RhRequestStatus;
  category_id?: string;
  requester_user_id?: string;
  assigned_to_user_id?: string;
}

export interface CreateRhRequestPayload {
  title: string;
  description: string;
  category_id: string;
  assigned_to_user_id: string;
  urgency: RhRequestUrgency;
}

export interface UpdateRhRequestPayload {
  id: string;
  title?: string;
  description?: string;
  category_id?: string;
  assigned_to_user_id?: string;
  urgency?: RhRequestUrgency;
  status?: RhRequestStatus;
}

export interface DeleteRhRequestPayload {
  id: string;
}

export interface RhMessage {
  id: string;
  request_id: string;
  sender_user_id: string;
  message: string;
  attachment: string | null;
  type: RhMessageType;
  is_read: boolean;
  created_at: string;
  organization_id: string;
}

export interface RhMessageListFilters {
  requestId: string;
}

export interface CreateRhMessagePayload {
  request_id: string;
  message: string;
  type: RhMessageType;
  attachment?: string;
}

export interface RhPointConfig {
  id: string;
  user_id: string;
  organization_id: string;
  start_time: string;
  lunch_break: string;
  lunch_return: string;
  end_time: string;
  work_days: string | null;
  bank_balance: number | null;
  signature: string | null;
}

export interface UpsertRhPointConfigPayload {
  target_user_id?: string;
  start_time: string;
  lunch_break: string;
  lunch_return: string;
  end_time: string;
  work_days?: string;
}

export interface RhPoint {
  id: string;
  user_id: string;
  organization_id: string;
  clock_in: string | null;
  lunch_out: string | null;
  lunch_in: string | null;
  clock_out: string | null;
  workload_hours: number | null;
  time_bank_balance: number | null;
  signature: string | null;
}

export type RhRegisterPointAction = "Entrada" | "Saída almoço" | "Volta almoço" | "Saída";

export interface RhRegisterPointResult {
  action: RhRegisterPointAction;
  point: RhPoint;
}

export interface RhPointCalculationResult {
  point_id: string;
  total_worked_minutes: number;
  expected_minutes: number;
  day_balance_minutes: number;
}

export interface CreateRhPointAdjustmentPayload {
  point_id: string;
  clock_in: string;
  lunch_out: string;
  lunch_in: string;
  clock_out: string;
  justification: string;
  attachment?: string;
}

export interface ApproveRhPointAdjustmentPayload {
  request_id: string;
  obs_approver?: string | null;
}

export interface RhPointAdjustmentRequest {
  id: string;
  user_id: string;
  point_id: string;
  clock_in: string;
  lunch_out: string;
  lunch_in: string;
  clock_out: string;
  justification: string;
  attachment: string | null;
  date: string;
  status: string;
  approver_user_id: string | null;
  obs_approver: string | null;
  organization_id: string;
}

export interface RhHoliday {
  id: string;
  name: string;
  date: string;
  organization_id: string;
}

export interface CreateRhHolidayPayload {
  name: string;
  date: string;
}

export interface UpdateRhHolidayPayload {
  id: string;
  name: string;
  date: string;
}

export interface DeleteRhHolidayPayload {
  id: string;
}

export interface RhTimeBankRelease {
  id: string;
  user_id: string;
  date: string;
  minutes: number;
  reason: string;
  is_approved: boolean;
  added_by_user_id: string;
  organization_id: string;
}

export interface RhTimeBankReleaseListFilters {
  user_id?: string;
  is_approved?: boolean;
  date_from?: string;
  date_to?: string;
}

export interface CreateRhTimeBankReleasePayload {
  user_id: string;
  date: string;
  minutes: number;
  reason: string;
}

export interface ApproveRhTimeBankReleasePayload {
  id: string;
}

export interface RhTimeSheet {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  signature: string | null;
  organization_id: string;
}

export interface RhTimeSheetListFilters {
  target_user_id?: string;
}

export interface CreateRhTimeSheetPayload {
  user_id: string;
  start_time: string;
  end_time: string;
}

export interface SignRhTimeSheetPayload {
  id: string;
  signature: string;
}

export interface RhScoreQuestion {
  id: string;
  question: string;
  type: RhScoreQuestionType;
  active: boolean;
  question_id: string;
  organization_id: string;
}

export interface RhScoreQuestionListFilters {
  type?: RhScoreQuestionType;
  all?: boolean;
}

export interface CreateRhScoreQuestionPayload {
  question: string;
  type: RhScoreQuestionType;
}

export interface UpdateRhScoreQuestionPayload {
  id: string;
  question?: string;
  type?: RhScoreQuestionType;
  active?: boolean;
}

export interface DeleteRhScoreQuestionPayload {
  id: string;
}

export interface RhScoreNitro {
  id: string;
  score_id: string;
  projects_score: number;
  hours_score: number;
  errors_score: number;
  folders_score: number;
  total_hours: number | null;
  total_errors: number | null;
  organization_id: string;
}

export interface RhScoreEvaluationAnswer {
  question_id: string;
  question_text?: string;
  answer: number;
  obs?: string;
}

export interface RhScoreEvaluation {
  id: string;
  score_id: string;
  type: RhScoreQuestionType;
  evaluator_role: string;
  evaluator_id: string | null;
  status: string;
  answers: RhScoreEvaluationAnswer[];
  average_score: number;
  organization_id: string;
  evaluator?: {
    name: string;
  } | null;
}

export interface RhScoreQuarter {
  id: string;
  user_id: string;
  quarter: string;
  behavioral?: number | null;
  technical?: number | null;
  technology?: number | null;
  leadership?: number | null;
  final_score?: number | null;
  organization_id: string;
  nitro?: RhScoreNitro | null;
  evaluations?: RhScoreEvaluation[];
}

export interface CreateRhScoreQuarterPayload {
  target_user_id: string;
  quarter: string;
}

export interface UpdateRhQuarterNitroPayload {
  score_id: string;
  type: RhNitroMetricType;
  value: number;
}

export interface UpdateRhScoreNitroPayload {
  score_id: string;
  type: RhNitroMetricType;
  value: number;
}

export interface RhPendingScoreEvaluation {
  id: string;
  score_id: string;
  type: RhScoreQuestionType;
  evaluator_role: string;
  evaluator_id: string | null;
  status: string;
  answers: RhScoreEvaluationAnswer[];
  average_score: number;
  organization_id: string;
  scoreQuarter: {
    id: string;
    quarter: string;
    user?: {
      name: string;
    } | null;
  };
}

export interface SubmitRhScoreEvaluationPayload {
  evaluation_id: string;
  answers: RhScoreEvaluationAnswer[];
}

export interface RhMutationMessage {
  message: string;
}
