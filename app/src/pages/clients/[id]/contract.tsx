import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps, GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import { parseCookies } from "nookies";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowLeft, Printer } from "lucide-react";

import { useModuleAccess } from "@modules/auth";
import { isOrganizationOwner } from "@modules/auth/utils/permissions";
import { resolveModuleAccess } from "@modules/auth/utils/moduleAccess";
import { useClient } from "@modules/clients/hooks/useClients";
import { AccessDeniedPanel } from "@modules/contabil";
import { FormField } from "@shared/components/FormField";
import { setupAPIClient } from "@shared/services/api";
import {
  createCommercialContractDraft,
  isCommercialContractEligible,
  renderCommercialContractTemplate,
  type CommercialContractDraft,
} from "@modules/commercial/utils/commercialContract";

const FIELD_LABELS: Record<
  keyof Omit<CommercialContractDraft, "departments" | "percentages">,
  string
> = {
  contractDate: "Data do contrato",
  competence: "Competência de vigência e rescisão",
  clientName: "Cliente / razão social",
  document: "CNPJ / CPF",
  address: "Endereço",
  neighborhood: "Bairro / distrito",
  city: "Cidade",
  state: "UF",
  postalCode: "CEP",
  phone: "Telefone / celular",
  email: "E-mail",
  representativeName: "Nome do representante legal",
  representativeDocument: "CPF do representante legal",
  serviceStart: "Início da prestação dos serviços",
  paymentDate: "Data de pagamento",
  firstDueDate: "Primeiro vencimento",
  averageRevenue: "Faturamento médio mensal",
  averageEmployees: "Quantidade média de colaboradores",
  taxRegime: "Regime tributário",
  banks: "Quantidade de bancos",
};

const DEPARTMENT_LABELS = {
  contabil: "Contábil",
  fiscal: "Fiscal",
  pessoal: "Pessoal",
  regularize: "Regularize",
  irpj: "Imposto de Renda PJ",
  tecnologia: "Tecnologia",
} as const;

const PERCENTAGE_LABELS = {
  mei: "MEI",
  simplesNacional: "Simples Nacional",
  lucroPresumido: "Lucro Presumido",
  lucroReal: "Lucro Real",
} as const;

const INPUT_CLASS_NAME = [
  "mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3",
  "text-base text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2",
  "focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white",
].join(" ");
type TextField = keyof typeof FIELD_LABELS;
type ClientContractPageProps = { template: string; isOwner: boolean };

