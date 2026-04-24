import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "react-toastify";
import { updateCurrentUser, type UpdateCurrentUserPayload } from "@workspace/api";

import { api } from "@shared/services/apiClient";

export function useUpdateCurrentUser(): UseMutationResult<
  void,
  unknown,
  UpdateCurrentUserPayload,
  unknown
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateCurrentUserPayload) => updateCurrentUser(api, payload),
    onSuccess: () => {
      toast.success("Atualizado com sucesso!");
      void queryClient.invalidateQueries({ queryKey: ["user", "profile"] });
    },
    onError: (error: unknown) => {
      if (
        isAxiosError(error) &&
        typeof error.response?.status === "number" &&
        error.response.status >= 500
      ) {
        return;
      }
      toast.error("Erro ao atualizar!");
      console.log(error);
    },
  });
}
