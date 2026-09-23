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

export function playNewTiRequestSound(): void {
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.6);

    [880, 1320].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.18);
      oscillator.stop(context.currentTime + index * 0.18 + 0.16);
    });

    setTimeout(() => void context.close(), 1000);
  } catch {
    // Browsers may block audio before the first user interaction; the list still updates.
  }
}
