export type BrowserFeatureFlagStatus =
  | "disabled"
  | "unconfigured"
  | "ready"
  | "unavailable"
  | "init-error";

export interface BrowserFeatureFlagContext {
  kind: "user" | "multi";
  key?: string;
  anonymous?: boolean;
  user?: { key: string };
  organization?: { key: string };
}

export interface BrowserFeatureFlagConfig {
  enabled: boolean;
  clientId?: string;
  initTimeoutMs: number;
}

export interface BrowserFeatureFlagAdapter {
  variation(flagKey: string, defaultValue: boolean): boolean | Promise<boolean>;
  identify(context: BrowserFeatureFlagContext): Promise<void>;
  close?(): void | Promise<void>;
}

export type BrowserFeatureFlagAdapterFactory = (
  config: BrowserFeatureFlagConfig,
  context: BrowserFeatureFlagContext,
) => Promise<BrowserFeatureFlagAdapter> | BrowserFeatureFlagAdapter;

export interface BrowserFeatureFlagService {
  readonly status: BrowserFeatureFlagStatus;
  isEnabled(flagKey: string, defaultValue: boolean): Promise<boolean>;
  identify(context: BrowserFeatureFlagContext): Promise<void>;
  close(): Promise<void>;
}

const DEFAULT_INIT_TIMEOUT_MS = 3_000;

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

function parseTimeout(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_INIT_TIMEOUT_MS;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function getBrowserFeatureFlagConfig(
  source: Record<string, string | undefined> = process.env,
): BrowserFeatureFlagConfig {
  return {
    enabled: parseBoolean(source.NEXT_PUBLIC_FEATURE_FLAGS_ENABLED),
    clientId: normalizeOptionalString(source.NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_ID),
    initTimeoutMs: parseTimeout(source.NEXT_PUBLIC_LAUNCHDARKLY_INIT_TIMEOUT_MS),
  };
}

export function buildFeatureFlagContext(user?: {
  id?: string | null;
  organization_id?: string | null;
} | null): BrowserFeatureFlagContext {
  const userId = user?.id?.trim();
  const organizationId = user?.organization_id?.trim();

  if (!userId) {
    return { kind: "user", key: "anonymous", anonymous: true };
  }

  if (!organizationId) {
    return { kind: "user", key: userId };
  }

  return {
    kind: "multi",
    user: { key: userId },
    organization: { key: organizationId },
  };
}

function createDefaultService(status: BrowserFeatureFlagStatus): BrowserFeatureFlagService {
  return {
    status,
    isEnabled: async (_flagKey, defaultValue) => defaultValue,
    identify: async () => undefined,
    close: async () => undefined,
  };
}

export function createDisabledBrowserFeatureFlags(): BrowserFeatureFlagService {
  return createDefaultService("disabled");
}

async function initializeAdapter(
  config: BrowserFeatureFlagConfig,
  context: BrowserFeatureFlagContext,
  factory: BrowserFeatureFlagAdapterFactory,
): Promise<BrowserFeatureFlagAdapter> {
  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const adapterPromise = Promise.resolve(factory(config, context));

  adapterPromise.then(
    (adapter) => {
      if (timedOut) {
        void adapter.close?.();
      }
    },
    () => undefined,
  );

  try {
    return await Promise.race([
      adapterPromise,
      new Promise<BrowserFeatureFlagAdapter>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          reject(new Error(`Inicialização de feature flags excedeu ${config.initTimeoutMs}ms.`));
        }, config.initTimeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

class AdapterFeatureFlagService implements BrowserFeatureFlagService {
  private currentStatus: BrowserFeatureFlagStatus;
  private readonly adapter: BrowserFeatureFlagAdapter;

  public constructor(adapter: BrowserFeatureFlagAdapter) {
    this.adapter = adapter;
    this.currentStatus = "ready";
  }

  public get status(): BrowserFeatureFlagStatus {
    return this.currentStatus;
  }

  public async isEnabled(flagKey: string, defaultValue: boolean): Promise<boolean> {
    try {
      const value = await this.adapter.variation(flagKey, defaultValue);
      return typeof value === "boolean" ? value : defaultValue;
    } catch {
      this.currentStatus = "unavailable";
      return defaultValue;
    }
  }

  public async identify(context: BrowserFeatureFlagContext): Promise<void> {
    try {
      await this.adapter.identify(context);
    } catch {
      this.currentStatus = "unavailable";
    }
  }

  public async close(): Promise<void> {
    await this.adapter.close?.();
  }
}

async function createLaunchDarklyAdapter(
  config: BrowserFeatureFlagConfig,
  context: BrowserFeatureFlagContext,
): Promise<BrowserFeatureFlagAdapter> {
  const moduleName: string = "@launchdarkly/js-client-sdk";
  const launchDarkly = (await import(moduleName)) as {
    createClient: (
      clientId: string,
      context: BrowserFeatureFlagContext,
      options: { streaming: boolean; fetchGoals: boolean },
    ) => {
      start(): Promise<unknown>;
      waitForInitialization(options: { timeout: number }): Promise<{ status: string }>;
      variation(flagKey: string, defaultValue: boolean): unknown;
      identify(context: BrowserFeatureFlagContext): Promise<unknown>;
      close(): void;
    };
  };
  const client = launchDarkly.createClient(config.clientId as string, context, {
    streaming: false,
    fetchGoals: false,
  });

  void client.start();
  const result = await client.waitForInitialization({ timeout: config.initTimeoutMs / 1_000 });
  if (result.status !== "complete") {
    throw new Error(`LaunchDarkly não inicializou: ${result.status}.`);
  }

  return {
    variation: (flagKey, defaultValue) => {
      const value = client.variation(flagKey, defaultValue);
      return typeof value === "boolean" ? value : defaultValue;
    },
    identify: async (nextContext) => {
      await client.identify(nextContext);
    },
    close: () => client.close(),
  };
}

export async function createBrowserFeatureFlags(
  config: BrowserFeatureFlagConfig,
  context: BrowserFeatureFlagContext,
  adapterFactory: BrowserFeatureFlagAdapterFactory = createLaunchDarklyAdapter,
): Promise<BrowserFeatureFlagService> {
  if (!config.enabled) {
    return createDefaultService("disabled");
  }

  if (!config.clientId) {
    return createDefaultService("unconfigured");
  }

  try {
    const adapter = await initializeAdapter(config, context, adapterFactory);
    return new AdapterFeatureFlagService(adapter);
  } catch {
    return createDefaultService("init-error");
  }
}
