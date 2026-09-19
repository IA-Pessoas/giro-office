import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFetch } from "@shared/hooks";

import {
  triagemCatalogService,
  type TriageCatalogInput,
  type TriageCatalogKind,
} from "../services/triagemCatalogService";

export function triagemCatalogsQueryKey(
  kind?: TriageCatalogKind,
  clientId?: string,
  competence?: string,
) {
  return ["triagem", "catalogs", kind ?? "all", clientId ?? "all", competence ?? "all"] as const;
}

export function useTriageCatalogs(
  kind?: TriageCatalogKind,
  clientId?: string,
  competence?: string,
) {
  return useFetch(
    triagemCatalogsQueryKey(kind, clientId, competence),
    () => triagemCatalogService.list({ kind, clientId, competence }),
  );
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
