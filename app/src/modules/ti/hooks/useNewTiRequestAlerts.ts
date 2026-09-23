import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";

import { playNewTiRequestSound } from "../utils/newRequestSound";
import { findUnseenTiRequestIds } from "../utils/requestQueue";
import { tiQueryKeys } from "./queryKeys";
import { useTiRequests } from "./useTiRequests";

const NEW_REQUESTS_POLL_INTERVAL_MS = 30_000;

export function useNewTiRequestAlerts(enabled: boolean): void {
  const queryClient = useQueryClient();
  const seenIdsRef = useRef<Set<string> | null>(null);
  const newRequestsQuery = useTiRequests(
    { status: "New" },
    { enabled, refetchInterval: NEW_REQUESTS_POLL_INTERVAL_MS },
  );

  useEffect(() => {
    const newRequests = newRequestsQuery.data;

    if (!newRequests) {
      return;
    }

    const unseenIds = findUnseenTiRequestIds(seenIdsRef.current, newRequests);
    seenIdsRef.current = new Set([
      ...(seenIdsRef.current ?? []),
      ...newRequests.map((request) => String(request.id)),
    ]);

    if (unseenIds.length === 0) {
      return;
    }

    playNewTiRequestSound();
    toast.info(
      unseenIds.length === 1
        ? "Novo chamado recebido."
        : `${unseenIds.length} novos chamados recebidos.`,
    );
    void queryClient.invalidateQueries({ queryKey: tiQueryKeys.requests.all() });
  }, [newRequestsQuery.data, queryClient]);
}
