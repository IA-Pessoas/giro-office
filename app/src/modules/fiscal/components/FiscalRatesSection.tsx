import { ClientPickerModal, type ClientPickerOption } from "@modules/clients";
import { PaginationControls } from "@shared/components";
import { useFetch } from "@shared/hooks";
import { toast } from "@shared/services/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { fiscalRateService, type FiscalRate, type FiscalTaxType } from "../services/fiscalRateService";
import { getFiscalErrorMessage } from "../utils";

const pageSize = 20;
const FIELD_CONTROL_CLASSNAME = "h-10 rounded-lg border border-gray-300 bg-white px-3 text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white";

function currentCompetence(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function FiscalRatesSection({ canEdit }: { canEdit: boolean }) {
  const [client, setClient] = useState<ClientPickerOption | null>(null);
  const [competence, setCompetence] = useState(currentCompetence);
  const [taxType, setTaxType] = useState<FiscalTaxType>("ISS");
  const [rate, setRate] = useState("");
  const [page, setPage] = useState(1);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const listKey = ["fiscal", "rates", client?.id ?? "", page];
  const list = useFetch(listKey, () => fiscalRateService.list(client?.id ?? "", page), {
    enabled: Boolean(client),
  });
  const create = useMutation({
    mutationFn: fiscalRateService.create,
    onSuccess: async (_created, payload) => {
      setRate("");
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ["fiscal", "rates", payload.client_id] });
      toast.success("Alíquota registrada. O PDF já pode ser baixado.");
    },
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !canEdit) return;
    try {
      await create.mutateAsync({ client_id: client.id, competence, tax_type: taxType, rate });
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    }
  }

  async function downloadPdf(item: FiscalRate) {
    setDownloadingId(item.id);
    try {
      const blob = await fiscalRateService.download(item.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `aliquota-${item.tax_type}-${item.competence}-${item.id}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Alíquotas ISS/ICMS</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Registre a alíquota informada pelo Fiscal e baixe o PDF para enviar ao cliente.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Empresa</p>
        <ClientPickerModal
          filters={{}}
          selectedClient={client}
          onSelectClient={(selection) => {
            if (selection && selection.document?.replace(/\D/g, "").length !== 14) {
              toast.error("Selecione uma empresa com CNPJ cadastrado.");
              return;
            }
            setClient(selection);
            setPage(1);
          }}
          triggerLabel="Selecionar empresa"
        />
        {client?.document ? <p className="text-xs text-gray-500">CNPJ: {client.document}</p> : null}
      </div>

      {client && canEdit ? (
        <form onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end dark:border-slate-700">
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Competência
            <input type="month" required value={competence} onChange={(event) => setCompetence(event.target.value)} className={FIELD_CONTROL_CLASSNAME} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Tributo
            <select value={taxType} onChange={(event) => setTaxType(event.target.value as FiscalTaxType)} className={FIELD_CONTROL_CLASSNAME}>
              <option value="ISS">ISS</option>
              <option value="ICMS">ICMS</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Alíquota informada (%)
            <input type="text" inputMode="decimal" required maxLength={8} value={rate} onChange={(event) => setRate(event.target.value)} placeholder="Ex.: 5,1250" className={FIELD_CONTROL_CLASSNAME} />
          </label>
          <button type="submit" disabled={create.isPending} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
            {create.isPending ? "Registrando..." : "Registrar alíquota"}
          </button>
        </form>
      ) : null}

      {client ? (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Registros</h3>
          {list.isLoading ? <p role="status" className="text-sm text-gray-600">Carregando registros...</p> : null}
          {list.error ? <p role="alert" className="text-sm text-red-600">{getFiscalErrorMessage(list.error)}</p> : null}
          {list.data?.data.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">Nenhuma alíquota registrada para esta empresa.</p> : null}
          {list.data?.data.length ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300"><tr><th className="px-4 py-3">Competência</th><th className="px-4 py-3">Tributo</th><th className="px-4 py-3">Alíquota</th><th className="px-4 py-3">Emissão</th><th className="px-4 py-3">PDF</th></tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {list.data.data.map((item) => (
                    <tr key={item.id} className="text-gray-800 dark:text-gray-200">
                      <td className="px-4 py-3">{item.competence.slice(5, 7)}/{item.competence.slice(0, 4)}</td>
                      <td className="px-4 py-3">{item.tax_type}</td>
                      <td className="px-4 py-3">{item.rate.replace(".", ",")}%</td>
                      <td className="px-4 py-3">{new Date(item.createdAt).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => void downloadPdf(item)} disabled={downloadingId !== null} aria-label={`Baixar PDF de ${item.tax_type} de ${item.competence}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline disabled:opacity-50 dark:text-blue-300">
                          {downloadingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PaginationControls page={page} limit={pageSize} total={list.data.total} count={list.data.data.length} hasMore={list.data.hasMore} isFetching={list.isFetching} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => value + 1)} />
            </div>
          ) : null}
        </div>
      ) : <p className="text-sm text-gray-600 dark:text-gray-400">Selecione uma empresa para consultar ou registrar alíquotas.</p>}
    </section>
  );
}
