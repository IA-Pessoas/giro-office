import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { updateCurrentUser, type UpdateCurrentUserPayload } from "@workspace/api";

import { api } from "@shared/services/apiClient";

export function useUpdateCurrentUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateCurrentUserPayload) => updateCurrentUser(api, payload),
    onSuccess: () => {
      toast.success("Atualizado com sucesso!");
      void queryClient.invalidateQueries({ queryKey: ["user", "profile"] });
    },
    onError: (error: unknown) => {
      toast.error("Erro ao atualizar!");
      console.log(error);
    },
  });
}
