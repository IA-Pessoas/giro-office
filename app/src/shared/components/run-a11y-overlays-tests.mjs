import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appShellSource = readFileSync(
  new URL("./newLayout/AppShell.tsx", import.meta.url),
  "utf8",
);
const logDrawerSource = readFileSync(new URL("./LogDrawer/index.tsx", import.meta.url), "utf8");
const tasksSource = readFileSync(
  new URL("../../modules/integracao/components/TasksWorkspace.tsx", import.meta.url),
  "utf8",
);
const taskFormModalSource = readFileSync(
  new URL("../../modules/integracao/components/TaskFormModal.tsx", import.meta.url),
  "utf8",
);
const taskModelModalSource = readFileSync(
  new URL("../../modules/integracao/components/TaskModelModal.tsx", import.meta.url),
  "utf8",
);
const taskModelsConfigSource = readFileSync(
  new URL("../../pages/configs/integracao/tasks/index.tsx", import.meta.url),
  "utf8",
);
const legacyAiChatBackdrop = [
  'className="fixed inset-0 z-[60] bg-black/40"',
  " onClick",
].join("");
const legacyLogDrawerOverlay = [
  "className={styles.overlay}",
  " onClick",
].join("");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("AppShell has Escape handling for lightweight overlays", () => {
  assert.match(appShellSource, /event\.key !== "Escape"/);
  assert.match(appShellSource, /setShowNotifications\(false\)/);
  assert.match(appShellSource, /setShowUserMenu\(false\)/);
  assert.match(appShellSource, /setShowAiChat\(false\)/);
  assert.match(appShellSource, /document\.addEventListener\("keydown"/);
});

runTest("AppShell lightweight overlay backdrops are hidden from assistive tech", () => {
  assert.match(appShellSource, /aria-hidden="true"[\s\S]*setShowNotifications\(false\)/);
  assert.match(appShellSource, /aria-hidden="true"[\s\S]*setShowUserMenu\(false\)/);
});

runTest("AppShell menu triggers expose expanded state and controlled panels", () => {
  assert.match(appShellSource, /const NOTIFICATIONS_PANEL_ID = "app-shell-notifications-panel";/);
  assert.match(appShellSource, /const USER_MENU_PANEL_ID = "app-shell-user-menu";/);
  assert.match(appShellSource, /aria-expanded=\{showNotifications\}/);
  assert.match(appShellSource, /aria-controls=\{NOTIFICATIONS_PANEL_ID\}/);
  assert.match(appShellSource, /id=\{NOTIFICATIONS_PANEL_ID\}/);
  assert.match(appShellSource, /aria-expanded=\{showUserMenu\}/);
  assert.match(appShellSource, /aria-controls=\{USER_MENU_PANEL_ID\}/);
  assert.match(appShellSource, /id=\{USER_MENU_PANEL_ID\}/);
});

runTest("AppShell AI chat uses Radix Dialog primitives", () => {
  assert.match(appShellSource, /import \* as DialogPrimitive from "@radix-ui\/react-dialog";/);
  assert.match(appShellSource, /<DialogPrimitive\.Root[\s\S]*open=\{showAiChat\}/);
  assert.match(appShellSource, /<DialogPrimitive\.Overlay/);
  assert.match(appShellSource, /<DialogPrimitive\.Content/);
  assert.match(appShellSource, /<DialogPrimitive\.Title/);
  assert.match(appShellSource, /<DialogPrimitive\.Description/);
  assert.equal(appShellSource.includes(legacyAiChatBackdrop), false);
});

runTest("LogDrawer uses Radix Dialog primitives", () => {
  assert.match(logDrawerSource, /import \* as DialogPrimitive from "@radix-ui\/react-dialog";/);
  assert.match(logDrawerSource, /<DialogPrimitive\.Root/);
  assert.match(logDrawerSource, /<DialogPrimitive\.Trigger asChild/);
  assert.match(logDrawerSource, /<DialogPrimitive\.Overlay/);
  assert.match(logDrawerSource, /<DialogPrimitive\.Content/);
  assert.match(logDrawerSource, /<DialogPrimitive\.Title/);
  assert.match(logDrawerSource, /<DialogPrimitive\.Description/);
  assert.match(logDrawerSource, /<DialogPrimitive\.Close asChild/);
  assert.equal(logDrawerSource.includes("onClick={(event) => event.stopPropagation()}"), false);
  assert.equal(logDrawerSource.includes(legacyLogDrawerOverlay), false);
});

runTest("Integracao task modals remain on shared Dialog", () => {
  assert.match(tasksSource, /<TaskFormModal/);
  assert.match(taskFormModalSource, /import \{ Dialog \} from "@shared\/components\/ui\/Dialog";/);
  assert.match(taskFormModalSource, /<Dialog/);
  assert.match(taskModelModalSource, /<Dialog/);
  assert.match(taskModelsConfigSource, /<Dialog/);
});
