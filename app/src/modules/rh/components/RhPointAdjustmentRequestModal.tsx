import { Dialog } from "@shared/components";

interface RhPointAdjustmentRequestModalProps {
  open: boolean;
  onClose: () => void;
}

export function RhPointAdjustmentRequestModal({
  open,
  onClose,
}: RhPointAdjustmentRequestModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      title="Solicitar ajuste de ponto"
      description="Modal base de solicitação de ajuste"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Fechar
        </button>
      }
      contentClassName="w-[min(92vw,640px)]"
      bodyClassName="space-y-4"
    >
      <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
        O formulário de ajuste será conectado a um registro selecionado nos próximos commits.
      </div>
    </Dialog>
  );
}
