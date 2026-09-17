import {
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useFetch } from "@shared/hooks";
import { triageDocumentsService } from "../services";
import type {
  ContabilCompetence,
  TriageBankStatement,
  TriageClosing,
  TriageClosingStatus,
  TriageDocumentItemNotes,
  TriageDocumentField,
  TriageDocumentsMonthly,
  TriageFiscalField,
  TriageRoutineType,
} from "../types";
import {
  triageClosingQueryKey,
  triageMonthlyQueryKey,
  triageStatementsQueryKey,
} from "./queryKeys";

export function useTriageClosing(
  clientId: string,
  competence: ContabilCompetence,
  type: TriageRoutineType = "CONTABIL",
): UseQueryResult<TriageClosing, Error> {
  return useFetch(
    triageClosingQueryKey(clientId, competence),
    () => triageDocumentsService.getClosing({ clientId, competence }),
    { enabled: Boolean(clientId) && type === "CONTABIL" },
  );
}

export function useTriageMonthly(
  clientId: string,
  competence: ContabilCompetence,
  type: TriageRoutineType = "CONTABIL",
): UseQueryResult<TriageDocumentsMonthly | null, Error> {
  return useFetch(
    triageMonthlyQueryKey(clientId, competence, type),
    () => triageDocumentsService.getMonthly({ clientId, competence, type }),
    { enabled: Boolean(clientId) },
  );
}

export function useTriageEditability(
  clientId: string,
  type: TriageRoutineType = "CONTABIL",
): UseQueryResult<{ can_edit: boolean }, Error> {
  return useFetch(
    ["triagem", "editability", clientId, type],
    () => triageDocumentsService.getEditability(clientId, type),
    { enabled: Boolean(clientId) },
  );
}

export function useTriageStatements(
  clientId: string,
  competence: ContabilCompetence,
  type: TriageRoutineType = "CONTABIL",
): UseQueryResult<TriageBankStatement[], Error> {
  return useFetch(
    triageStatementsQueryKey(clientId, competence),
    () => triageDocumentsService.getStatements({ clientId, competence }),
    { enabled: Boolean(clientId) && type === "CONTABIL" },
  );
}

export function useTriageMutations(
  clientId: string,
  competence: ContabilCompetence,
  type: TriageRoutineType = "CONTABIL",
) {
  const queryClient = useQueryClient();
  const refresh = async () =>
    queryClient.invalidateQueries({
      queryKey: triageMonthlyQueryKey(clientId, competence, type),
    });
  return {
    create: useMutation({
      mutationFn: () =>
        triageDocumentsService.createMonthly({ clientId, competence, type }),
      onSuccess: refresh,
    }),
    item: useMutation({
      mutationFn: ({
        id,
        field,
        status,
        note,
        justification,
        delivery_method,
        value,
      }: {
        id: string;
        field: TriageDocumentField | TriageFiscalField;
        status?: Parameters<typeof triageDocumentsService.updateItem>[2];
        note?: string | null;
        justification?: string | null;
        delivery_method?: TriageDocumentsMonthly["item_notes"][string]["delivery_method"];
        value?: string | null;
      }) => {
        const itemNotes =
          note === undefined && justification === undefined && delivery_method === undefined
            ? undefined
            : {
                ...(note !== undefined ? { note } : {}),
                ...(justification !== undefined ? { justification } : {}),
                ...(delivery_method !== undefined ? { delivery_method } : {}),
              } satisfies Partial<TriageDocumentItemNotes>;
        return triageDocumentsService.updateItem(id, field, status, itemNotes, type, value);
      },
      onSuccess: refresh,
    }),
    all: useMutation({
      mutationFn: ({
        id,
        status,
        type: mutationType,
      }: {
        id: string;
        status: Parameters<typeof triageDocumentsService.updateAll>[1];
        type?: TriageRoutineType;
      }) => triageDocumentsService.updateAll(id, status, mutationType ?? type),
      onSuccess: refresh,
    }),
    statement: useMutation({
      mutationFn: triageDocumentsService.updateStatement,
      onSuccess: async () => {
        await refresh();
        await queryClient.invalidateQueries({
          queryKey: triageStatementsQueryKey(clientId, competence),
        });
      },
    }),
    closing: useMutation({
      mutationFn: ({ status }: { status: TriageClosingStatus }) =>
        triageDocumentsService.updateClosing({ clientId, competence, status }),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: triageClosingQueryKey(clientId, competence),
        });
        await queryClient.invalidateQueries({
          queryKey: ["contabil", "controls", "list", competence],
        });
      },
    }),
  };
}
