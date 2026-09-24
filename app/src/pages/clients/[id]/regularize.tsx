import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-toastify";

import { canSSRAuth } from "@modules/auth";
import { ClientRegularizeForm } from "@modules/clients/components/ClientRegularizeForm";
import { useClient, useUpdateClientRegularizeMutation } from "@modules/clients/hooks/useClients";
import type { ClientRegularizeFormValues } from "@modules/clients/types";
import { getClientInternalName } from "@modules/clients/utils/clientForm";
import {
  buildRegularizePayload,
  createRegularizeInitialValues,
  getRegularizeUnsupportedDateClearError,
  hasRegularizeChanges,
} from "@modules/clients/utils/regularizeForm";
import { getIntegrationEmailError } from "@modules/clients/utils/integrationForm";
import {
  validateCpfCnpjDocument,
  validateOptionalCpfDocument,
} from "@modules/clients/utils/documentValidation";

const PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

export default function ClientRegularizePage() {
  const router = useRouter();
  const clientId = typeof router.query.id === "string" ? router.query.id : undefined;
  const clientQuery = useClient(clientId);
  const updateRegularizeMutation = useUpdateClientRegularizeMutation(clientId ?? "");
  const client = clientQuery.data;
  const [formValues, setFormValues] = useState<ClientRegularizeFormValues | null>(null);

  useEffect(() => {
    if (!client) {
      return;
    }

    setFormValues(createRegularizeInitialValues(client));
  }, [client]);

  const hasChanges = useMemo(() => {
    if (!client || !formValues) {
      return false;
    }

    return hasRegularizeChanges(formValues, client);
  }, [client, formValues]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = event.target;
    const nextValue = type === "checkbox" ? (event.target as HTMLInputElement).checked : value;

    setFormValues((current) =>
      current
        ? {
            ...current,
            [name]: nextValue,
          }
        : current,
    );
  };

  const handleSubmit = async () => {
    if (!clientId || !client || !formValues || !hasChanges) {
      return;
    }

    if (!getClientInternalName(formValues)) {
      toast.error("Preencha o nome do cliente para continuar.");
      return;
    }

    const cpfCnpjError = validateCpfCnpjDocument(formValues.cpf_cnpj);

    if (cpfCnpjError) {
      toast.error(cpfCnpjError);
      return;
    }

    const responsibleCpfError = validateOptionalCpfDocument(
      "CPF do responsável",
      formValues.cpf_responsible,
    );

    if (responsibleCpfError) {
      toast.error(responsibleCpfError);
      return;
    }

    const unsupportedDateClearError = getRegularizeUnsupportedDateClearError(formValues, client);

    if (unsupportedDateClearError) {
      toast.error(unsupportedDateClearError);
      return;
    }

    const payload = buildRegularizePayload(formValues, client);
    const emailError = "email" in payload ? getIntegrationEmailError(formValues.email) : null;

    if (emailError) {
      toast.error(emailError);
      return;
    }

    try {
      await updateRegularizeMutation.mutateAsync(payload);
      toast.success("Fluxo de regularização atualizado com sucesso.");
      await router.push(`/clients/${clientId}`);
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error ===
          "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Não foi possível atualizar o fluxo de regularização.";

      toast.error(message);
    }
  };

  return (
    <>
      <Head>
        <title>Regularize do cliente</title>
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
              {client?.name ? `Regularize de ${client.name}` : "Regularize do cliente"}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Página dedicada para atualização dos dados de regularização.
            </p>
          </div>
        </div>

        {clientQuery.isLoading ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Carregando cliente...
          </section>
        ) : clientQuery.isError ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-rose-600 dark:text-rose-300`}>
            Não foi possível carregar o cliente para o fluxo de regularização.
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
            <ClientRegularizeForm
              values={formValues}
              onChange={handleInputChange}
              onSubmit={() => void handleSubmit()}
              onCancel={() => setFormValues(createRegularizeInitialValues(client))}
              submitLabel={updateRegularizeMutation.isPending ? "Salvando..." : "Salvar alterações"}
              disabled={updateRegularizeMutation.isPending}
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
