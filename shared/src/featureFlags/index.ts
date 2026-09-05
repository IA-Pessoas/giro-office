export type FeatureFlagStatus =
  | "disabled"
  | "unconfigured"
  | "ready"
  | "unavailable"
  | "init-error";

export interface FeatureFlagContext {
  userId?: string;
  organizationId?: string | null;
}

export interface FeatureFlagAdapter {
  boolVariation(
    flagKey: string,
    context: FeatureFlagContext,
    defaultValue: boolean,
  ): Promise<boolean>;
  close?(): Promise<void>;
}

export interface FeatureFlagConfig {
  enabled: boolean;
  sdkKey?: string;
  initTimeoutMs: number;
  serviceName: string;
}

export type FeatureFlagAdapterFactory = (
  config: FeatureFlagConfig,
) => Promise<FeatureFlagAdapter> | FeatureFlagAdapter;

export interface FeatureFlagService {
  readonly status: FeatureFlagStatus;
  isEnabled(flagKey: string, defaultValue: boolean, context?: FeatureFlagContext): Promise<boolean>;
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
  return normalized ? normalized : undefined;
}

export function getFeatureFlagConfig(
  source: NodeJS.ProcessEnv = process.env,
  serviceName: string,
): FeatureFlagConfig {
  return {
    enabled: parseBoolean(source.FEATURE_FLAGS_ENABLED),
    sdkKey: normalizeOptionalString(source.LAUNCHDARKLY_SDK_KEY),
    initTimeoutMs: parseTimeout(source.LAUNCHDARKLY_INIT_TIMEOUT_MS),
    serviceName,
  };
}

function createTimeoutError(timeoutMs: number): Error {
  return new Error(`Inicialização de feature flags excedeu ${timeoutMs}ms.`);
}

async function initializeAdapter(
  config: FeatureFlagConfig,
  adapterFactory: FeatureFlagAdapterFactory,
): Promise<FeatureFlagAdapter> {
  let timedOut = false;
  let timeoutHandle: NodeJS.Timeout | undefined;
  const adapterPromise = Promise.resolve(adapterFactory(config));

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
      new Promise<FeatureFlagAdapter>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          reject(createTimeoutError(config.initTimeoutMs));
        }, config.initTimeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

class DefaultFeatureFlagService implements FeatureFlagService {
  private currentStatus: FeatureFlagStatus;

  public constructor(
    status: FeatureFlagStatus,
    private readonly adapter?: FeatureFlagAdapter,
  ) {
    this.currentStatus = status;
  }

  public get status(): FeatureFlagStatus {
    return this.currentStatus;
  }

  public async isEnabled(
    flagKey: string,
    defaultValue: boolean,
    context: FeatureFlagContext = {},
  ): Promise<boolean> {
    if (!this.adapter) {
      return defaultValue;
    }

    try {
      return await this.adapter.boolVariation(flagKey, context, defaultValue);
    } catch {
      this.currentStatus = "unavailable";
      return defaultValue;
    }
  }

  public async close(): Promise<void> {
    await this.adapter?.close?.();
  }
}

export async function createFeatureFlags(
  config: FeatureFlagConfig,
  adapterFactory?: FeatureFlagAdapterFactory,
): Promise<FeatureFlagService> {
  if (!config.enabled) {
    return new DefaultFeatureFlagService("disabled");
  }

  if (!config.sdkKey) {
    return new DefaultFeatureFlagService("unconfigured");
  }

  try {
    const adapter = await initializeAdapter(
      config,
      adapterFactory ??
        ((adapterConfig) =>
          import("./launchDarklyAdapter.js").then((module) =>
            module.createLaunchDarklyAdapter(adapterConfig),
          )),
    );
    return new DefaultFeatureFlagService("ready", adapter);
  } catch {
    return new DefaultFeatureFlagService("init-error");
  }
}
