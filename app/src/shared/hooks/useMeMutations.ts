import {
  deleteCurrentUserPhoto,
  type MeSessionUser,
  type UpdateCurrentUserPayload,
  updateCurrentUser,
  uploadCurrentUserPhoto,
} from "@workspace/api";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "react-toastify";

import { api } from "@shared/services/apiClient";
import { isServerErrorAlreadyNotified } from "@shared/services/serverErrorToast";
import { ME_QUERY_KEY } from "./useMe";
import { PROFILE_UPDATE_ERROR_MESSAGE } from "@shared/utils/meProfileUpdate";

function getUploadPhotoErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const responseMessage = error.response?.data?.error;

    if (responseMessage === "Assinatura do arquivo não corresponde ao tipo informado.") {
      return "A imagem selecionada não parece ser um JPEG, PNG ou WebP válido. Exporte o arquivo novamente e tente de novo.";
    }
  }

  return "Não foi possível atualizar a foto.";
}

function updateMeCache(queryClient: ReturnType<typeof useQueryClient>, me: MeSessionUser): void {
  queryClient.setQueryData(ME_QUERY_KEY, me);
  void queryClient.invalidateQueries({ queryKey: ["user", "profile"] });
}

export function useUpdateMe(): UseMutationResult<
  MeSessionUser,
  unknown,
  UpdateCurrentUserPayload,
  unknown
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateCurrentUserPayload) => updateCurrentUser(api, payload),
    onSuccess: (me) => {
      updateMeCache(queryClient, me);
      toast.success("Perfil atualizado com sucesso!");
    },
    onError: (error: unknown) => {
      if (isServerErrorAlreadyNotified(error)) {
        return;
      }

      toast.error(PROFILE_UPDATE_ERROR_MESSAGE);
    },
  });
}

export function useUploadMePhoto(): UseMutationResult<MeSessionUser, unknown, File, unknown> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => uploadCurrentUserPhoto(api, file),
    onSuccess: (me) => {
      updateMeCache(queryClient, me);
      toast.success("Foto atualizada com sucesso!");
    },
    onError: (error: unknown) => {
      if (isServerErrorAlreadyNotified(error)) {
        return;
      }

      toast.error(getUploadPhotoErrorMessage(error));
      console.log(error);
    },
  });
}

export function useDeleteMePhoto(): UseMutationResult<MeSessionUser, unknown, void, unknown> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteCurrentUserPhoto(api),
    onSuccess: (me) => {
      updateMeCache(queryClient, me);
      toast.success("Foto removida com sucesso!");
    },
    onError: (error: unknown) => {
      if (isServerErrorAlreadyNotified(error)) {
        return;
      }

      toast.error("Não foi possível remover a foto.");
      console.log(error);
    },
  });
}
