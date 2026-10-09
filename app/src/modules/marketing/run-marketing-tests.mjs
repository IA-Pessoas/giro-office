import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { toInstagramProfileUrl } from "./utils/instagramProfile.ts";
import { createBirthdayCsv } from "./utils/birthdayCsv.ts";

const dashboard = await readFile(new URL("./components/MarketingDashboard.tsx", import.meta.url), "utf8");
const events = await readFile(new URL("./components/MarketingEvents.tsx", import.meta.url), "utf8");
const eventsService = await readFile(new URL("./services/marketingEventsService.ts", import.meta.url), "utf8");
const eventsHooks = await readFile(new URL("./hooks/useMarketingEvents.ts", import.meta.url), "utf8");
const editions = await readFile(new URL("./components/MarketingEventEditions.tsx", import.meta.url), "utf8");
const editionsSmoke = await readFile(new URL("./run-marketing-editions-browser-smoke.mjs", import.meta.url), "utf8");
const editionsService = await readFile(new URL("./services/marketingEventEditionsService.ts", import.meta.url), "utf8");
const editionsHooks = await readFile(new URL("./hooks/useMarketingEventEditions.ts", import.meta.url), "utf8");
const editionReport = await readFile(new URL("./components/MarketingEventEditionReport.tsx", import.meta.url), "utf8").catch(() => "");
const styles = await readFile(new URL("../../styles/global.css", import.meta.url), "utf8");
const service = await readFile(new URL("./services/marketingDashboardService.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../../pages/marketing/index.tsx", import.meta.url), "utf8");
const profiles = await readFile(new URL("./components/MarketingInstagramProfiles.tsx", import.meta.url), "utf8");
const users = await readFile(new URL("./components/MarketingUsers.tsx", import.meta.url), "utf8").catch(() => "");
const passwords = await readFile(new URL("./components/MarketingPasswords.tsx", import.meta.url), "utf8");
const passwordService = await readFile(new URL("./services/marketingPasswordService.ts", import.meta.url), "utf8");
const aiUsage = await readFile(new URL("./components/MarketingAiUsageControls.tsx", import.meta.url), "utf8");
const dashboardHook = await readFile(new URL("./hooks/useMarketingDashboard.ts", import.meta.url), "utf8");
const canonicalQueries = await readFile(new URL("./components/MarketingCanonicalQueries.tsx", import.meta.url), "utf8");
const marketingDepartments = await readFile(new URL("./components/MarketingDepartments.tsx", import.meta.url), "utf8");
const departmentService = await readFile(new URL("../../modules/departments/services/departmentService.ts", import.meta.url), "utf8");
const marketingQueryKeys = await import("./utils/marketingQueryKeys.ts").catch(() => null);

