import { useState } from "react";

import { formatCivilDate } from "@shared/utils/dateFormat";

import { usePessoalSituations } from "../hooks/usePessoalTracking";
import type { PessoalClientOption } from "../types";
import type { PessoalPayroll } from "../types/payroll";
import { getPessoalErrorMessage } from "../utils/pessoalErrorMessage";
import {
  buildPayrollSheetRows,
  PAYROLL_SHEET_EMPTY,
  sortSituationsForSheet,
} from "../utils/payrollSheet";
import {
  pessoalCheckboxCardClassName,
  pessoalSecondaryButtonClassName,
} from "./pessoalFormControls";
import {
  PessoalPrintSheet,
  pessoalSheetBodyClassName,
  pessoalSheetCellClassName as cellClassName,
  pessoalSheetHeadCellClassName,
  pessoalSheetHeadClassName,
} from "./PessoalPrintSheet";

/**
 * Ficha de folha imprimível do cliente: configuração de folha e situações, como em
 * `pessoal/pages/clientes/folha.php`. As situações podem ficar de fora (a ficha antiga tinha a
 * versão externa, sem elas).
 */
export function PessoalPayrollSheet({
  client,
  clientId,
  payroll,
  unavailableReason,
  unions,
}: {
  client: PessoalClientOption | null;
  clientId: string;
  payroll: PessoalPayroll | null;
  /** Por que a ficha ainda não abre (folha ou sindicatos não carregados); `null` quando abre. */
  unavailableReason: string | null;
  unions: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [includeSituations, setIncludeSituations] = useState(true);
  const situationsQuery = usePessoalSituations(clientId, open);
  const situations = sortSituationsForSheet(situationsQuery.data ?? []);
  // Não imprime a ficha "com situações" antes de elas chegarem.
  const situationsPending = includeSituations && !situationsQuery.isSuccess;

  return (
    <PessoalPrintSheet
      client={client}
      description="Configuração de folha e situações do cliente, para impressão"
      heading="Folha"
      id="pessoal-payroll-sheet"
      onOpenChange={setOpen}
      printDisabled={situationsPending}
      title="Ficha de folha"
      toolbar={
        <label className={pessoalCheckboxCardClassName}>
          <input
            type="checkbox"
            checked={includeSituations}
            onChange={(event) => setIncludeSituations(event.target.checked)}
          />
          Incluir situações
        </label>
      }
      unavailableReason={unavailableReason}
    >
      {payroll ? (
        <>
          <table aria-label="Configuração de folha" className="w-full text-left text-sm">
            <thead className={pessoalSheetHeadClassName}>
              <tr>
                <th className={pessoalSheetHeadCellClassName} scope="col">
                  Campo
                </th>
                <th className={pessoalSheetHeadCellClassName} scope="col">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className={pessoalSheetBodyClassName}>
              {buildPayrollSheetRows(payroll, unions).map(([label, value]) => (
                <tr key={label}>
                  <th className={`${cellClassName} font-normal`} scope="row">
                    {label}
                  </th>
                  <td className={cellClassName}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase">Informações</h3>
            <p className="whitespace-pre-wrap text-sm">
              {payroll.info.trim() || PAYROLL_SHEET_EMPTY}
            </p>
          </section>
        </>
      ) : (
        <p className="text-sm">Este cliente ainda não tem folha cadastrada.</p>
      )}

      {includeSituations ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase">Situações</h3>
          {situationsQuery.isLoading ? (
            <p className="text-sm" role="status">
              Carregando situações…
            </p>
          ) : situationsQuery.isError ? (
            <div className="space-y-2" role="alert">
              <p className="text-sm text-red-700 dark:text-red-300">
                {getPessoalErrorMessage(
                  situationsQuery.error,
                  "Não foi possível carregar as situações.",
                )}
              </p>
              <button
                type="button"
                onClick={() => void situationsQuery.refetch()}
                className={`hide-on-print ${pessoalSecondaryButtonClassName}`}
              >
                Tentar novamente
              </button>
            </div>
          ) : situations.length === 0 ? (
            <p className="text-sm">Nenhuma situação cadastrada.</p>
          ) : (
            <table aria-label="Situações" className="w-full text-left text-sm">
              <thead className={pessoalSheetHeadClassName}>
                <tr>
                  <th className={pessoalSheetHeadCellClassName} scope="col">
                    Título
                  </th>
                  <th className={pessoalSheetHeadCellClassName} scope="col">
                    Descrição
                  </th>
                  <th className={pessoalSheetHeadCellClassName} scope="col">
                    Cadastro
                  </th>
                  <th className={pessoalSheetHeadCellClassName} scope="col">
                    Finalização
                  </th>
                </tr>
              </thead>
              <tbody className={pessoalSheetBodyClassName}>
                {situations.map((situation) => (
                  <tr key={situation.id}>
                    <td className={cellClassName}>{situation.title}</td>
                    <td className={`${cellClassName} whitespace-pre-wrap`}>
                      {situation.description || "-"}
                    </td>
                    <td className={cellClassName}>
                      {formatCivilDate(situation.registration_date, "-")}
                    </td>
                    <td className={cellClassName}>
                      {formatCivilDate(situation.completion_date, "Em andamento")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}
    </PessoalPrintSheet>
  );
}
