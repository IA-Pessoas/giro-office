import { useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { toast } from "@shared/services/toast";
import { MIN_PASSWORD_LENGTH, newPasswordError } from "@shared/utils/meProfileUpdate";

import { Dialog } from "./ui/Dialog";

const INPUT_CLASSNAME =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";
const LABEL_CLASSNAME = "block text-sm font-medium text-gray-700 dark:text-gray-300";

interface PasswordResetButtonProps {
  /** Grava a senha escolhida pelo TI; o backend derruba as sessões do usuário. */
  onSubmit: (password: string) => Promise<unknown>;
  className?: string;
  disabled?: boolean;
}

function serverMessage(error: unknown): string | null {
  const message = isAxiosError(error) ? error.response?.data?.error : undefined;
  return typeof message === "string" ? message : null;
}

/** O TI redefine a senha de outro usuário numa modal, sem link por e-mail. */
export function PasswordResetButton({ onSubmit, className, disabled }: PasswordResetButtonProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validationError =
    password && confirmPassword ? newPasswordError(password, confirmPassword) : null;
  const canSubmit = password.length > 0 && confirmPassword.length > 0 && !validationError;

  const handleOpenChange = (nextOpen: boolean) => {
    // Senha não fica em memória entre aberturas da modal.
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setOpen(nextOpen);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit(password);
      toast.success("Senha redefinida. O usuário foi desconectado.");
      handleOpenChange(false);
    } catch (submitError) {
      setError(serverMessage(submitError) ?? "Não foi possível redefinir a senha.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled || isSaving}
        onClick={() => handleOpenChange(true)}
      >
        Redefinir senha
      </button>
      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Redefinir senha"
        description="Defina a nova senha do usuário."
        preventClose={isSaving}
        contentClassName="!w-[min(92vw,440px)]"
        bodyClassName="space-y-3"
      >
        <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Mínimo de {MIN_PASSWORD_LENGTH} caracteres. As sessões abertas do usuário serão
            encerradas.
          </p>
          <div className="space-y-1">
            <label className={LABEL_CLASSNAME} htmlFor="admin-new-password">
              Nova senha
            </label>
            <input
              id="admin-new-password"
              className={INPUT_CLASSNAME}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className={LABEL_CLASSNAME} htmlFor="admin-confirm-password">
              Confirmar nova senha
            </label>
            <input
              id="admin-confirm-password"
              className={INPUT_CLASSNAME}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              aria-describedby={validationError ? "admin-password-error" : undefined}
            />
            {validationError ? (
              <p id="admin-password-error" className="text-sm text-red-600">
                {validationError}
              </p>
            ) : null}
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={isSaving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit || isSaving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Salvando..." : "Redefinir senha"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
