const CLOSED_TI_REQUEST_STATUSES = new Set(["Resolved", "Closed"]);

export function isClosedTiRequestStatus(status: unknown): boolean {
  return typeof status === "string" && CLOSED_TI_REQUEST_STATUSES.has(status);
}

export function splitTiRequestsByQueue<T extends { status?: unknown }>(
  requests: readonly T[],
): { open: T[]; closed: T[] } {
  const open: T[] = [];
  const closed: T[] = [];

  for (const request of requests) {
    (isClosedTiRequestStatus(request.status) ? closed : open).push(request);
  }

  return { open, closed };
}

// A null baseline means the first load: nothing counts as new yet.
export function findUnseenTiRequestIds(
  seenIds: ReadonlySet<string> | null,
  requests: readonly { id: unknown }[],
): string[] {
  if (!seenIds) {
    return [];
  }

  return requests.map((request) => String(request.id)).filter((id) => !seenIds.has(id));
}
