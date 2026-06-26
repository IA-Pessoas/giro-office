import { setupAPIClient } from "@shared/services/api";

import type {
  CreateRhScoreQuestionPayload,
  CreateRhScoreQuarterPayload,
  DeleteRhScoreQuestionPayload,
  RhMutationMessage,
  RhPendingScoreEvaluation,
  RhScoreNitro,
  RhScoreQuestion,
  RhScoreQuestionListFilters,
  RhScoreQuarter,
  SubmitRhScoreEvaluationPayload,
  UpdateRhQuarterNitroPayload,
  UpdateRhScoreNitroPayload,
  UpdateRhScoreQuestionPayload,
} from "../types";
import {
  buildRhScoreQuestionListParams,
  RH_ENDPOINTS,
  unwrapRhEnvelope,
} from "./rhService.contract";

export const rhScoreService = {
  async listQuestions(filters: RhScoreQuestionListFilters = {}): Promise<RhScoreQuestion[]> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.scoreQuestions, {
      params: buildRhScoreQuestionListParams(filters),
    });

    return unwrapRhEnvelope<RhScoreQuestion[]>(response.data);
  },

  async createQuestion(payload: CreateRhScoreQuestionPayload): Promise<RhScoreQuestion> {
    const api = setupAPIClient();
    const response = await api.post(RH_ENDPOINTS.scoreQuestions, payload);

    return unwrapRhEnvelope<RhScoreQuestion>(response.data);
  },

  async updateQuestion(payload: UpdateRhScoreQuestionPayload): Promise<RhScoreQuestion> {
    const api = setupAPIClient();
    const response = await api.put(RH_ENDPOINTS.scoreQuestions, payload);

    return unwrapRhEnvelope<RhScoreQuestion>(response.data);
  },

  async deleteQuestion(payload: DeleteRhScoreQuestionPayload): Promise<RhMutationMessage> {
    const api = setupAPIClient();
    const response = await api.delete(RH_ENDPOINTS.scoreQuestions, { data: payload });

    return unwrapRhEnvelope<RhMutationMessage>(response.data);
  },

  async generateQuarterScore(payload: CreateRhScoreQuarterPayload): Promise<RhScoreQuarter> {
    const api = setupAPIClient();
    const response = await api.post(RH_ENDPOINTS.scoreQuartersGenerate, payload);

    return unwrapRhEnvelope<RhScoreQuarter>(response.data);
  },

  async updateQuarterNitro(payload: UpdateRhQuarterNitroPayload): Promise<RhScoreNitro> {
    const api = setupAPIClient();
    const response = await api.patch(RH_ENDPOINTS.scoreQuartersNitro, payload);

    return unwrapRhEnvelope<RhScoreNitro>(response.data);
  },

  async listMyScores(): Promise<RhScoreQuarter[]> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.myScoreQuarters);

    return unwrapRhEnvelope<RhScoreQuarter[]>(response.data);
  },

  async getScoreDetail(id: string): Promise<RhScoreQuarter> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.scoreQuarterDetail(id));

    return unwrapRhEnvelope<RhScoreQuarter>(response.data);
  },

  async listPendingEvaluations(): Promise<RhPendingScoreEvaluation[]> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.pendingScoreEvaluations);

    return unwrapRhEnvelope<RhPendingScoreEvaluation[]>(response.data);
  },

  async submitEvaluation(
    payload: SubmitRhScoreEvaluationPayload,
  ): Promise<RhMutationMessage> {
    const api = setupAPIClient();
    const response = await api.post(RH_ENDPOINTS.submitScoreEvaluation, payload);

    return unwrapRhEnvelope<RhMutationMessage>(response.data);
  },

  async updateNitroMetric(payload: UpdateRhScoreNitroPayload): Promise<RhScoreNitro> {
    const api = setupAPIClient();
    const response = await api.put(RH_ENDPOINTS.scoreNitroUpdate, payload);

    return unwrapRhEnvelope<RhScoreNitro>(response.data);
  },
};
