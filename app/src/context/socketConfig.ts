export type SocketClientConfigEnv = Record<string, string | undefined>;

export type SocketClientConfig =
  | {
      enabled: false;
      url: null;
    }
  | {
      enabled: true;
      url: string;
    };

export function getSocketClientConfig(_env: SocketClientConfigEnv = process.env): SocketClientConfig {
  return {
    enabled: false,
    url: null,
  };
}
