import { Dialog } from "@shared/components";
import type { RhScoreQuestion } from "../../types";

interface RhScoreQuestionDeleteDialogProps {
  question: RhScoreQuestion | null;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export function RhScoreQuestionDeleteDialog({
  question,
  isDeleting,
  onClose,
  onConfirm,
}: RhScoreQuestionDeleteDialogProps) {
  return (
    <Dialog
      open={Boolean(question)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      title="Excluir"
      description="Confirmação de exclusão de pergunta de score"
      overlayClassName="!z-[1600]"
      contentClassName="!z-[1700] !w-[min(88vw,400px)]"
      bodyClassName="space-y-3 !py-3"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? "Excluindo..." : "Excluir"}
          </button>
        </>
      }
    >
      <p className="text-sm leading-5 text-gray-600 dark:text-gray-300">
        Esta ação remove a pergunta de score e não poderá ser desfeita.
      </p>
      {question ? (
        <p className="rounded-md bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500 dark:bg-gray-900/30 dark:text-gray-400">
          {question.question}
        </p>
      ) : null}
    </Dialog>
  );
}
