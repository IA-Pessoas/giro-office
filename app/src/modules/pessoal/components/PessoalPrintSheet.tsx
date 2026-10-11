import { useState, type ReactNode } from "react";
import { Printer } from "lucide-react";

import { Dialog } from "@shared/components";
import { formatDateTime } from "@shared/utils/dateFormat";
import { formatCpfCnpjInput } from "@shared/utils/inputFormatting";
import { printReport } from "@shared/utils/printReport";

import type { PessoalClientOption } from "../types";
import {
  pessoalPrimaryButtonClassName,
  pessoalSecondaryButtonClassName,
} from "./pessoalFormControls";

export const pessoalSheetHeadClassName = "border-b border-gray-300 dark:border-slate-600";
export const pessoalSheetHeadCellClassName = "py-2 pr-3 font-medium";
export const pessoalSheetBodyClassName = "divide-y divide-gray-200 dark:divide-slate-700";
export const pessoalSheetCellClassName = "py-2 pr-3 align-top";

/**
 * Casca das fichas imprimíveis do Pessoal: botão que abre a ficha num Dialog, cabeçalho com
 * cliente e data de emissão, e o botão de imprimir. Só o `<article class="print-report">` sai na
 * impressão (`@media print` em `global.css`).
 */
export function PessoalPrintSheet({
  children,
  client,
  description,
  heading,
  id,
  onOpenChange,
  printDisabled = false,
  title,
  toolbar,
  unavailableReason,
}: {
  children: ReactNode;
  client: PessoalClientOption | null;
  description: string;
  /** Título impresso no topo da ficha. */
  heading: string;
  id: string;
  onOpenChange?: (open: boolean) => void;
  printDisabled?: boolean;
  /** Nome da ficha, no botão e no título do Dialog. */
  title: string;
  /** Controles de tela ao lado do botão de imprimir; não saem na impressão. */
  toolbar?: ReactNode;
  /** Por que a ficha ainda não pode ser aberta; `null` quando pode. */
  unavailableReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [issuedAt, setIssuedAt] = useState("");

  function handleOpenChange(next: boolean) {
    if (next) setIssuedAt(formatDateTime(new Date()));
    setOpen(next);
    onOpenChange?.(next);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        disabled={unavailableReason !== null}
        title={unavailableReason ?? undefined}
        className={pessoalSecondaryButtonClassName}
      >
        <Printer className="h-4 w-4" />
        {title}
      </button>

      <Dialog
        contentClassName="w-[min(96vw,900px)]"
        description={description}
        onOpenChange={handleOpenChange}
        open={open}
        title={title}
      >
        <article
          aria-label={`${title} de ${client?.name ?? "cliente"}`}
          className="print-report space-y-6 text-gray-900 dark:text-slate-100"
          id={id}
        >
          <div className="hide-on-print flex flex-wrap items-center justify-end gap-3">
            {toolbar}
            <button
              type="button"
              onClick={() => printReport(id)}
              disabled={printDisabled}
              className={pessoalPrimaryButtonClassName}
            >
              <Printer aria-hidden="true" className="h-4 w-4" />
              Imprimir ficha
            </button>
          </div>

          <header className={`space-y-1 pb-4 ${pessoalSheetHeadClassName}`}>
            <h2 className="text-xl font-semibold uppercase">{heading}</h2>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="font-medium">Razão social</dt>
                <dd>{client?.name ?? "-"}</dd>
              </div>
              <div>
                <dt className="font-medium">CNPJ/CPF</dt>
                <dd>{client?.document ? formatCpfCnpjInput(client.document) : "-"}</dd>
              </div>
              <div>
                <dt className="font-medium">Data de emissão</dt>
                <dd>{issuedAt}</dd>
              </div>
            </dl>
          </header>

          {children}
        </article>
      </Dialog>
    </>
  );
}
