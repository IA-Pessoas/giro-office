import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { toInstagramProfileUrl } from "./utils/instagramProfile.ts";

const dashboard = await readFile(new URL("./components/MarketingDashboard.tsx", import.meta.url), "utf8");
const service = await readFile(new URL("./services/marketingDashboardService.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../../pages/marketing/index.tsx", import.meta.url), "utf8");
const profiles = await readFile(new URL("./components/MarketingInstagramProfiles.tsx", import.meta.url), "utf8");

assert.match(dashboard, /if \(query\.isLoading\)/);
assert.match(dashboard, /if \(query\.isError\)/);
assert.match(dashboard, /if \(!summary\)/);
assert.match(dashboard, /if \(noData\)/);
assert.match(dashboard, /query\.refetch\(\)/);
assert.match(service, /"\/marketing\/dashboard"/);
assert.doesNotMatch(dashboard, /campaigns|mockData|fakeData/i);
assert.doesNotMatch(page, /notFound:\s*true/);
assert.match(page, /MarketingDashboard/);
assert.match(page, /MarketingInstagramProfiles/);
assert.match(profiles, /useModuleAccess\("integracao"\)/);
assert.match(profiles, /user\?\.organization_id/);
assert.match(profiles, /user\?\.id/);
assert.match(profiles, /clientService\.listInstagramProfiles/);
assert.match(profiles, /clientService\.updateIntegration\(clientId, \{ instagram \}\)/);
assert.match(profiles, /QRCodeSVG/);

assert.equal(toInstagramProfileUrl("@giro.office"), "https://www.instagram.com/giro.office/");
assert.equal(
  toInstagramProfileUrl("https://instagram.com/giro.office/"),
  "https://www.instagram.com/giro.office/",
);
assert.equal(toInstagramProfileUrl("https://example.com/giro.office"), null);
assert.equal(toInstagramProfileUrl("javascript:alert(1)"), null);

console.log("Marketing UI states, canonical API path, and activation gate verified.");
