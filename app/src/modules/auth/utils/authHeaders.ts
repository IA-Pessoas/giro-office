export type BearerAuthHeaders = {
  Authorization: string;
};

export function getAuthTokenValue(token?: string | null) {
  const normalizedToken = typeof token === "string" ? token.trim() : "";

  return normalizedToken.length > 0 ? normalizedToken : null;
}

export function createBearerAuthHeaders(token?: string | null): BearerAuthHeaders | null {
  const authToken = getAuthTokenValue(token);

  if (!authToken) {
    return null;
  }

  return {
    Authorization: `Bearer ${authToken}`,
  };
}
