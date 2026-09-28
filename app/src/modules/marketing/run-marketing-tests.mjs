import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dashboard = await readFile(new URL("./components/MarketingDashboard.tsx", import.meta.url), "utf8");
const service = await readFile(new URL("./services/marketingDashboardService.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../../pages/marketing/index.tsx", import.meta.url), "utf8");

assert.match(dashboard, /if \(query\.isLoading\)/);
assert.match(dashboard, /if \(query\.isError\)/);
assert.match(dashboard, /if \(!summary\)/);
assert.match(dashboard, /if \(noData\)/);
assert.match(dashboard, /query\.refetch\(\)/);
assert.match(service, /"\/marketing\/dashboard"/);
assert.doesNotMatch(dashboard, /campaigns|mockData|fakeData/i);
assert.match(page, /notFound:\s*true/);
assert.doesNotMatch(page, /MarketingDashboard/);

console.log("Marketing UI states, canonical API path, and activation gate verified.");
