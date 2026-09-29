const INSTAGRAM_USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/;
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);

export function toInstagramProfileUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  let username = candidate.startsWith("@") ? candidate.slice(1) : candidate;
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      if (
        url.protocol !== "https:" ||
        !INSTAGRAM_HOSTS.has(url.hostname.toLowerCase()) ||
        url.search ||
        url.hash
      ) {
        return null;
      }
      const pathParts = url.pathname.split("/").filter(Boolean);
      if (pathParts.length !== 1) return null;
      username = pathParts[0] ?? "";
    } catch {
      return null;
    }
  }

  if (!INSTAGRAM_USERNAME_PATTERN.test(username)) return null;
  return `https://www.instagram.com/${username}/`;
}
