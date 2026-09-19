import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { rhProfileService } from "../services/rhProfileService";
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
import { RH_QUERY_KEY } from "./useRhRequests";

export const RH_PROFILE_QUERY_KEY = [...RH_QUERY_KEY, "profile"] as const;

export function rhDossierQueryKey(userId?: string) {
  return [...RH_PROFILE_QUERY_KEY, "dossier", userId ?? "me"] as const;
}

export function rhDossierListQueryKey() {
  return [...RH_PROFILE_QUERY_KEY, "dossier-list"] as const;
}

export function rhContactsQueryKey(userId?: string) {
  return [...RH_PROFILE_QUERY_KEY, "contacts", userId ?? "me"] as const;
}

export function rhAllergiesQueryKey(userId?: string) {
  return [...RH_PROFILE_QUERY_KEY, "allergies", userId ?? "me"] as const;
}

export function useRhDossier(userId?: string, enabled = true): UseQueryResult<RhDossier, Error> {
  return useFetch(rhDossierQueryKey(userId), () => rhProfileService.getDossier(userId), { enabled });
}

export function useRhDossierList(enabled = true): UseQueryResult<RhDossierListItem[], Error> {
  return useFetch(rhDossierListQueryKey(), () => rhProfileService.listDossiers(), { enabled });
}

export function useRhContacts(userId?: string, enabled = true): UseQueryResult<RhEmergencyContact[], Error> {
  return useFetch(rhContactsQueryKey(userId), () => rhProfileService.listContacts(userId), { enabled });
}

export function useRhAllergies(userId?: string, enabled = true): UseQueryResult<RhAllergy[], Error> {
  return useFetch(rhAllergiesQueryKey(userId), () => rhProfileService.listAllergies(userId), { enabled });
}

function invalidateProfile(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: RH_PROFILE_QUERY_KEY });
}

export function useUpdateRhDossierMutation(): UseMutationResult<RhDossier, Error, UpdateRhDossierPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => rhProfileService.updateDossier(payload),
    onSuccess: () => invalidateProfile(queryClient),
  });
}

export function useCreateRhContactMutation(): UseMutationResult<RhEmergencyContact, Error, CreateRhEmergencyContactPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => rhProfileService.createContact(payload),
    onSuccess: () => invalidateProfile(queryClient),
  });
}

export function useUpdateRhContactMutation(): UseMutationResult<RhEmergencyContact, Error, UpdateRhEmergencyContactPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => rhProfileService.updateContact(payload),
    onSuccess: () => invalidateProfile(queryClient),
  });
}

export function useDeleteRhContactMutation(): UseMutationResult<{ id: string }, Error, DeleteRhEmergencyContactPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => rhProfileService.deleteContact(payload),
    onSuccess: () => invalidateProfile(queryClient),
  });
}

export function useReplaceRhAllergiesMutation(): UseMutationResult<RhAllergy[], Error, { allergies: RhAllergy[]; targetUserId?: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ allergies, targetUserId }) => rhProfileService.replaceAllergies(allergies, targetUserId),
    onSuccess: () => invalidateProfile(queryClient),
  });
}
