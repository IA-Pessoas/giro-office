import { ShieldAlert, X } from "lucide-react";

import { useAuth } from "../../../context/AuthContext";

export function SupportModeBanner() {
  const { user, exitSupportMode } = useAuth();

  if (!user?.support_mode) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldAlert aria-hidden="true" className="h-4 w-4 flex-shrink-0" />
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
          aria-label="Sair do modo suporte"
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2 dark:hover:bg-amber-900 dark:focus:ring-amber-300 dark:focus:ring-offset-amber-950"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
          Sair
        </button>
      </div>
    </div>
  );
}
