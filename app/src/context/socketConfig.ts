const DEFAULT_SOCKET_URL = "http://localhost:3334";

export type SocketClientConfigEnv = Record<string, string | undefined> & {
  NEXT_PUBLIC_ENABLE_SOCKET?: string;
  NEXT_PUBLIC_SOCKET_URL?: string;
  NEXT_PUBLIC_API_URL?: string;
};

export type SocketClientConfig =
  | {
      enabled: false;
      url: null;
    }
  | {
      enabled: true;
      url: string;
    };

function normalizeEnvValue(value: string | undefined): string | null {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function isSocketEnabled(value: string | undefined): boolean {
  return normalizeEnvValue(value)?.toLowerCase() === "true";
}

export function getSocketClientConfig(env: SocketClientConfigEnv = process.env): SocketClientConfig {
  if (!isSocketEnabled(env.NEXT_PUBLIC_ENABLE_SOCKET)) {
    return {
      enabled: false,
      url: null,
    };
  }

  return {
    enabled: true,
    url:
      normalizeEnvValue(env.NEXT_PUBLIC_SOCKET_URL) ??
      normalizeEnvValue(env.NEXT_PUBLIC_API_URL) ??
      DEFAULT_SOCKET_URL,
  };
}
