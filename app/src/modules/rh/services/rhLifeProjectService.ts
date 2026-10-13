import { setupAPIClient } from "@shared/services/api";

import type {
  CreateRhLifeObjectivePayload,
  CreateRhLifeProjectPayload,
  RhLifeProject,
  UpdateRhLifeObjectivePayload,
  UpdateRhLifeProjectPayload,
} from "../types";
import { RH_ENDPOINTS, unwrapRhEnvelope } from "./rhService.contract";

export const rhLifeProjectService = {
  async get(year: number, userId?: string): Promise<RhLifeProject | null> {
    const response = await setupAPIClient().get(RH_ENDPOINTS.lifeProjects, {
      params: { year, ...(userId ? { user_id: userId } : {}) },
    });
    return unwrapRhEnvelope<RhLifeProject | null>(response.data);
  },

  async create(payload: CreateRhLifeProjectPayload): Promise<RhLifeProject> {
    const response = await setupAPIClient().post(RH_ENDPOINTS.lifeProjects, payload);
    return unwrapRhEnvelope<RhLifeProject>(response.data);
  },

  async update({ id, ...changes }: UpdateRhLifeProjectPayload): Promise<RhLifeProject> {
    const response = await setupAPIClient().patch(RH_ENDPOINTS.lifeProjectDetail(id), changes);
    return unwrapRhEnvelope<RhLifeProject>(response.data);
  },

  async createObjective({ projectId, ...objective }: CreateRhLifeObjectivePayload): Promise<RhLifeProject> {
    const response = await setupAPIClient().post(
      RH_ENDPOINTS.lifeProjectObjectives(projectId),
      objective,
    );
    return unwrapRhEnvelope<RhLifeProject>(response.data);
  },

  async updateObjective({
    projectId,
    objectiveId,
    ...changes
  }: UpdateRhLifeObjectivePayload): Promise<RhLifeProject> {
    const response = await setupAPIClient().patch(
      RH_ENDPOINTS.lifeProjectObjective(projectId, objectiveId),
      changes,
    );
    return unwrapRhEnvelope<RhLifeProject>(response.data);
  },
};