assert.equal(
  typeof marketingQueryKeys?.marketingQueryKey,
  "function",
  "Marketing query keys must include the authenticated user and organization scope.",
);
assert.deepEqual(
  marketingQueryKeys.marketingQueryKey(["marketing", "dashboard"], {
    organization_id: "org-a",
    id: "user-a",
  }),
  ["marketing", "dashboard", "org-a", "user-a"],
);
assert.notDeepEqual(
  marketingQueryKeys.marketingQueryKey(["marketing", "dashboard"], {
    organization_id: "org-a",
    id: "user-a",
  }),
  marketingQueryKeys.marketingQueryKey(["marketing", "dashboard"], {
    organization_id: "org-b",
    id: "user-b",
  }),
);
assert.match(aiUsage, /marketingQueryKey\(/);
assert.match(
  aiUsage,
  /setLegacyJson\("\[\]"\);[\s\S]*\[user\?\.id, user\?\.organization_id\]/,
);
assert.match(passwords, /marketingQueryKey\(/);
assert.match(
  passwords,
  /setRevealed\(null\);\s*setEditingId\(null\);[\s\S]*\[authUser\?\.id, authUser\?\.organization_id\]/,
);
assert.match(dashboardHook, /marketingQueryKey\(/);
assert.notDeepEqual(
  marketingQueryKeys.marketingQueryKey(["marketing", "dashboard"], {
    organization_id: "org-a",
    id: "user-a",
  }),
  marketingQueryKeys.marketingQueryKey(["marketing", "dashboard"], {
    organization_id: "org-a",
    id: "user-b",
  }),
);

assert.match(dashboard, /if \(query\.isLoading\)/);
assert.match(dashboard, /if \(query\.isError\)/);
assert.match(dashboard, /if \(!summary\)/);
assert.match(dashboard, /type="month"/);
assert.match(dashboard, /window\.print\(\)/);
assert.match(dashboard, /item\.department/);
assert.doesNotMatch(dashboard, /items\.slice\(0,\s*8\)/);
assert.match(dashboard, /query\.refetch\(\)/);
assert.match(service, /"\/marketing\/dashboard"/);
assert.doesNotMatch(dashboard, /campaigns|mockData|fakeData/i);
assert.doesNotMatch(page, /notFound:\s*true/);
assert.match(page, /MarketingDashboard/);
const editionsSmokePort = editionsSmoke.match(/--port", "(\d+)"/);
const editionsSmokeBasePort = editionsSmoke.match(/127\.0\.0\.1:(\d+)/);
assert.ok(editionsSmokePort && editionsSmokeBasePort, "Marketing editions smoke must use an explicit matching port.");
assert.equal(editionsSmokeBasePort[1], editionsSmokePort[1], "Marketing editions smoke must query the port it starts.");
assert.match(page, /MarketingInstagramProfiles/);
assert.match(page, /MarketingUsers/);
assert.match(page, /MarketingPasswords/);
assert.match(page, /MarketingCanonicalQueries/);
assert.match(page, /MarketingDepartments/);
assert.match(marketingDepartments, /useModuleAccess\("marketing"\)/);
assert.match(marketingDepartments, /access\.canView/);
assert.match(marketingDepartments, /access\.isAdmin/);
assert.match(marketingDepartments, /\(\) => departmentService\.listForMarketing\(\)/);
assert.match(marketingDepartments, /departmentService\.update\(department\.id, \{ color: nextColor \}\)/);
assert.doesNotMatch(marketingDepartments, /\{\s*(name|status|solution)\s*:/);
assert.match(departmentService, /params: \{ marketing: 'true' \}/);
assert.match(canonicalQueries, /href: "\/clients"/);
assert.match(canonicalQueries, /href: "\/users"/);
assert.match(canonicalQueries, /href: "\/departments"/);
assert.match(canonicalQueries, /canAccessAdministration/);
assert.match(dashboard, /Exportar CSV/);
assert.match(service, /params: \{ month \}/);
assert.match(profiles, /useModuleAccess\("marketing"\)/);
assert.match(users, /useModuleAccess\("marketing"\)/);
assert.match(users, /userService\.uploadPhoto/);
assert.doesNotMatch(users, /userService\.(update|getById|resetPassword)/);
assert.match(profiles, /aria-label=\{`Ver detalhes de \$\{client\.name\}`\}/);
assert.match(profiles, /user\?\.organization_id/);
assert.match(profiles, /user\?\.id/);
assert.match(profiles, /clientService\.listInstagramProfiles/);
assert.match(profiles, /clientService\.updateIntegration\(clientId, \{ instagram \}\)/);
assert.match(profiles, /QRCodeSVG/);
assert.match(passwords, /••••••••/);
assert.match(passwords, /<ConfirmationDialog/);
assert.doesNotMatch(passwords, /window\.confirm/);
assert.match(passwords, /Revelar a senha de/);
assert.match(passwords, /Exportar a senha de/);
assert.match(passwords, /marketingPasswordService\.reveal/);
assert.match(passwords, /marketingPasswordService\.export/);
assert.match(passwords, /if \(!access\.canEdit\) setRevealed\(null\);\s*if \(!access\.canEdit\) setConfirmation\(null\);/);
assert.match(
  passwords,
  /revealed\?\.organizationId === \(authUser\?\.organization_id \?\? null\)/,
);
assert.match(passwords, /access\.canEdit && currentReveal\?\.id === credential\.id/);
assert.doesNotMatch(passwords, /useMutation/);
assert.match(passwordService, /confirmed: true/);
assert.match(passwordService, /\/marketing\/passwords\/import/);

assert.equal(toInstagramProfileUrl("@giro.office"), "https://www.instagram.com/giro.office/");
assert.equal(
  toInstagramProfileUrl("https://instagram.com/giro.office/"),
  "https://www.instagram.com/giro.office/",
);
assert.equal(toInstagramProfileUrl("https://example.com/giro.office"), null);
assert.equal(toInstagramProfileUrl("javascript:alert(1)"), null);
assert.equal(
  createBirthdayCsv([{ type: "Colaborador", name: 'Ana "Nina"', date: "12/10", department: "RH" }]),
  '"Tipo","Nome","Data","Departamento"\r\n"Colaborador","Ana ""Nina""","12/10","RH"',
);
assert.match(createBirthdayCsv([{ type: "Cliente PF", name: "=HYPERLINK(1)", date: "08/10", department: "" }]), /'=HYPERLINK/);
assert.match(events, /query\.isLoading/);
assert.match(events, /query\.isError/);
assert.match(events, /query\.data\?\.length\s*===\s*0/);
assert.match(events, /createMutation\.mutateAsync|useCreateMarketingEvent/);
assert.match(events, /updateMutation\.mutateAsync|useUpdateMarketingEvent/);
assert.match(events, /name="logo"/);
assert.match(events, /name="priority"/);
assert.match(events, /name="objective"/);
assert.match(events, /name="audience"/);
assert.match(eventsService, /"\/marketing\/events\/list"/);
assert.match(eventsService, /"\/marketing\/events"/);
assert.match(eventsHooks, /invalidateQueries/);
assert.match(events, /MarketingEventEditions/);
assert.match(editionsService, /\/marketing\/events\/\$\{eventId\}\/editions/);
assert.match(editionsService, /\$\{editionId\}/);
assert.match(editionsHooks, /invalidateQueries/);
assert.match(editions, /budgetTotal/);
assert.match(editions, /Orçamento/);
assert.match(editions, /Marketing e comunicação/);
assert.match(editions, /Durante o evento/);
assert.match(editions, /Após o evento/);
assert.match(editions, /editing \? "Salvar edição"/);
assert.match(editions, /feedbackPeriodStart/);
assert.match(editions, /feedbackPeriodEnd/);
assert.match(editions, /type="datetime-local"/);
assert.match(editions, /createFeedback|rating/);
assert.match(editions, /disabled=\{[^}]*feedback/i);
assert.match(editions, /MarketingEventEditionReport/);
assert.match(editionsService, /createFeedback/);
assert.match(editionsService, /getReport/);
assert.match(editionsHooks, /useCreateMarketingEventEditionFeedback/);
assert.match(editionsHooks, /invalidateQueries/);
assert.match(editionReport, /window\.print\(\)/);
assert.match(editionReport, /budgetItems/);
assert.match(editionReport, /logistics/);
assert.match(editionReport, /marketingCommunication/);
assert.match(editionReport, /Antes do evento · marketing e comunicação/);
assert.match(editionReport, /duringEvent/);
assert.match(editionReport, /afterEvent/);
assert.match(editionReport, /feedback/);
assert.match(styles, /@media print/);
assert.match(styles, /marketing-event-edition-report/);
assert.doesNotMatch(page, /notFound:\s*true/);
assert.match(page, /MarketingDashboard/);
assert.match(page, /MarketingEvents/);

console.log("Marketing UI states, canonical API path, and module activation verified.");
