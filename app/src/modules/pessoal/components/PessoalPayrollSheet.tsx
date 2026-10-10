import { useState } from "react";
import { Printer } from "lucide-react";

import { Dialog } from "@shared/components";
import { formatCivilDate, formatDateTime } from "@shared/utils/dateFormat";
import { formatCpfCnpjInput } from "@shared/utils/inputFormatting";
import { printReport } from "@shared/utils/printReport";

import { usePessoalSituations } from "../hooks/usePessoalTracking";
import type { PessoalClientOption } from "../types";
import type { PessoalPayroll } from "../types/payroll";
import { getPessoalErrorMessage } from "../utils/pessoalErrorMessage";
import { buildPayrollSheetRows, sortSituationsForSheet } from "../utils/payrollSheet";
import {
  pessoalCheckboxCardClassName,
  pessoalPrimaryButtonClassName,
  pessoalSecondaryButtonClassName,
} from "./pessoalFormControls";

const cellClassName = "py-2 pr-3 align-top";

/**
 * Ficha de folha imprimível do cliente: configuração de folha e situações, como em
 * `pessoal/pages/clientes/folha.php`. As situações podem ficar de fora (a ficha antiga tinha a
 * versão externa, sem elas).
 */
export function PessoalPayrollSheet({
  client,
  clientId,
  payroll,
  ready,
  unions,
}: {
  client: PessoalClientOption | null;
  clientId: string;
  payroll: PessoalPayroll | null;
  /** A folha do cliente já foi carregada (com ou sem cadastro). */
  ready: boolean;
  unions: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [issuedAt, setIssuedAt] = useState("");
  const [includeSituations, setIncludeSituations] = useState(true);
  const situationsQuery = usePessoalSituations(clientId, open);
  const situations = sortSituationsForSheet(situationsQuery.data ?? []);
  // Não imprime a ficha "com situações" antes de elas chegarem.
  const situationsPending = includeSituations && !situationsQuery.isSuccess;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIssuedAt(formatDateTime(new Date()));
          setOpen(true);
        }}
        disabled={!ready}
        title={ready ? undefined : "Aguardando a folha do cliente."}
        className={pessoalSecondaryButtonClassName}
      >
        <Printer className="h-4 w-4" />
        Ficha de folha
      </button>

      <Dialog
        contentClassName="w-[min(96vw,900px)]"
        description="Configuração de folha e situações do cliente, para impressão"
        onOpenChange={setOpen}
        open={open}
        title="Ficha de folha"
      >
        <article
          aria-label={`Ficha de folha de ${client?.name ?? "cliente"}`}
          className="print-report space-y-6 text-gray-900 dark:text-slate-100"
          id="pessoal-payroll-sheet"
        >
          <div className="hide-on-print flex flex-wrap items-center justify-between gap-3">
            <label className={pessoalCheckboxCardClassName}>
              <input
                type="checkbox"
                checked={includeSituations}
                onChange={(event) => setIncludeSituations(event.target.checked)}
              />
              Incluir situações
            </label>
            <button
              type="button"
              onClick={() => printReport("pessoal-payroll-sheet")}
              disabled={situationsPending}
              className={pessoalPrimaryButtonClassName}
            >
              <Printer aria-hidden="true" className="h-4 w-4" />
              Imprimir ficha
            </button>
          </div>

          <header className="space-y-1 border-b border-gray-300 pb-4 dark:border-slate-600">
            <h2 className="text-xl font-semibold uppercase">Folha</h2>
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

          {payroll ? (
            <>
              <table aria-label="Configuração de folha" className="w-full text-left text-sm">
                <thead className="border-b border-gray-300 dark:border-slate-600">
                  <tr>
                    <th className="py-2 pr-3 font-medium" scope="col">
                      Campo
                    </th>
                    <th className="py-2 pr-3 font-medium" scope="col">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
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
                  {payroll.info.trim() || "Não informado"}
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
                <p className="text-sm text-red-700 dark:text-red-300" role="alert">
                  {getPessoalErrorMessage(
                    situationsQuery.error,
                    "Não foi possível carregar as situações.",
                  )}
                </p>
              ) : situations.length === 0 ? (
                <p className="text-sm">Nenhuma situação cadastrada.</p>
              ) : (
                <table aria-label="Situações" className="w-full text-left text-sm">
                  <thead className="border-b border-gray-300 dark:border-slate-600">
                    <tr>
                      <th className="py-2 pr-3 font-medium" scope="col">
                        Título
                      </th>
                      <th className="py-2 pr-3 font-medium" scope="col">
                        Descrição
                      </th>
                      <th className="py-2 pr-3 font-medium" scope="col">
                        Cadastro
                      </th>
                      <th className="py-2 font-medium" scope="col">
                        Finalização
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                    {situations.map((situation) => (
                      <tr key={situation.id}>
                        <td className={cellClassName}>{situation.title}</td>
                        <td className={`${cellClassName} whitespace-pre-wrap`}>
                          {situation.description || "-"}
                        </td>
                        <td className={cellClassName}>
                          {formatCivilDate(situation.registration_date, "-")}
                        </td>
                        <td className="py-2 align-top">
                          {formatCivilDate(situation.completion_date, "Em andamento")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ) : null}
        </article>
      </Dialog>
    </>
  );
}
