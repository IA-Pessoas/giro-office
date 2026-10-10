import { useState, type ReactNode } from "react";
import { Printer } from "lucide-react";

import { Dialog } from "@shared/components";
import { formatCivilDate } from "@shared/utils/dateFormat";
import { formatBrlAmount, formatCpfCnpjInput } from "@shared/utils/inputFormatting";
import { printReport } from "@shared/utils/printReport";

import type { PessoalClientOption } from "../types";
import type { PessoalLdd } from "../types/tracking";
import { buildLddSheet, type LddSheetSection } from "../utils/lddSheet";
import {
  pessoalPrimaryButtonClassName,
  pessoalSecondaryButtonClassName,
} from "./pessoalFormControls";

interface SheetColumn {
  label: string;
  value: (row: PessoalLdd) => ReactNode;
}

const balanceColumn: SheetColumn = {
  label: "Saldo devedor atual",
  value: (row) => formatBrlAmount(row.balance_amount ?? 0),
};
const periodColumn: SheetColumn = {
  label: "Período de apuração",
  value: (row) => row.period || "-",
};
const dueDateColumn: SheetColumn = {
  label: "Data de vencimento",
  value: (row) => formatCivilDate(row.due_date, "-"),
};

const previdenciarioColumns = [periodColumn, dueDateColumn, balanceColumn];
const pgfnColumns: SheetColumn[] = [
  { label: "Inscrição", value: (row) => row.registration_status || "-" },
  { label: "Situação", value: (row) => row.status || "-" },
  balanceColumn,
];
const otherColumns: SheetColumn[] = [
  { label: "Tipo", value: (row) => row.type },
  periodColumn,
  dueDateColumn,
  balanceColumn,
];

function SheetSection({
  columns,
  emptyMessage,
  section,
  title,
}: {
  columns: SheetColumn[];
  emptyMessage: string;
  section: LddSheetSection;
  title: string;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase">{title}</h3>
      {section.rows.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-slate-300">{emptyMessage}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-300 dark:border-slate-600">
            <tr>
              {columns.map((column, index) => (
                <th
                  className={`py-2 pr-3 font-medium ${index === columns.length - 1 ? "text-right" : ""}`}
                  key={column.label}
                  scope="col"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {section.rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column, index) => (
                  <td
                    className={`py-2 pr-3 ${index === columns.length - 1 ? "text-right" : ""}`}
                    key={column.label}
                  >
                    {column.value(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-300 font-semibold dark:border-slate-600">
            <tr>
              <th className="py-2 pr-3 text-left" colSpan={columns.length - 1} scope="row">
                Subtotal
              </th>
              <td className="py-2 pr-3 text-right">{formatBrlAmount(section.subtotal)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  );
}

/**
 * Ficha LDD imprimível do cliente, com todos os LDD cadastrados (manuais e importados). Não há
 * filtro de competência: a ficha antiga mostrava uma no cabeçalho sem filtrar os registros.
 */
export function PessoalLddSheet({
  client,
  ldd,
}: {
  client: PessoalClientOption | null;
  /** LDD do cliente; `null` enquanto a lista não está carregada. */
  ldd: PessoalLdd[] | null;
}) {
  const [open, setOpen] = useState(false);
  const [issuedAt, setIssuedAt] = useState("");
  const sheet = buildLddSheet(ldd ?? []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIssuedAt(new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }));
          setOpen(true);
        }}
        disabled={!ldd}
        className={pessoalSecondaryButtonClassName}
      >
        <Printer className="h-4 w-4" />
        Ficha LDD
      </button>

      <Dialog
        contentClassName="w-[min(96vw,900px)]"
        description="Débitos previdenciários e PGFN do cliente, para impressão"
        onOpenChange={setOpen}
        open={open}
        title="Ficha LDD"
      >
        <article
          aria-label={`Ficha LDD de ${client?.name ?? "cliente"}`}
          className="print-report space-y-6 text-gray-900 dark:text-slate-100"
          id="pessoal-ldd-sheet"
        >
          <div className="hide-on-print flex justify-end">
            <button
              type="button"
              onClick={() => printReport("pessoal-ldd-sheet")}
              className={pessoalPrimaryButtonClassName}
            >
              <Printer aria-hidden="true" className="h-4 w-4" />
              Imprimir ficha
            </button>
          </div>

          <header className="space-y-1 border-b border-gray-300 pb-4 dark:border-slate-600">
            <h2 className="text-xl font-semibold uppercase">
              Levantamento de débitos previdenciários
            </h2>
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

          <SheetSection
            columns={previdenciarioColumns}
            emptyMessage="Nenhum débito previdenciário cadastrado."
            section={sheet.previdenciario}
            title="Discriminação dos débitos do INSS - Receita Federal do Brasil"
          />
          <SheetSection
            columns={pgfnColumns}
            emptyMessage="Nenhum débito em dívida ativa cadastrado."
            section={sheet.pgfn}
            title="Discriminação dos débitos do INSS - Dívida ativa (PGFN)"
          />
          {sheet.other.rows.length > 0 ? (
            <SheetSection
              columns={otherColumns}
              emptyMessage=""
              section={sheet.other}
              title="Outros débitos acompanhados"
            />
          ) : null}

          <p className="flex justify-between border-t border-gray-300 pt-3 text-base font-semibold dark:border-slate-600">
            <span>Total geral</span>
            <span>{formatBrlAmount(sheet.total)}</span>
          </p>
          <p className="text-xs">
            Os valores poderão sofrer alterações devido à incidência de juros e multas diárias.
          </p>
        </article>
      </Dialog>
    </>
  );
}
