import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildFeatureFlagContext,
  createBrowserFeatureFlags,
  getBrowserFeatureFlagConfig,
} from "./client.ts";

const context = buildFeatureFlagContext({ id: "user-1", organization_id: "org-1" });

test("frontend feature flags are disabled by default and preserve each fallback", async () => {
  let factoryCalls = 0;
  const service = await createBrowserFeatureFlags(
    getBrowserFeatureFlagConfig({}),
    context,
    async () => {
      factoryCalls += 1;
      throw new Error("provider não deveria ser acessado");
    },
  );

  assert.equal(service.status, "disabled");
  assert.equal(await service.isEnabled("future.flag", true), true);
  assert.equal(await service.isEnabled("future.flag", false), false);
  assert.equal(factoryCalls, 0);
});

test("frontend without a client-side ID is unconfigured", async () => {
  const service = await createBrowserFeatureFlags(
    getBrowserFeatureFlagConfig({ NEXT_PUBLIC_FEATURE_FLAGS_ENABLED: "true" }),
    context,
    async () => {
      throw new Error("provider não deveria ser acessado");
    },
  );

  assert.equal(service.status, "unconfigured");
  assert.equal(await service.isEnabled("future.flag", false), false);
});

test("frontend adapter evaluates flags and receives only user and organization keys", async () => {
  let receivedConfig;
  let receivedContext;
  const service = await createBrowserFeatureFlags(
    getBrowserFeatureFlagConfig({
      NEXT_PUBLIC_FEATURE_FLAGS_ENABLED: "true",
      NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_ID: "client-id",
    }),
    context,
    async (config, adapterContext) => {
      receivedConfig = config;
      receivedContext = adapterContext;
      return {
        variation: async () => true,
        identify: async () => undefined,
      };
    },
  );

  assert.equal(service.status, "ready");
  assert.equal(await service.isEnabled("future.flag", false), true);
  assert.deepEqual(receivedContext, {
    kind: "multi",
    user: { key: "user-1" },
    organization: { key: "org-1" },
  });
  assert.equal(receivedConfig.clientId, "client-id");
});

test("frontend initialization and evaluation failures use safe defaults", async () => {
  const initError = await createBrowserFeatureFlags(
    getBrowserFeatureFlagConfig({
      NEXT_PUBLIC_FEATURE_FLAGS_ENABLED: "true",
      NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_ID: "client-id",
    }),
    context,
    async () => {
      throw new Error("provider indisponível");
    },
  );

  assert.equal(initError.status, "init-error");
  assert.equal(await initError.isEnabled("future.flag", true), true);

  const unavailable = await createBrowserFeatureFlags(
    getBrowserFeatureFlagConfig({
      NEXT_PUBLIC_FEATURE_FLAGS_ENABLED: "true",
      NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_ID: "client-id",
    }),
    context,
    async () => ({
      variation: async () => {
        throw new Error("provider caiu");
      },
      identify: async () => undefined,
    }),
  );

  assert.equal(await unavailable.isEnabled("future.flag", false), false);
  assert.equal(unavailable.status, "unavailable");
});

test("frontend feature flags use a static provider import for webpack", async () => {
  const source = await readFile(new URL("./client.ts", import.meta.url), "utf8");

  assert.match(source, /await import\("@launchdarkly\/js-client-sdk"\)/);
  assert.doesNotMatch(source, /const moduleName: string/);
});
