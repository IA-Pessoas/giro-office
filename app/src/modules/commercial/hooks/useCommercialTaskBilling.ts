import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { commercialQueryKeys } from "./queryKeys";
import { commercialService } from "../services/commercialService";
import type { UpdateCommercialTaskBillingPayload } from "../types";

export function useCommercialTaskBilling() {
  return useFetch(commercialQueryKeys.taskBillings(), () => commercialService.listTaskBillings());
}

export function useUpdateCommercialTaskBilling() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: string; payload: UpdateCommercialTaskBillingPayload }) =>
      commercialService.updateTaskBilling(taskId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commercialQueryKeys.taskBillings() }),
  });
}
