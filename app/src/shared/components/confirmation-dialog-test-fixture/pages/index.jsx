import { useEffect, useState } from "react";
import { ConfirmationDialog } from "../../ui/ConfirmationDialog";
import { Dialog } from "../../ui/Dialog";

export default function ConfirmationDialogTestPage() {
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirmationContext, setConfirmationContext] = useState("inicial");
  const [consumerError, setConsumerError] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [normalDialogOpen, setNormalDialogOpen] = useState(false);

  useEffect(() => {
    window.confirmationDialogHarness = {
      closeConfirmation() {
        setConfirmationOpen(false);
      },
      openConfirmation({ context, errorMessage = null, loading = false }) {
        setConfirmationContext(context);
        setConsumerError(errorMessage);
        setIsConfirming(loading);
        setConfirmationOpen(true);
      },
      openNormalDialog() {
        setNormalDialogOpen(true);
      },
    };

    return () => {
      delete window.confirmationDialogHarness;
    };
  }, []);

  return (
    <main>
      <p data-testid="confirmation-state">
        {confirmationOpen ? "confirmation-open" : "confirmation-closed"}
      </p>
      <p data-testid="normal-dialog-state">
        {normalDialogOpen ? "normal-open" : "normal-closed"}
      </p>

      <ConfirmationDialog
        open={confirmationOpen}
        onOpenChange={setConfirmationOpen}
        title={`Confirmação ${confirmationContext}`}
        description="Confirme a operação da fixture."
        onConfirm={async () => {
          throw new Error("Falha controlada da fixture.");
        }}
        isConfirming={isConfirming}
        errorMessage={consumerError}
        confirmLabel="Confirmar operação"
        cancelLabel="Cancelar operação"
      />

      <Dialog
        open={normalDialogOpen}
        onOpenChange={setNormalDialogOpen}
        title="Diálogo normal"
        description="Diálogo sem proteção de fechamento."
        preventClose={false}
      >
        <p>Conteúdo normal</p>
      </Dialog>
    </main>
  );
}
