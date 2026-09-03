import assert from "node:assert/strict";
import test from "node:test";

import {
  createFeatureFlags,
  type FeatureFlagAdapter,
  type FeatureFlagContext,
  getFeatureFlagConfig,
} from "../src/featureFlags/index.ts";

const context: FeatureFlagContext = {
  userId: "user-1",
  organizationId: "organization-1",
};

test("environment configuration is disabled by default and normalizes the timeout", () => {
  const config = getFeatureFlagConfig(
    {
      FEATURE_FLAGS_ENABLED: "true",
      LAUNCHDARKLY_SDK_KEY: "  server-sdk-key  ",
      LAUNCHDARKLY_INIT_TIMEOUT_MS: "2500",
    },
    "shared-test",
  );

  assert.deepEqual(config, {
    enabled: true,
    sdkKey: "server-sdk-key",
    initTimeoutMs: 2500,
    serviceName: "shared-test",
  });
});

test("invalid environment timeout uses the deterministic safe default", () => {
  const config = getFeatureFlagConfig(
    { LAUNCHDARKLY_INIT_TIMEOUT_MS: "not-a-number" },
    "shared-test",
  );

  assert.equal(config.enabled, false);
  assert.equal(config.initTimeoutMs, 3_000);
});

test("disabled flags return the supplied default without creating an adapter", async () => {
  let factoryCalls = 0;

  const featureFlags = await createFeatureFlags(
    {
      enabled: false,
      serviceName: "shared-test",
      initTimeoutMs: 3_000,
    },
    async () => {
      factoryCalls += 1;
      throw new Error("não deveria acessar o provider");
    },
  );

  assert.equal(featureFlags.status, "disabled");
  assert.equal(await featureFlags.isEnabled("future.flag", true, context), true);
  assert.equal(await featureFlags.isEnabled("future.flag", false, context), false);
  assert.equal(factoryCalls, 0);
});

test("missing SDK key is unconfigured and keeps defaults deterministic", async () => {
  let factoryCalls = 0;

  const featureFlags = await createFeatureFlags(
    {
      enabled: true,
      serviceName: "shared-test",
      initTimeoutMs: 3_000,
    },
    async () => {
      factoryCalls += 1;
      throw new Error("não deveria inicializar sem chave");
    },
  );

  assert.equal(featureFlags.status, "unconfigured");
  assert.equal(await featureFlags.isEnabled("future.flag", false), false);
  assert.equal(factoryCalls, 0);
});

test("ready adapter evaluates flags with the minimal context", async () => {
  let receivedContext: FeatureFlagContext | undefined;
  const adapter: FeatureFlagAdapter = {
    boolVariation: async (_key, received, fallback) => {
      receivedContext = received;
      return fallback;
    },
  };

  const featureFlags = await createFeatureFlags(
    {
      enabled: true,
      sdkKey: "server-sdk-key",
      serviceName: "shared-test",
      initTimeoutMs: 3_000,
    },
    async () => adapter,
  );

  assert.equal(featureFlags.status, "ready");
  assert.equal(await featureFlags.isEnabled("future.flag", true, context), true);
  assert.deepEqual(receivedContext, context);
});

test("initialization errors return defaults and expose init-error", async () => {
  const featureFlags = await createFeatureFlags(
    {
      enabled: true,
      sdkKey: "server-sdk-key",
      serviceName: "shared-test",
      initTimeoutMs: 3_000,
    },
    async () => {
      throw new Error("provider indisponível");
    },
  );

  assert.equal(featureFlags.status, "init-error");
  assert.equal(await featureFlags.isEnabled("future.flag", true), true);
});

test("evaluation errors return the default and expose unavailable", async () => {
  const featureFlags = await createFeatureFlags(
    {
      enabled: true,
      sdkKey: "server-sdk-key",
      serviceName: "shared-test",
      initTimeoutMs: 3_000,
    },
    async () => ({
      boolVariation: async () => {
        throw new Error("provider caiu");
      },
    }),
  );

  assert.equal(featureFlags.status, "ready");
  assert.equal(await featureFlags.isEnabled("future.flag", false), false);
  assert.equal(featureFlags.status, "unavailable");
});

test("close delegates lifecycle cleanup to the adapter", async () => {
  let closeCalls = 0;
  const featureFlags = await createFeatureFlags(
    {
      enabled: true,
      sdkKey: "server-sdk-key",
      serviceName: "shared-test",
      initTimeoutMs: 3_000,
    },
    async () => ({
      boolVariation: async (_key, _context, defaultValue) => defaultValue,
      close: async () => {
        closeCalls += 1;
      },
    }),
  );

  await featureFlags.close();

  assert.equal(closeCalls, 1);
});

test("initialization timeout is isolated as init-error", async () => {
  const featureFlags = await createFeatureFlags(
    {
      enabled: true,
      sdkKey: "server-sdk-key",
      serviceName: "shared-test",
      initTimeoutMs: 5,
    },
    () => new Promise<FeatureFlagAdapter>(() => undefined),
  );

  assert.equal(featureFlags.status, "init-error");
  assert.equal(await featureFlags.isEnabled("future.flag", true), true);
});
