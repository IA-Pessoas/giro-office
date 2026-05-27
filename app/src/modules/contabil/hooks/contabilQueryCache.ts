import type { QueryClient } from "@tanstack/react-query";

import type {
  ContabilRelationship,
  ContabilResponsible,
} from "../types";
import {
  contabilRelationshipQueryKey,
  contabilResponsibleQueryKey,
} from "./queryKeys";

export function syncContabilResponsibleQueryCache(
  queryClient: QueryClient,
  clientId: string,
  responsible: ContabilResponsible | null,
) {
  queryClient.setQueryData(contabilResponsibleQueryKey(clientId), responsible);
}

export function syncContabilRelationshipQueryCache(
  queryClient: QueryClient,
  clientId: string,
  relationship: ContabilRelationship | null,
) {
  queryClient.setQueryData(contabilRelationshipQueryKey(clientId), relationship);
}
