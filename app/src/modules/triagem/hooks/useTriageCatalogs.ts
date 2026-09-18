import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFetch } from "@shared/hooks";

import {
  triagemCatalogService,
  type TriageCatalogInput,
  type TriageCatalogKind,
} from "../services/triagemCatalogService";

export function triagemCatalogsQueryKey(kind?: TriageCatalogKind) {
  return ["triagem", "catalogs", kind ?? "all"] as const;
}

export function useTriageCatalogs(kind?: TriageCatalogKind) {
  return useFetch(triagemCatalogsQueryKey(kind), () => triagemCatalogService.list(kind));
}

export function useTriageCatalogMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["triagem", "catalogs"] });

  return {
    create: useMutation({
      mutationFn: (input: TriageCatalogInput) => triagemCatalogService.create(input),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: Partial<TriageCatalogInput> }) =>
        triagemCatalogService.update(id, input),
      onSuccess: refresh,
    }),
    archive: useMutation({
      mutationFn: (id: string) => triagemCatalogService.archive(id),
      onSuccess: refresh,
    }),
  };
}
