import { ClientPickerModal, type ClientPickerOption } from "@modules/clients";
import { PaginationControls } from "@shared/components";
import { useFetch } from "@shared/hooks";
import { toast } from "@shared/services/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, FileStack, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { fiscalAnticipationsQueryKey } from "../hooks/queryKeys";
import {
  ANTICIPATION_PAGE_SIZE,
  type FiscalAnticipationBatchDetail,
  fiscalAnticipationService,
} from "../services/fiscalAnticipationService";
import {
  competenceFromToday,
  FISCAL_ANTICIPATION_ISSUE_LABELS,
  FISCAL_ANTICIPATION_STATUS_LABELS,
  formatAnticipationSummary,
  formatCompetenceLabel,
  formatMoney,
  getFiscalErrorMessage,
} from "../utils";
import {
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_FIELD_ERROR_CLASSNAME,
  FISCAL_PRIMARY_BUTTON_CLASSNAME,
} from "./fiscalFieldStyles";
import { FiscalStateBox } from "./FiscalStateBox";

// Mesmo teto do serviço: ~650 kB de ZIP em base64 dentro do 1 MB do gateway.
const MAX_ZIP_BYTES = 650_000;
const LABEL_CLASSNAME = "grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300";
const LINK_BUTTON_CLASSNAME = "text-blue-700 hover:underline dark:text-blue-300";

