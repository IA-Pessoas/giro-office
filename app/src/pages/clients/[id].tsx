import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState, type ChangeEvent } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Calculator,
  CircleDollarSign,
  FileText,
  NotebookText,
  Power,
  RotateCcw,
  ShieldCheck,
  Workflow,
  XCircle,
} from "lucide-react";
import { toast } from "react-toastify";

import { canSSRAuth, isAdminPermission } from "@modules/auth";
import { ClientForm } from "@modules/clients/components/ClientForm";
import { getContabilCardState, useContabilPermissions } from "@modules/contabil";
import {
  useActivateClientMutation,
  useClient,
  useDeactivateClientMutation,
  useUpdateClientMutation,
} from "@modules/clients/hooks/useClients";
import type { ClientFormValues } from "@modules/clients/types";
import { validateCpfCnpjDocument } from "@modules/clients/utils/documentValidation";
import { mapClientStatusFromApi, mapClientStatusToApi } from "@modules/clients/utils/statusMapper";
import { getClientTerminationAccess } from "@modules/clients/utils/terminationAccess";
import { useAuth } from "@/context/AuthContext";

const PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

const statusClassNames: Record<string, string> = {
  Ativo: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  Prospect: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  Inativo: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Fechado: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }

  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }

  return value;
}

function createInitialFormValues(): ClientFormValues {
  return {
    name: "",
    company_name: "",
    fantasy_name: "",
    cpf_cnpj: "",
    status: "Ativo",
    service_unique: false,
  };
}

