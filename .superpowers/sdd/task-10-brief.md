### Task 10: Support Mode In Frontend AppShell

**Skills:** `superpowers:subagent-driven-development`, `superpowers:test-driven-development`, `frontend-design`, `impeccable`, `karpathy-guidelines`, `performance-algorithm-design`, `superpowers:requesting-code-review`.

**Files:**
- Modify: `app/src/context/AuthContext.tsx`
- Create: `app/src/modules/superAdmin/components/SupportModeBanner.tsx`
- Modify: `app/src/shared/components/newLayout/AppShell.tsx`
- Modify: `app/src/modules/superAdmin/components/OrganizationDetailPanel.tsx`

- [ ] **Step 1: Write failing behavior tests**

Target behavior:

```ts
describe("support mode auth state", () => {
  it("enterSupportMode stores support token and exposes support fields", async () => {
    platformService.startSupportSession.mockResolvedValue({
      support_session_id: "support-1",
      organization_id: "org-1",
      reason: "debug permissao",
      token: "support-token",
      expires_at: "2026-07-13T13:00:00.000Z",
    });

    await auth.enterSupportMode({ organization_id: "org-1", reason: "debug permissao" });

    expect(api.defaults.headers.common.Authorization).toBe("Bearer support-token");
    expect(auth.user?.support_mode).toBe(true);
    expect(auth.user?.support_organization_id).toBe("org-1");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
corepack pnpm --filter @workspace/app typecheck
```

Expected:

```text
FAIL
enterSupportMode or SupportModeBanner is missing
```

- [ ] **Step 3: Implement support mode state transitions**

In `AuthContext.tsx`, store the previous platform token in memory before setting support token:

```ts
const platformTokenRef = useRef<string | null>(null);
```

Implement:

```ts
async function enterSupportMode(input: { organization_id: string; reason: string }) {
  const { [AUTH_COOKIE_NAME]: currentToken } = parseCookies();
  platformTokenRef.current = currentToken ?? null;
  const supportSession = await platformService.startSupportSession(input);

  setCookie(undefined, AUTH_COOKIE_NAME, supportSession.token, getAuthCookieOptions());
  api.defaults.headers.common.Authorization = `Bearer ${supportSession.token}`;
  setUser((current) =>
    current
      ? {
          ...current,
          support_mode: true,
          support_session_id: supportSession.support_session_id,
          support_organization_id: supportSession.organization_id,
          support_reason: supportSession.reason,
        }
      : current,
  );
  await Router.push("/dashboard");
}

async function exitSupportMode() {
  await platformService.endSupportSession();
  const platformToken = platformTokenRef.current;
  if (platformToken) {
    setCookie(undefined, AUTH_COOKIE_NAME, platformToken, getAuthCookieOptions());
    api.defaults.headers.common.Authorization = `Bearer ${platformToken}`;
  }
  setUser((current) =>
    current
      ? {
          ...current,
          support_mode: false,
          support_session_id: null,
          support_organization_id: null,
          support_reason: null,
        }
      : current,
  );
  await Router.push("/super-admin");
}
```

- [ ] **Step 4: Create support banner**

Create `SupportModeBanner.tsx`:

```tsx
import { ShieldAlert, X } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";

export function SupportModeBanner() {
  const { user, exitSupportMode } = useAuth();

  if (!user?.support_mode) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldAlert className="h-4 w-4 flex-shrink-0" />
          <span className="truncate text-sm font-medium">
            Modo suporte ativo em {user.support_organization_id}
          </span>
          {user.support_reason ? (
            <span className="hidden text-xs text-amber-800 dark:text-amber-200 md:inline">
              Motivo: {user.support_reason}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void exitSupportMode()}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900"
        >
          <X className="h-3.5 w-3.5" />
          Sair
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Mount banner in AppShell**

In `AppShell.tsx`, import and place `SupportModeBanner` directly above `<header>`:

```tsx
<SupportModeBanner />
<header className="bg-white dark:bg-slate-900 border-b ...">
```

- [ ] **Step 6: Add enter support action in OrganizationDetailPanel**

In support tab, render a reason input and call `enterSupportMode`:

```tsx
const { enterSupportMode } = useAuth();
const [supportReason, setSupportReason] = useState("");

