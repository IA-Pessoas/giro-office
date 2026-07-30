export function formatActivityTime(createdAt: string | null, nowMs = Date.now()): string {
  if (!createdAt) {
    return "agora";
  }

  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return "agora";
  }

  const seconds = Math.max(0, Math.floor((nowMs - timestamp) / 1000));
  if (seconds < 60) {
    return "agora";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `há ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `há ${hours} hora${hours === 1 ? "" : "s"}`;
  }

  const days = Math.floor(hours / 24);
  return `há ${days} dia${days === 1 ? "" : "s"}`;
}
