import { useEffect, useState } from "react";
import { Dialog } from "./Dialog";

const CANCEL_BUTTON_CLASSNAME =
  "rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700";

const CONFIRM_BUTTON_CLASSNAMES = {
  destructive:
    "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60",
  neutral:
    "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60",
} as const;

export interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void | Promise<void>;
  isConfirming: boolean;
  errorMessage: string | null;
  confirmLabel: string;
  cancelLabel: string;
  variant?: "destructive" | "neutral";
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isConfirming,
  errorMessage,
  confirmLabel,
  cancelLabel,
  variant = "destructive",
}: ConfirmationDialogProps) {
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setLocalError(null);
    }
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isConfirming) {
      return;
    }

    if (!nextOpen) {
      setLocalError(null);
    }

    onOpenChange(nextOpen);
  };

  const handleCancel = () => {
    if (isConfirming) {
      return;
    }

    setLocalError(null);
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    setLocalError(null);

    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      setLocalError("Não foi possível confirmar a ação. Tente novamente.");
    }
  };

  const displayedError = errorMessage ?? localError;

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      preventClose={isConfirming}
      contentClassName="!w-[min(92vw,440px)]"
      bodyClassName="space-y-3"
      footer={
        <>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isConfirming}
            className={CANCEL_BUTTON_CLASSNAME}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirming}
            className={CONFIRM_BUTTON_CLASSNAMES[variant]}
          >
            {isConfirming ? "Confirmando..." : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{description}</p>
      {displayedError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          {displayedError}
        </p>
      ) : null}
    </Dialog>
  );
}
