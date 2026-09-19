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
const configuracoesSource = readFileSync(
  new URL("./newLayout/Configuracoes.tsx", import.meta.url),
  "utf8",
);
const myOrganizationSectionSource = readFileSync(
  new URL("../../modules/organizations/ui/MyOrganizationSection.tsx", import.meta.url),
  "utf8",
);
const dialogSource = readFileSync(new URL("./ui/Dialog.tsx", import.meta.url), "utf8");
const confirmationDialogSource = readFileSync(
  new URL("./ui/ConfirmationDialog.tsx", import.meta.url),
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

runTest("AppShell sidebar toggle sits in the header and exposes an accessible name", () => {
  const toggleStart = appShellSource.indexOf("toggleSidebar();");
  const toggleSource = appShellSource.slice(toggleStart - 500, toggleStart + 700);

  assert.notEqual(toggleStart, -1);
  assert.match(toggleSource, /event\.stopPropagation\(\);/);
  assert.match(toggleSource, /aria-label=\{sidebarToggleLabel\}/);
  assert.match(toggleSource, /title=\{sidebarToggleLabel\}/);
  assert.match(toggleSource, /h-9 w-9/);
  assert.match(toggleSource, /justify-center px-2/);
  assert.match(toggleSource, /\{shouldExpandSidebar \? <Logo showText \/> : null\}/);
  assert.doesNotMatch(toggleSource, /absolute -right-3 top-20/);
});

runTest("AppShell sidebar preview opens temporarily and pins only by click", () => {
  assert.match(appShellSource, /const \[isSidebarPreviewOpen, setIsSidebarPreviewOpen\] = useState\(false\);/);
  assert.match(appShellSource, /const shouldExpandSidebar = isSidebarOpen \|\| isSidebarPreviewOpen;/);
  assert.match(appShellSource, /const sidebarToggleLabel = isSidebarOpen/);
  assert.match(appShellSource, /\? "Fixar sidebar aberta"/);
  assert.match(appShellSource, /const openSidebarPreview = \(\) => \{/);
  assert.match(appShellSource, /const closeSidebarPreview = \(\) => \{/);
  assert.match(appShellSource, /const pinSidebarOpen = \(\) => \{/);
  assert.match(appShellSource, /onMouseEnter=\{openSidebarPreview\}/);
  assert.match(appShellSource, /onMouseLeave=\{closeSidebarPreview\}/);
  assert.match(appShellSource, /onFocus=\{openSidebarPreview\}/);
  assert.match(appShellSource, /onClick=\{pinSidebarOpen\}/);
  assert.match(appShellSource, /if \(isMobileMenuOpen \|\| isSidebarPreviewOpen\)/);
  assert.match(appShellSource, /if \(isSidebarPreviewOpen\) setIsSidebarPreviewOpen\(false\);/);
  assert.match(appShellSource, /className=\{`flex flex-col min-h-screen transition-all duration-300 \$\{isSidebarOpen \? "lg:ml-64" : "lg:ml-20"\}`\}/);
});

runTest("AppShell header notifications do not embed mock notification rows", () => {
  assert.equal(appShellSource.includes("Novo chamado crítico aberto"), false);
  assert.equal(appShellSource.includes("Prazo de tarefa próximo do vencimento"), false);
  assert.equal(appShellSource.includes("Backup diário finalizado"), false);
  // O sino junta duas origens desde o merge das notificacoes de RH com as de tarefa.
  assert.match(
    appShellSource,
    /const taskNotifications: AppShellNotification\[] = \(notificationQuery\.data\?\.items \?\? \[]\)/,
  );
  assert.match(
    appShellSource,
    /const rhNotifications: AppShellNotification\[] = \(rhNotificationsQuery\.data \?\? \[]\)/,
  );
  assert.match(
    appShellSource,
    /const hasUnreadNotifications = notifications\.some\(\(item\) => item\.unread\);/,
  );
  assert.match(appShellSource, /hasUnreadNotifications \?/);
  assert.match(appShellSource, /Nenhuma notificação encontrada\./);
});

runTest("AppShell header notifications expose loading, retryable error, and empty states", () => {
  assert.match(
    appShellSource,
    /const isNotificationsLoading = notificationQuery\.isLoading \|\| rhNotificationsQuery\.isLoading;/,
  );
  assert.match(
    appShellSource,
    /const hasNotificationsError = notificationQuery\.isError \|\| rhNotificationsQuery\.isError;/,
  );
  assert.match(appShellSource, /Carregando notificações\.\.\./);
  assert.match(appShellSource, /Não foi possível carregar todas as notificações\./);
  assert.match(appShellSource, /notificationQuery\.isError[\s\S]*notificationQuery\.refetch\(\)/);
  assert.match(appShellSource, /rhNotificationsQuery\.isError[\s\S]*rhNotificationsQuery\.refetch\(\)/);
  assert.match(appShellSource, />\s*Tentar novamente\s*<\/button>/);
  assert.match(
    appShellSource,
    /!isNotificationsLoading && !hasNotificationsError[\s\S]*Nenhuma notificação encontrada\./,
  );
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

runTest("shared Dialog constrains content and scrolls only its body", () => {
  assert.match(
    dialogSource,
    /<DialogPrimitive\.Content[\s\S]*className=\{`[^`]*max-h-\[calc\(100dvh-2rem\)\][^`]*flex-col[^`]*overflow-hidden[^`]*`\}/,
  );
  assert.match(dialogSource, /<header className="[^"]*shrink-0[^"]*"/);
  assert.match(
    dialogSource,
    /<div\s+className=\{`[^`]*min-h-0[^`]*flex-1[^`]*overflow-y-auto[^`]*overscroll-contain[^`]*\$\{bodyClassName\}[^`]*`\}/,
  );
  assert.match(dialogSource, /<footer className="[^"]*shrink-0[^"]*"/);
});

runTest("shared Dialog animates close without trapping interaction in the exiting content", () => {
  const overlayClass =
    dialogSource.match(/<DialogPrimitive\.Overlay[\s\S]*?className=\{`([^`]*)`\}/)?.[1] ?? "";
  const contentClass =
    dialogSource.match(/<DialogPrimitive\.Content[\s\S]*?className=\{`([^`]*)`\}/)?.[1] ?? "";

  assert.match(overlayClass, /data-\[state=open\]:animate-in/);
  assert.match(overlayClass, /data-\[state=closed\]:animate-out/);
  assert.match(overlayClass, /data-\[state=open\]:fade-in-0/);
  assert.match(overlayClass, /data-\[state=closed\]:fade-out-0/);
  assert.match(overlayClass, /motion-reduce:animate-none/);

  assert.match(contentClass, /data-\[state=open\]:fade-in-0/);
  assert.match(contentClass, /data-\[state=open\]:zoom-in-95/);
  assert.match(contentClass, /data-\[state=closed\]:fade-out-0/);
  assert.match(contentClass, /data-\[state=closed\]:zoom-out-95/);
  assert.match(contentClass, /data-\[state=closed\]:pointer-events-none/);
  assert.match(contentClass, /motion-reduce:animate-none/);
});

runTest("ConfirmationDialog composes the shared Dialog with explicit action controls", () => {
  assert.match(confirmationDialogSource, /import \{ Dialog \} from "\.\/Dialog";/);
  assert.match(confirmationDialogSource, /<Dialog[\s\S]*preventClose=\{isConfirming\}/);
});

runTest("MyOrganizationSection opens organization editing in a shared Dialog", () => {
  assert.match(myOrganizationSectionSource, /import \{ Dialog \} from "@shared\/components";/);
  assert.match(myOrganizationSectionSource, /<Dialog[\s\S]*title="Editar organização"/);
  assert.match(myOrganizationSectionSource, /open=\{isEditDialogOpen\}/);
  assert.equal(myOrganizationSectionSource.includes("isEditSectionOpen ?"), false);
});

runTest("Configuracoes opens access editing in a shared Dialog", () => {
  assert.match(configuracoesSource, /import \{ Dialog \} from "@shared\/components";/);
  assert.match(configuracoesSource, /<Dialog[\s\S]*title="Editar dados de acesso"/);
  assert.match(configuracoesSource, /open=\{isAccessDialogOpen\}/);
  assert.equal(configuracoesSource.includes("isAccessSectionOpen ?"), false);
});

runTest("Configuracoes scopes the profile save action to the photo block", () => {
  assert.equal(configuracoesSource.includes("Salvar alterações"), false);
  assert.equal(configuracoesSource.includes("handleSaveProfile"), false);
  assert.match(configuracoesSource, /const canSavePhoto =/);
  assert.match(configuracoesSource, /const handleSavePhoto = async \(\) => \{/);
  assert.match(configuracoesSource, /onClick=\{\(\) => void handleSavePhoto\(\)\}/);
  assert.match(configuracoesSource, /disabled=\{!canSavePhoto\}/);
  assert.match(configuracoesSource, /Salvar foto/);
});

runTest("Configuracoes access dialog uses accented permission copy", () => {
  assert.match(configuracoesSource, /Permissão atual: \{currentPermissionLabel\}/);
  assert.equal(configuracoesSource.includes("Permissao atual"), false);
});

await import("./run-confirmation-dialog-behavior-tests.mjs");
