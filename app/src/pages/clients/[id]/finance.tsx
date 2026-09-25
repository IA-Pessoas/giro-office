import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "@shared/services/toast";

import { canSSRAuth } from "@modules/auth";
import { ClientFinanceForm } from "@modules/clients/components/ClientFinanceForm";
import { useClient, useUpdateClientFinanceMutation } from "@modules/clients/hooks/useClients";
import type { ClientFinanceFormValues } from "@modules/clients/types";
import {
  buildFinancePayload,
  createFinanceInitialValues,
  hasFinanceChanges,
} from "@modules/clients/utils/financeForm";

const PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

export default function ClientFinancePage() {
  const router = useRouter();
  const clientId = typeof router.query.id === "string" ? router.query.id : undefined;
  const clientQuery = useClient(clientId);
  const updateFinanceMutation = useUpdateClientFinanceMutation(clientId ?? "");
  const client = clientQuery.data;
  const [formValues, setFormValues] = useState<ClientFinanceFormValues | null>(null);

  useEffect(() => {
    if (!client) {
      return;
    }

    setFormValues(createFinanceInitialValues(client));
  }, [client]);

  const hasChanges = useMemo(() => {
    if (!client || !formValues) {
      return false;
    }

    return hasFinanceChanges(formValues, client);
  }, [client, formValues]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;

    setFormValues((current) =>
      current
        ? {
            ...current,
            [name]: checked,
          }
        : current,
    );
  };

  const handleSubmit = async () => {
    if (!clientId || !client || !formValues || !hasChanges) {
      return;
    }

    try {
      await updateFinanceMutation.mutateAsync(buildFinancePayload(formValues, client));
      toast.success("Fluxo financeiro atualizado com sucesso.");
      await router.push(`/clients/${clientId}`);
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error ===
          "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Não foi possível atualizar o fluxo financeiro.";

      toast.error(message);
    }
  };

  return (
    <>
      <Head>
        <title>Financeiro do cliente</title>
      </Head>

      <div className="space-y-6">
        <div className="space-y-2">
          <Link
            href={clientId ? `/clients/${clientId}` : "/clients"}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para detalhes do cliente
          </Link>

          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              {client?.name ? `Financeiro de ${client.name}` : "Financeiro do cliente"}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Página dedicada para atualização do contrato financeiro.
            </p>
          </div>
        </div>

        {clientQuery.isLoading ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Carregando cliente...
          </section>
        ) : clientQuery.isError ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-rose-600 dark:text-rose-300`}>
            Não foi possível carregar o cliente para o fluxo financeiro.
          </section>
        ) : !clientId ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Cliente inválido.
          </section>
        ) : !client ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Cliente não encontrado.
          </section>
        ) : formValues ? (
          <section className={`${PANEL_CLASSNAME} p-6`}>
            <ClientFinanceForm
              values={formValues}
              onChange={handleInputChange}
              onSubmit={() => void handleSubmit()}
              onCancel={() => setFormValues(createFinanceInitialValues(client))}
              submitLabel={updateFinanceMutation.isPending ? "Salvando..." : "Salvar alterações"}
              disabled={updateFinanceMutation.isPending}
              submitDisabled={!hasChanges}
            />
          </section>
        ) : null}
      </div>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
