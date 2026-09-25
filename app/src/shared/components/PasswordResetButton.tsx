import { useState } from "react";
import { isAxiosError } from "axios";
import { toast } from "@shared/services/toast";

import { ConfirmationDialog } from "./ui/ConfirmationDialog";

interface PasswordResetButtonProps {
  /** Pede ao backend o envio do link de uso único (#1342). */
  onSend: () => Promise<unknown>;
  className?: string;
  disabled?: boolean;
}

function serverMessage(error: unknown): string | null {
  const message = isAxiosError(error) ? error.response?.data?.error : undefined;
  return typeof message === "string" ? message : null;
}

/** Substitui o campo "Nova senha": o administrador nunca define nem conhece a senha. */
export function PasswordResetButton({ onSend, className, disabled }: PasswordResetButtonProps) {
  const [open, setOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsSending(true);
    setError(null);
    try {
      await onSend();
      toast.success("Link de redefinição enviado por e-mail.");
    } catch (sendError) {
      setError(serverMessage(sendError) ?? "Não foi possível enviar o link de redefinição.");
      throw sendError;
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled || isSending}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Enviar link de redefinição de senha
      </button>
      <ConfirmationDialog
        open={open}
        onOpenChange={setOpen}
        title="Enviar link de redefinição de senha"
        description="O usuário recebe por e-mail um link de uso único, válido por 1 hora, para definir a própria senha. As sessões dele são encerradas quando a senha for trocada."
        onConfirm={handleConfirm}
        isConfirming={isSending}
        errorMessage={error}
        confirmLabel="Enviar link"
        cancelLabel="Cancelar"
        variant="neutral"
      />
    </>
  );
}
