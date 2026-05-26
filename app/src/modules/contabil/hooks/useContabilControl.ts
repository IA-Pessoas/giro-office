import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";

import { contabilControlService } from "../services";
import type {
  ContabilControl,
  CreateOrGetContabilControlPayload,
  PatchContabilControlFieldPayload,
} from "../types";
import { contabilControlQueryKey } from "./queryKeys";

interface PatchContabilControlFieldMutationPayload {
  clientId: string;
  competence: string;
  controlId: string;
  payload: {
    field: PatchContabilControlFieldPayload["field"];
    value: boolean | string;
  };
}

export function useContabilControlBootstrapMutation(): UseMutationResult<
  ContabilControl,
  Error,
  CreateOrGetContabilControlPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => contabilControlService.createOrGetControl(payload),
    onSuccess: async (control, payload) => {
      queryClient.setQueryData(
        contabilControlQueryKey(payload.client_id, payload.competence),
        control,
      );
    },
  });
}

export function usePatchContabilControlFieldMutation(): UseMutationResult<
  ContabilControl,
  Error,
  PatchContabilControlFieldMutationPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ controlId, payload }) =>
      contabilControlService.patchControlField(controlId, payload),
    onSuccess: async (control, variables) => {
      queryClient.setQueryData(
        contabilControlQueryKey(variables.clientId, variables.competence),
        control,
      );
    },
  });
}
