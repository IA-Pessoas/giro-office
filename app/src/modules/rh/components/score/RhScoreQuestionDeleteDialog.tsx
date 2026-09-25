import { ConfirmationDialog } from "@shared/components";
import type { RhScoreQuestion } from "../../types";

interface RhScoreQuestionDeleteDialogProps {
  question: RhScoreQuestion | null;
  isDeleting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export function RhScoreQuestionDeleteDialog({
  question,
  isDeleting,
  errorMessage,
  onClose,
  onConfirm,
}: RhScoreQuestionDeleteDialogProps) {
  return (
    <ConfirmationDialog
      open={Boolean(question)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      title="Excluir pergunta de score"
      description={`Excluir a pergunta "${question?.question ?? ""}"? Esta ação remove a pergunta de score e não poderá ser desfeita.`}
      onConfirm={onConfirm}
      isConfirming={isDeleting}
      errorMessage={errorMessage}
      confirmLabel="Excluir"
      cancelLabel="Cancelar"
    />
  );
}
