import type { FeatureFlagAdapter, FeatureFlagConfig, FeatureFlagContext } from "./index.js";

interface LaunchDarklyClient {
  boolVariation(
    flagKey: string,
    context: Record<string, unknown>,
    defaultValue: boolean,
  ): Promise<boolean>;
  close(): Promise<void>;
  waitForInitialization(options: { timeoutSeconds: number }): Promise<LaunchDarklyClient>;
}

interface LaunchDarklyModule {
  init(sdkKey: string): LaunchDarklyClient;
}

function toLaunchDarklyContext(
  context: FeatureFlagContext,
  serviceName: string,
): Record<string, unknown> {
  if (context.userId && context.organizationId) {
    return {
      kind: "multi",
      user: { key: context.userId },
      organization: { key: context.organizationId },
    };
  }

  return {
    kind: "user",
    key: context.userId ?? `service:${serviceName}`,
  };
}

export async function createLaunchDarklyAdapter(
  config: FeatureFlagConfig,
): Promise<FeatureFlagAdapter> {
  const moduleName: string = "@launchdarkly/node-server-sdk";
  const launchDarkly = (await import(moduleName)) as unknown as LaunchDarklyModule;
  const client = launchDarkly.init(config.sdkKey as string);
  await client.waitForInitialization({ timeoutSeconds: config.initTimeoutMs / 1_000 });

  return {
    boolVariation: (flagKey, context, defaultValue) =>
      client.boolVariation(
        flagKey,
        toLaunchDarklyContext(context, config.serviceName),
        defaultValue,
      ),
    close: () => client.close(),
  };
}