async function handleEnterSupport() {
  if (!organizationId) return;
  await enterSupportMode({ organization_id: organizationId, reason: supportReason });
}
```

Button:

```tsx
<button
  type="button"
  disabled={!organizationId || supportReason.trim().length < 8}
  onClick={() => void handleEnterSupport()}
  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
>
  <ShieldCheck className="h-4 w-4" />
  Entrar em suporte
</button>
```

- [ ] **Step 7: Run GREEN**

Run:

```powershell
corepack pnpm --filter @workspace/app typecheck
```

Expected:

```text
typecheck exits 0
```

- [ ] **Step 8: Performance and review gate**

Performance review:

```md
## Performance Review

### Before / After Complexity
- Current AppShell renders one header.
- Proposed AppShell conditionally renders one lightweight banner.

### Dominant Bottleneck
- None; render cost is O(1).

### Proposed Change
- Keep support state in AuthContext and avoid polling for session state.

### Tradeoff / Proof
- Support token expiry still depends on API rejection; no background timer is added in this cut.
```

Then request code review for Task 10.

- [ ] **Step 9: Commit**

```powershell
git add app/src/context/AuthContext.tsx app/src/modules/superAdmin/components/SupportModeBanner.tsx app/src/shared/components/newLayout/AppShell.tsx app/src/modules/superAdmin/components/OrganizationDetailPanel.tsx
git commit -m "feat: add audited support mode UI"
```

### Follow-up Task 10.1: Unlock Organization Modules In Support Mode

**Goal:** quando `user.support_mode === true`, o super admin em suporte deve conseguir navegar por todos os modulos operacionais da organizacao no frontend, sem alterar permissoes reais no banco.

**Files:**
- Modify: `app/src/modules/auth/hooks/useModuleAccess.ts`
- Modify: `app/src/shared/components/newLayout/AppShell.tsx`
- Modify: `app/src/modules/rh/hooks/useRhPermissions.ts`
- Modify: `app/src/modules/auth/run-auth-tests.mjs`

**Interfaces:**
- Consumes: `useAuth().user.support_mode`, ja preenchido por `AuthContext.enterSupportMode`.
- Produces: `useModuleAccessMap()` retorna `ModuleAccess` admin para todos os `MODULE_KEYS` enquanto `support_mode` estiver ativo.
- Produces: `AppShell` mostra navegacao de modulos, `Departamentos` e `Administracao` durante suporte.
- Produces: `useRhPermissions()` trata suporte como permissao total para navegar no RH.

- [ ] **Step 1: Add failing coverage for support-mode module access**

In `app/src/modules/auth/run-auth-tests.mjs`, load the RH permission hook source near the existing source reads:

```js
const useModuleAccessSource = await readFile(
  new URL("./hooks/useModuleAccess.ts", import.meta.url),
  "utf8",
);
```

Add this test near the AppShell/module access checks:

```js
await runTest("support mode grants full frontend module navigation", () => {
  assert.match(useModuleAccessSource, /const hasSupportModeAccess = user\?\.support_mode === true;/);
  assert.match(useModuleAccessSource, /const isGlobalAdmin = hasSupportModeAccess \|\| isOrganizationOwner\(user\);/);
  assert.match(useModuleAccessSource, /!hasSupportModeAccess,/);
  assert.match(appShellSource, /const isSupportMode = user\?\.support_mode === true;/);
  assert.match(appShellSource, /const canManageOrganization = isSupportMode \|\| canCreateOrganizationOwner\(accessUser\);/);
  assert.match(appShellSource, /const canManageUsers = isSupportMode \|\| canAccessAdministration\(accessUser, \{ rhAccess \}\);/);
  assert.match(rhPermissionsSource, /const isSupportMode = user\?\.support_mode === true;/);
  assert.match(rhPermissionsSource, /const isGlobalAdmin = isSupportMode \|\| isAdminPermission\(user\?\.permission\);/);
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
corepack pnpm --filter @workspace/app test:auth
```

Expected:

```text
FAIL support mode grants full frontend module navigation
AssertionError: hasSupportModeAccess/isSupportMode ainda nao existe
```

- [ ] **Step 3: Centralize support-mode full module access**

In `app/src/modules/auth/hooks/useModuleAccess.ts`, update the access calculation:

```ts
  const hasSupportModeAccess = user?.support_mode === true;
  const isGlobalAdmin = hasSupportModeAccess || isOrganizationOwner(user);
```

Keep `resolveModuleAccess({ isGlobalAdmin })` unchanged so every `MODULE_KEYS` entry becomes:

```ts
{
  level: "admin",
  canView: true,
  canEdit: true,
  isAdmin: true,
  source: "admin",
}
```

Update the loading guard so support mode does not wait for department lookup:

```ts
    isLoading:
      Boolean(user?.department_id) &&
      departmentsQuery.isLoading &&
      !hasImmediateAccessSource &&
      !isGlobalAdmin &&
      !hasSupportModeAccess,
```

- [ ] **Step 4: Let AppShell expose organization navigation while in support**

In `app/src/shared/components/newLayout/AppShell.tsx`, add support-mode state below `isPlatformSuperAdmin`:

```tsx
  const isSupportMode = user?.support_mode === true;
```

Update organization/admin navigation gates:

```tsx
  const canManageOrganization = isSupportMode || canCreateOrganizationOwner(accessUser);
  const canManageUsers = isSupportMode || canAccessAdministration(accessUser, { rhAccess });
```

Do not remove `platformOnly` behavior in this task:

```tsx
          if (module.platformOnly) {
            return isPlatformSuperAdmin;
          }
```

- [ ] **Step 5: Let RH internal permission hook follow support-mode access**

In `app/src/modules/rh/hooks/useRhPermissions.ts`, add support-mode state:

```ts
  const isSupportMode = user?.support_mode === true;
```

Update global/RH management booleans:

```ts
  const isGlobalAdmin = isSupportMode || isAdminPermission(user?.permission);
  const canManageRh = isSupportMode || hasRhAdminPermission || isGlobalAdmin;
```

Keep the remaining booleans derived from `canManageRh`:

```ts
  const canViewRhDashboard = canManageRh;
  const canManageRhRequests = canManageRh;
  const canManageRhScore = canManageRh;
  const canManageRhTimeBank = canManageRh;
  const canManageRhTimesheets = canManageRh;
  const canManageRhWorkday = canManageRh;
```

- [ ] **Step 6: Run GREEN and support regression tests**

Run:

```powershell
corepack pnpm --filter @workspace/app test:auth
corepack pnpm --filter @workspace/app test:super-admin
corepack pnpm --filter @workspace/app typecheck
```

Expected:

```text
test:auth exits 0
test:super-admin exits 0
typecheck exits 0
```

- [ ] **Step 7: Manual smoke**

Run the app manually and verify:

```text
1. Login como super admin.
2. Entrar em suporte com motivo auditavel.
3. Conferir que a lateral mostra a categoria Modulos com Comercial, Certificados, Marketing, Regularize, Fiscal, Contabil, RH, Dep. Pessoal, Tecnologia, Triagem e Parcelamento.
4. Abrir pelo menos RH, Certificados, Regularize e Contabil sem cair no estado "Voce nao tem acesso a este modulo no perfil atual."
5. Sair do modo suporte e confirmar que a navegacao volta ao comportamento normal do super admin.
```

- [ ] **Step 8: Commit**

```powershell
git add app/src/modules/auth/hooks/useModuleAccess.ts app/src/shared/components/newLayout/AppShell.tsx app/src/modules/rh/hooks/useRhPermissions.ts app/src/modules/auth/run-auth-tests.mjs
git commit -m "feat: unlock modules during support mode"
```

---
