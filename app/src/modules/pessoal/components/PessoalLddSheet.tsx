import type { ReactNode } from "react";

import { formatCivilDate } from "@shared/utils/dateFormat";
import { formatBrlAmount } from "@shared/utils/inputFormatting";

import type { PessoalClientOption } from "../types";
import type { PessoalLdd } from "../types/tracking";
import { buildLddSheet, type LddSheetSection } from "../utils/lddSheet";
import {
  PessoalPrintSheet,
  pessoalSheetBodyClassName,
  pessoalSheetHeadCellClassName,
  pessoalSheetHeadClassName,
} from "./PessoalPrintSheet";

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
        <table aria-label={title} className="w-full text-left text-sm">
          <thead className={pessoalSheetHeadClassName}>
            <tr>
              {columns.map((column, index) => (
                <th
                  className={`${pessoalSheetHeadCellClassName} ${index === columns.length - 1 ? "text-right" : ""}`}
                  key={column.label}
                  scope="col"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={pessoalSheetBodyClassName}>
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
  const sheet = buildLddSheet(ldd ?? []);

  return (
    <PessoalPrintSheet
      client={client}
      description="Débitos previdenciários e PGFN do cliente, para impressão"
      heading="Levantamento de débitos previdenciários"
      id="pessoal-ldd-sheet"
      title="Ficha LDD"
      unavailableReason={ldd ? null : "Aguardando a lista de LDD do cliente."}
    >
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
      <p className="flex justify-between border-t border-gray-300 pt-3 text-base font-semibold dark:border-slate-600">
        <span>Total geral</span>
        <span>{formatBrlAmount(sheet.total)}</span>
      </p>
      <p className="text-xs">
        Os valores poderão sofrer alterações devido à incidência de juros e multas diárias.
      </p>
      {sheet.excluded > 0 ? (
        <p className="hide-on-print text-xs text-gray-600 dark:text-slate-300">
          {sheet.excluded} LDD de outros tipos (FGTS, IRRF, ISS) não entram nesta ficha.
        </p>
      ) : null}
    </PessoalPrintSheet>
  );
}
