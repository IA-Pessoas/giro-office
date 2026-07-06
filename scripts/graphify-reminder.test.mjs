import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildGraphifyReminder } from "./graphify-reminder.mjs";

describe("buildGraphifyReminder", () => {
  it("prints scoped commands when Graphify is installed", () => {
    const message = buildGraphifyReminder({ hookName: "post-merge", hasGraphify: true });

    assert.match(message, /post-merge executado/);
    assert.match(message, /Graphify instalado localmente/);
    assert.match(message, /pnpm graphify:refresh/);
    assert.match(message, /pnpm graphify:update:ui/);
    assert.match(message, /pnpm graphify:update:services/);
  });

  it("points agents to the manual fallback when the tool is unavailable", () => {
    const message = buildGraphifyReminder({ hookName: "post-checkout", hasGraphify: false });

    assert.match(message, /post-checkout executado/);
    assert.match(message, /fallback manual do AGENTS\.md/);
  });

  it("suggests only the frontend graph when changed paths are under app", () => {
    const message = buildGraphifyReminder({
      hookName: "post-merge",
      hasGraphify: true,
      changedPaths: ["app/src/pages/home/index.tsx"],
    });

    assert.match(message, /pnpm graphify:update:ui/);
    assert.doesNotMatch(message, /pnpm graphify:update:services/);
  });

  it("suggests only the services graph when changed paths are under services", () => {
    const message = buildGraphifyReminder({
      hookName: "post-merge",
      hasGraphify: true,
      changedPaths: ["services/rh-service/src/app.ts"],
    });

    assert.match(message, /pnpm graphify:update:services/);
    assert.doesNotMatch(message, /pnpm graphify:update:ui/);
  });
});
