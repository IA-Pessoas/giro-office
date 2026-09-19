import { setupAPIClient } from "@shared/services/api";

import type {
  CreateRhEmergencyContactPayload,
  DeleteRhEmergencyContactPayload,
  RhAllergy,
  RhDossier,
  RhDossierListItem,
  RhEmergencyContact,
  UpdateRhDossierPayload,
  UpdateRhEmergencyContactPayload,
} from "../types";
import { buildRhDossierTargetParams, RH_ENDPOINTS, unwrapRhEnvelope } from "./rhService.contract";

export const rhProfileService = {
  async getDossier(userId?: string): Promise<RhDossier> {
    const response = await setupAPIClient().get(RH_ENDPOINTS.dossier, {
      params: buildRhDossierTargetParams(userId),
    });
    return unwrapRhEnvelope<RhDossier>(response.data);
  },

  async listDossiers(): Promise<RhDossierListItem[]> {
    const response = await setupAPIClient().get(RH_ENDPOINTS.dossierList);
    return unwrapRhEnvelope<RhDossierListItem[]>(response.data);
  },

  async updateDossier(payload: UpdateRhDossierPayload): Promise<RhDossier> {
    const response = await setupAPIClient().put(RH_ENDPOINTS.dossier, payload);
    return unwrapRhEnvelope<RhDossier>(response.data);
  },

  async listContacts(userId?: string): Promise<RhEmergencyContact[]> {
    const response = await setupAPIClient().get(RH_ENDPOINTS.contact, {
      params: buildRhDossierTargetParams(userId),
    });
    return unwrapRhEnvelope<RhEmergencyContact[]>(response.data);
  },

  async createContact(payload: CreateRhEmergencyContactPayload): Promise<RhEmergencyContact> {
    const response = await setupAPIClient().post(RH_ENDPOINTS.contact, payload);
    return unwrapRhEnvelope<RhEmergencyContact>(response.data);
  },

  async updateContact(payload: UpdateRhEmergencyContactPayload): Promise<RhEmergencyContact> {
    const response = await setupAPIClient().put(RH_ENDPOINTS.contact, payload);
    return unwrapRhEnvelope<RhEmergencyContact>(response.data);
  },

  async deleteContact(payload: DeleteRhEmergencyContactPayload): Promise<{ id: string }> {
    const response = await setupAPIClient().delete(RH_ENDPOINTS.contact, { data: payload });
    return unwrapRhEnvelope<{ id: string }>(response.data);
  },

  async listAllergies(userId?: string): Promise<RhAllergy[]> {
    const response = await setupAPIClient().get(RH_ENDPOINTS.allergy, {
      params: buildRhDossierTargetParams(userId),
    });
    return unwrapRhEnvelope<RhAllergy[]>(response.data);
  },

  async replaceAllergies(allergies: RhAllergy[], targetUserId?: string): Promise<RhAllergy[]> {
    const response = await setupAPIClient().put(RH_ENDPOINTS.allergy, {
      allergies,
      ...(targetUserId ? { target_user_id: targetUserId } : {}),
    });
    return unwrapRhEnvelope<RhAllergy[]>(response.data);
  },
};