export default function ClientDetailPage() {
  const router = useRouter();
  const { user } = useAuth();
  const clientId = typeof router.query.id === "string" ? router.query.id : undefined;
  const clientQuery = useClient(clientId);
  const updateClientMutation = useUpdateClientMutation(clientId ?? "");
  const activateClientMutation = useActivateClientMutation(clientId ?? "");
  const deactivateClientMutation = useDeactivateClientMutation(clientId ?? "");
  const { canViewContabil, isLoading: isContabilAccessLoading } = useContabilPermissions();
  const [formValues, setFormValues] = useState<ClientFormValues>(createInitialFormValues());

  const isAdmin = isAdminPermission(user?.permission);
  const client = clientQuery.data;
  const uiStatus = mapClientStatusFromApi(client?.status);
  const terminationAccess = getClientTerminationAccess(client?.status);
  const contabilCardState = getContabilCardState(client?.contabil, canViewContabil);
  const organizationName =
    (client as { organization?: { name?: string } } | null)?.organization?.name ??
    "Organização atual";

  useEffect(() => {
    if (!client) {
      return;
    }

    setFormValues({
      name: client.name ?? "",
      company_name: client.company_name ?? "",
      fantasy_name: client.fantasy_name ?? "",
      cpf_cnpj: client.cpf_cnpj ?? "",
      status: mapClientStatusFromApi(client.status),
      service_unique: client.service_unique ?? false,
    });
  }, [client]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = event.target;
    const nextValue = type === "checkbox" ? (event.target as HTMLInputElement).checked : value;

    setFormValues((current) => ({
      ...current,
      [name]: nextValue,
    }));
  };

  const handleUpdate = async () => {
    if (!clientId) {
      return;
    }

    if (!formValues.name.trim()) {
      toast.error("Preencha o nome do cliente para continuar.");
      return;
    }

    const documentError = validateCpfCnpjDocument(formValues.cpf_cnpj);

    if (documentError) {
      toast.error(documentError);
      return;
    }

    try {
      await updateClientMutation.mutateAsync({
        name: formValues.name.trim(),
        company_name: formValues.company_name.trim() || null,
        fantasy_name: formValues.fantasy_name.trim() || null,
        cpf_cnpj: formValues.cpf_cnpj.replace(/\D/g, ""),
        status: mapClientStatusToApi(formValues.status),
        service_unique: formValues.service_unique,
      });

      toast.success("Cliente atualizado com sucesso.");
      await clientQuery.refetch();
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error ===
          "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Não foi possível atualizar o cliente.";

      toast.error(message);
    }
  };

  const handleActivate = async () => {
    if (!clientId) {
      return;
    }

    try {
      await activateClientMutation.mutateAsync();
      toast.success("Cliente reativado com sucesso.");
      await clientQuery.refetch();
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error ===
          "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Não foi possível reativar o cliente.";

      toast.error(message);
    }
  };

  const handleDeactivate = async () => {
    if (!clientId) {
      return;
    }

    try {
      await deactivateClientMutation.mutateAsync();
      toast.success("Cliente desativado com sucesso.");
      await clientQuery.refetch();
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error ===
          "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Não foi possível desativar o cliente.";

      toast.error(message);
    }
  };

  return (
    <>
      <Head>
        <title>Cliente</title>
      </Head>

      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <Link
              href="/clients"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para clientes
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                {client?.name ?? "Detalhes do cliente"}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">Detalhes do cliente.</p>
            </div>
          </div>

          {client ? (
            <span
              className={`inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${
                statusClassNames[uiStatus] ?? statusClassNames.Inativo
              }`}
            >
              {uiStatus}
            </span>
          ) : null}
        </div>

        {clientQuery.isLoading ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Carregando cliente...
          </section>
        ) : clientQuery.isError ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-rose-600 dark:text-rose-300`}>
            Não foi possível carregar o detalhe deste cliente.
          </section>
        ) : !client ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Cliente não encontrado.
          </section>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className={`${PANEL_CLASSNAME} flex h-full flex-col p-6`}>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Resumo</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <SummaryItem label="Nome" value={client.name} />
                  <SummaryItem label="CPF/CNPJ" value={formatCpfCnpj(client.cpf_cnpj)} />
                  <SummaryItem label="Regime" value={client.regime || "A definir"} />
                  <SummaryItem label="Organização" value={organizationName} />
                  <SummaryItem label="Razão social" value={client.company_name || "Não informado"} />
                  <SummaryItem label="Nome fantasia" value={client.fantasy_name || "Não informado"} />
                </div>
              </div>

              <div className={`${PANEL_CLASSNAME} p-6`}>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Ciclo de vida</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Ações disponíveis apenas para administradores.
                </p>

                <div className="mt-5 flex flex-1 flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => void handleActivate()}
                    disabled={!isAdmin || activateClientMutation.isPending || uiStatus === "Ativo"}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900/60 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {activateClientMutation.isPending ? "Reativando..." : "Reativar cliente"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDeactivate()}
                    disabled={!isAdmin || deactivateClientMutation.isPending || uiStatus === "Inativo"}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30"
                  >
                    <Power className="h-4 w-4" />
                    {deactivateClientMutation.isPending ? "Desativando..." : "Desativar cliente"}
                  </button>

                  <div className="mt-auto grid gap-4 pt-1">
                    <SummaryItem label="Situação" value={uiStatus} />
                    {client.deletion_date ? (
                      <SummaryItem
                        label="Desativado em"
                        value={new Date(client.deletion_date).toLocaleString("pt-BR")}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <section className={`${PANEL_CLASSNAME} p-6`}>
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Editar cliente</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Atualize os dados principais do cliente.
                </p>
              </div>

              <ClientForm
                values={formValues}
                onChange={handleInputChange}
                onSubmit={() => void handleUpdate()}
                onCancel={() =>
                  setFormValues({
                    name: client.name ?? "",
                    company_name: client.company_name ?? "",
                    fantasy_name: client.fantasy_name ?? "",
                    cpf_cnpj: client.cpf_cnpj ?? "",
                    status: mapClientStatusFromApi(client.status),
                    service_unique: client.service_unique ?? false,
                  })
                }
                submitLabel={updateClientMutation.isPending ? "Salvando..." : "Salvar alterações"}
                disabled={updateClientMutation.isPending}
              />
            </section>

            <section className={`${PANEL_CLASSNAME} p-6`}>
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Fluxos</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Acesse os fluxos de atualização do cliente.
                </p>
              </div>

              <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
                <ClientAccessCard
                  title="PA"
                  description="Gerencie os dados de PA do cliente."
                  href={`/clients/${client.id}/pa`}
                  actionLabel="Abrir PA"
                  icon={FileText}
                />

                <ClientAccessCard
                  title="Integração"
                  description="Gerencie os dados de integração do cliente."
                  href={`/clients/${client.id}/integration`}
                  actionLabel="Abrir integração"
                  icon={Workflow}
                />

                <ClientAccessCard
                  title="Comercial"
                  description="Atualize o status de prospecção e os dados comerciais do cliente."
                  href={`/clients/${client.id}/commercial`}
                  actionLabel="Abrir comercial"
                  icon={BriefcaseBusiness}
                />

                <ClientAccessCard
                  title="Financeiro"
                  description="Gerencie a informação de contrato do cliente."
                  href={`/clients/${client.id}/finance`}
                  actionLabel="Abrir financeiro"
                  icon={CircleDollarSign}
                />

                {!isContabilAccessLoading && contabilCardState !== "hidden" ? (
                  <ClientAccessCard
                    title="Contábil"
                    description="Acesse o controle mensal e os cadastros contábeis do cliente."
                    href={`/clients/${client.id}/contabil`}
                    actionLabel="Abrir contábil"
                    icon={Calculator}
                    disabled={contabilCardState === "disabled"}
                    disabledMessage="Serviço contábil não contratado para este cliente."
                  />
                ) : null}

                <ClientAccessCard
                  title="Regularize"
                  description="Atualize os dados cadastrais, fiscais e operacionais do cliente."
                  href={`/clients/${client.id}/regularize`}
                  actionLabel="Abrir regularize"
                  icon={ShieldCheck}
                />

                <ClientAccessCard
                  title="Inativação"
                  description="Inicie o processo de inativação do cliente."
                  href={`/clients/${client.id}/termination`}
                  actionLabel="Abrir inativação"
                  icon={XCircle}
                  blockedMessage={
                    terminationAccess.canOpen ? undefined : terminationAccess.message
                  }
                />
              </div>
            </section>

            <section className={`${PANEL_CLASSNAME} p-6`}>
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Acompanhamento</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Consulte registros e eventos relacionados ao cliente.
                </p>
              </div>

              <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
                <ClientAccessCard
                  title="Históricos"
                  description="Crie e edite históricos do cliente."
                  href={`/clients/${client.id}/histories`}
                  actionLabel="Abrir históricos"
                  icon={NotebookText}
                />
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function ClientAccessCard({
  title,
  description,
  href,
  actionLabel,
  icon: Icon,
  disabled = false,
  disabledMessage,
  blockedMessage,
}: {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  icon: typeof FileText;
  disabled?: boolean;
  disabledMessage?: string;
  blockedMessage?: string;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-950/40">
      <div className="flex h-full flex-col gap-4">
        <div className="min-h-0 flex-1 space-y-1">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
          {disabledMessage ? (
            <p className="pt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
              {disabledMessage}
            </p>
          ) : null}
        </div>

        {disabled ? (
          <span className="inline-flex min-h-12 w-full items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-400 sm:w-auto sm:min-w-[176px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500">
            <Icon className="h-4 w-4" />
            Indisponível
          </span>
        ) : blockedMessage ? (
          <button
            type="button"
            onClick={() => toast.error(blockedMessage)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 self-start rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] sm:w-auto sm:min-w-[176px]"
          >
            <Icon className="h-4 w-4" />
            {actionLabel}
          </button>
        ) : (
          <Link
            href={href}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 self-start rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] sm:w-auto sm:min-w-[176px]"
          >
            <Icon className="h-4 w-4" />
            {actionLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