export default function ClientContractPage({ template, isOwner }: ClientContractPageProps) {
  const router = useRouter();
  const clientId = typeof router.query.id === "string" ? router.query.id : undefined;
  const clientQuery = useClient(clientId);
  const { access, isLoading: isAccessLoading } = useModuleAccess("comercial");
  const [draft, setDraft] = useState<CommercialContractDraft | null>(null);
  const [draftClientId, setDraftClientId] = useState<string | null>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!clientQuery.data || clientQuery.data.id === draftClientId) return;
    setDraft(createCommercialContractDraft(clientQuery.data));
    setDraftClientId(clientQuery.data.id);
  }, [clientQuery.data, draftClientId]);

  const eligible = clientQuery.data
    ? isCommercialContractEligible(clientQuery.data, isOwner)
    : false;
  const preview = useMemo(() => {
    if (!draft || !template) return "";
    return [
      '<!doctype html><html><head><meta charset="utf-8">',
      "<title>Contrato comercial</title></head><body>",
      renderCommercialContractTemplate(draft, template),
      "</body></html>",
    ].join("");
  }, [draft, template]);

  const updateField = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setDraft((current) => (current ? { ...current, [name]: value } : current));
  };

  if (isAccessLoading || clientQuery.isLoading) {
    return <p className="p-6 text-sm text-slate-500">Carregando dados do contrato...</p>;
  }
  if (!access.canView) return <AccessDeniedPanel />;
  if (clientQuery.isError || !clientQuery.data) {
    return (
      <section
        className={[
          "rounded-2xl border border-slate-200 bg-white p-6 text-sm text-rose-700",
          "dark:border-slate-700 dark:bg-slate-900 dark:text-rose-300",
        ].join(" ")}
      >
        Não foi possível carregar os dados autorizados deste cliente.
      </section>
    );
  }
  if (!eligible) {
    return (
      <section
        className={[
          "rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600",
          "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
        ].join(" ")}
      >
        Este cliente não está elegível para gerar contrato.
      </section>
    );
  }
  if (!draft)
    return <p className="p-6 text-sm text-slate-500">Preparando revisão do contrato...</p>;

  return (
    <>
      <Head>
        <title>Contrato comercial</title>
      </Head>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Link
              href={`/clients/${clientId}`}
              className={[
                "inline-flex items-center gap-2 text-sm font-medium",
                "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white",
              ].join(" ")}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para o cliente
            </Link>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Contrato comercial
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Revise os dados e os serviços antes de imprimir ou salvar em PDF.
            </p>
          </div>
          <button
            type="button"
            onClick={() => previewRef.current?.contentWindow?.print()}
            disabled={!preview}
            className={[
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4",
              "text-sm font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-2",
              "focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50",
            ].join(" ")}
          >
            <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir / salvar em PDF
          </button>
        </header>

        <section
          className={[
            "rounded-2xl border border-slate-200 bg-white p-5",
            "dark:border-slate-700 dark:bg-slate-900",
          ].join(" ")}
        >
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Dados do contrato
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(Object.keys(FIELD_LABELS) as TextField[]).map((field) => (
              <FormField
                key={field}
                label={FIELD_LABELS[field]}
                className="text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                <input
                  type={
                    field === "contractDate" || field === "firstDueDate"
                      ? "date"
                      : field === "competence"
                        ? "month"
                        : "text"
                  }
                  name={field}
                  value={draft[field]}
                  onChange={updateField}
                  className={INPUT_CLASS_NAME}
                />
              </FormField>
            ))}
          </div>
        </section>

        <section
          className={[
            "rounded-2xl border border-slate-200 bg-white p-5",
            "dark:border-slate-700 dark:bg-slate-900",
          ].join(" ")}
        >
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Departamentos e percentuais
          </h2>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Serviços incluídos
            </legend>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
              {Object.entries(DEPARTMENT_LABELS).map(([field, label]) => (
                <label
                  key={field}
                  className={[
                    "inline-flex min-h-10 items-center gap-2 text-sm",
                    "text-slate-700 dark:text-slate-200",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={draft.departments[field as keyof typeof draft.departments]}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              departments: {
                                ...current.departments,
                                [field]: event.target.checked,
                              },
                            }
                          : current,
                      )
                    }
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(PERCENTAGE_LABELS).map(([field, label]) => (
              <FormField
                key={field}
                label={`${label} (%)`}
                className="text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.percentages[field as keyof typeof draft.percentages]}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            percentages: { ...current.percentages, [field]: event.target.value },
                          }
                        : current,
                    )
                  }
                  className={INPUT_CLASS_NAME}
                />
              </FormField>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Os percentuais são exibidos no contrato e não calculam mensalidade.
          </p>
        </section>

        <section
          className={[
            "overflow-hidden rounded-2xl border border-slate-200 bg-white",
            "dark:border-slate-700 dark:bg-slate-900",
          ].join(" ")}
        >
          <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
            <h2 className="font-semibold text-slate-900 dark:text-white">Prévia do documento</h2>
          </div>
          {!preview ? (
            <p className="p-5 text-sm text-slate-500">Carregando prévia...</p>
          ) : (
            <iframe
              ref={previewRef}
              title="Prévia do contrato comercial"
              srcDoc={preview}
              className="h-[75vh] min-h-[640px] w-full bg-white"
            />
          )}
        </section>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ClientContractPageProps> = async (
  ctx: GetServerSidePropsContext,
) => {
  if (!parseCookies(ctx)["cw.session"]) {
    return { redirect: { destination: "/login", permanent: false } };
  }

  try {
    const response = await setupAPIClient(ctx).get("/user/me");
    const user = response.data?.data;
    const isOwner = isOrganizationOwner(user);
    const access = resolveModuleAccess({
      module: "comercial",
      additionalModulePermissions: user?.modules,
      isGlobalAdmin: isOwner,
    });
    if (!access.canView) return { redirect: { destination: "/dashboard", permanent: false } };

    const { getCommercialContractTemplate } = await import(
      "@modules/commercial/commercialContractTemplate.server"
    );
    ctx.res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return { props: { template: getCommercialContractTemplate(), isOwner } };
  } catch {
    return { redirect: { destination: "/login", permanent: false } };
  }
};