export function FiscalAnticipationsSection({ canEdit }: { canEdit: boolean }) {
  const [client, setClient] = useState<ClientPickerOption | null>(null);
  const [competence, setCompetence] = useState(() => competenceFromToday(-1));
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const clientId = client?.id ?? "";
  const list = useFetch(
    [...fiscalAnticipationsQueryKey(clientId), competence, page],
    () => fiscalAnticipationService.list(clientId, competence, page),
    { enabled: Boolean(client) },
  );
  const detail = useFetch(
    [...fiscalAnticipationsQueryKey(clientId), "detail", openId ?? ""],
    () => fiscalAnticipationService.detail(openId ?? ""),
    { enabled: Boolean(openId) },
  );
  const importBatch = useMutation({
    mutationFn: fiscalAnticipationService.importBatch,
    onSuccess: async (batch: FiscalAnticipationBatchDetail) => {
      toast.success(
        batch.issues.length
          ? "Lote importado com itens fora do lote; confira abaixo."
          : "Lote importado.",
      );
      setOpenId(batch.id);
      await queryClient.invalidateQueries({ queryKey: fiscalAnticipationsQueryKey(clientId) });
    },
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);
    if (!file || !competence) {
      setFormError("Informe a competência e o ZIP de XML.");
      return;
    }
    if (file.size > MAX_ZIP_BYTES) {
      setFormError("O ZIP excede 650 kB; divida as notas em arquivos menores.");
      return;
    }
    try {
      await importBatch.mutateAsync({ clientId, competence, file });
      setFile(null);
      form.reset();
    } catch (error) {
      setFormError(getFiscalErrorMessage(error));
    }
  }

  const batch = detail.data;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Antecipações</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Importe um ZIP de XML de NF-e por cliente e competência. Cada item vira uma linha rastreável até o arquivo e a chave de acesso, pendente de revisão. Nota ou item já importado para o cliente, XML inválido, cancelado ou não autorizado fica fora do lote e aparece abaixo.
        </p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Não há cálculo automático de imposto nem emissão de guia: os valores são os do XML, para revisão manual.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Cliente</p>
        <ClientPickerModal
          filters={{}}
          selectedClient={client}
          onSelectClient={(selection) => {
            setClient(selection);
            setPage(1);
            setOpenId(null);
          }}
          triggerLabel="Selecionar cliente"
        />
      </div>

      {client ? (
        <label className={`${LABEL_CLASSNAME} max-w-xs`}>
          Competência
          <input
            type="month"
            required
            value={competence}
            onChange={(event) => {
              setCompetence(event.target.value);
              setPage(1);
              setOpenId(null);
            }}
            className={FISCAL_FIELD_CONTROL_CLASSNAME}
          />
        </label>
      ) : null}

      {client && canEdit ? (
        <form
          noValidate
          onSubmit={(event) => void submit(event)}
          aria-label="Importar lote de antecipações"
          className="grid gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-[1fr_auto] md:items-end dark:border-slate-700"
        >
          <label className={LABEL_CLASSNAME}>
            XML de NF-e (ZIP) para {formatCompetenceLabel(competence)}
            <input
              type="file"
              accept=".zip,application/zip"
              required
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className={`${FISCAL_FIELD_CONTROL_CLASSNAME} py-1.5 text-sm`}
            />
          </label>
          <button type="submit" disabled={!file || importBatch.isPending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>
            {importBatch.isPending ? "Importando..." : "Importar lote"}
          </button>
          {formError ? <p role="alert" className={`${FISCAL_FIELD_ERROR_CLASSNAME} md:col-span-2`}>{formError}</p> : null}
        </form>
      ) : null}

      {client ? (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Lotes da competência</h3>
          {list.isLoading ? (
            <div role="status">
              <FiscalStateBox icon={Loader2} tone="loading" title="Carregando lotes" compact>
                Estamos consultando os lotes do cliente.
              </FiscalStateBox>
            </div>
          ) : null}
          {list.error ? (
            <div role="alert">
              <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar os lotes" compact>
                {getFiscalErrorMessage(list.error)}
              </FiscalStateBox>
            </div>
          ) : null}
          {list.data?.data.length === 0 ? (
            <FiscalStateBox icon={FileStack} title="Nenhum lote importado" compact>
              Não há lotes de antecipações para este cliente na competência escolhida.
            </FiscalStateBox>
          ) : null}
          {list.data?.data.length ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Lotes de antecipações do cliente</caption>
                <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                  <tr><th className="px-4 py-3">Arquivo</th><th className="px-4 py-3">Importado em</th><th className="px-4 py-3">Situação</th><th className="px-4 py-3">Resumo</th><th className="px-4 py-3">Ações</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {list.data.data.map((item) => (
                    <tr key={item.id} className="align-top text-gray-800 dark:text-gray-200">
                      <td className="px-4 py-3">{item.file_name}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(item.createdAt).toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-3">{FISCAL_ANTICIPATION_STATUS_LABELS[item.status]}</td>
                      <td className="px-4 py-3">{formatAnticipationSummary(item)}</td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setOpenId(openId === item.id ? null : item.id)} aria-expanded={openId === item.id} aria-label={`Itens do lote ${item.file_name}`} className={LINK_BUTTON_CLASSNAME}>
                          {openId === item.id ? "Fechar" : "Ver itens"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PaginationControls page={page} limit={ANTICIPATION_PAGE_SIZE} total={list.data.total} count={list.data.data.length} hasMore={list.data.hasMore} isFetching={list.isFetching} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => value + 1)} />
            </div>
          ) : null}

          {openId ? (
            <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-slate-700">
              {detail.isLoading ? <p role="status" className="text-sm text-gray-600 dark:text-gray-400">Carregando itens...</p> : null}
              {detail.error ? <p role="alert" className={FISCAL_FIELD_ERROR_CLASSNAME}>{getFiscalErrorMessage(detail.error)}</p> : null}
              {batch ? (
                <>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {batch.file_name} · {formatCompetenceLabel(batch.competence)} · {FISCAL_ANTICIPATION_STATUS_LABELS[batch.status]}
                  </h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{formatAnticipationSummary(batch)}</p>
                  {batch.issues.length ? (
                    <div role="alert" className="overflow-x-auto rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20">
                      <table className="w-full text-left text-sm text-amber-900 dark:text-amber-200">
                        <caption className="px-4 pt-3 text-left font-medium">Arquivos e itens fora do lote</caption>
                        <thead><tr><th className="px-4 py-2">Tipo</th><th className="px-4 py-2">Arquivo</th><th className="px-4 py-2">Motivo</th></tr></thead>
                        <tbody>
                          {batch.issues.map((issue, index) => (
                            <tr key={`${issue.entry}-${index}`}>
                              <td className="px-4 py-2">{FISCAL_ANTICIPATION_ISSUE_LABELS[issue.kind]}</td>
                              <td className="px-4 py-2">{issue.entry}</td>
                              <td className="px-4 py-2">{issue.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">Itens do lote de antecipações</caption>
                      <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                        <tr><th className="px-3 py-2">Nota / item</th><th className="px-3 py-2">Produto</th><th className="px-3 py-2">NCM</th><th className="px-3 py-2">CFOP</th><th className="px-3 py-2">Qtd.</th><th className="px-3 py-2">Valor</th><th className="px-3 py-2">IPI</th><th className="px-3 py-2">ICMS ST</th><th className="px-3 py-2">Origem</th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                        {batch.items.map((item) => (
                          <tr key={item.id} className="align-top text-gray-800 dark:text-gray-200">
                            <td className="px-3 py-2 whitespace-nowrap">NF {item.note_number} · item {item.item_number}</td>
                            <td className="px-3 py-2">{item.description || item.code}</td>
                            <td className="px-3 py-2">{item.ncm || "—"}</td>
                            <td className="px-3 py-2">{item.cfop || "—"}</td>
                            <td className="px-3 py-2">{item.quantity ?? "—"}</td>
                            <td className="px-3 py-2">{formatMoney(item.value)}</td>
                            <td className="px-3 py-2">{formatMoney(item.ipi)}</td>
                            <td className="px-3 py-2">{formatMoney(item.icms_st)}</td>
                            <td className="px-3 py-2"><span className="block">{item.entry}</span><span className="block font-mono text-xs text-gray-500 dark:text-gray-400">{item.access_key}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : <p className="text-sm text-gray-600 dark:text-gray-400">Selecione um cliente para consultar ou importar lotes de antecipações.</p>}
    </section>
  );
}
