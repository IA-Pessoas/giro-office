import { useRouter } from "next/router";

import { Dialog } from "@shared/components";
import { RhTimesheetDetailView } from "./RhTimesheetDetailView";

interface RhTimesheetDetailDialogProps {
  open: boolean;
  timesheetId: string | null;
  onClose: () => void;
}

export function RhTimesheetDetailDialog({
  open,
  timesheetId,
  onClose,
}: RhTimesheetDetailDialogProps) {
  const router = useRouter();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      title="Detalhe da folha de ponto"
      description="Resumo consolidado com dias e totais do período"
      contentClassName="w-[min(96vw,1100px)]"
      bodyClassName="space-y-5"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Fechar
          </button>
          {timesheetId ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                void router.push(`/rh/timesheets/${timesheetId}`);
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Abrir visão completa
            </button>
          ) : null}
        </div>
      }
    >
      <RhTimesheetDetailView timesheetId={timesheetId} enabled={open} initialFilter="records" />
    </Dialog>
  );
}
