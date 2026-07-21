import { Activity, Building2, Headphones, Info, Users } from "lucide-react";

import type { PlatformOrganization } from "../types";
import { PlatformUsersPanel } from "./PlatformUsersPanel";

export type SuperAdminDetailTab = "overview" | "users" | "audit" | "support";

interface OrganizationDetailPanelProps {
  organization: PlatformOrganization | null;
  activeTab: SuperAdminDetailTab;
  onChangeTab: (tab: SuperAdminDetailTab) => void;
}

const DETAIL_TABS = [
  { key: "overview", label: "Visão geral", icon: Info },
  { key: "users", label: "Usuários", icon: Users },
  { key: "audit", label: "Auditoria", icon: Activity },
  { key: "support", label: "Suporte", icon: Headphones },
] as const;

function formatDate(value?: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("pt-BR");
}

function getStatusLabel(status: string): string {
  const normalizedStatus = status.trim().toLowerCase();

  if (normalizedStatus === "active") {
    return "Ativa";
  }

  if (normalizedStatus === "trial") {
    return "Trial";
  }

  if (normalizedStatus === "past_due") {
    return "Em atraso";
  }

  if (normalizedStatus === "suspended") {
    return "Suspensa";
  }

  if (normalizedStatus === "cancelled") {
    return "Cancelada";
  }

  return status || "Sem status";
}

function DetailItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="border-t border-slate-100 py-3 first:border-t-0 dark:border-slate-800">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-900 dark:text-white">
        {value || "-"}
      </p>
    </div>
  );
}

function FutureScopeState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center dark:border-slate-700 dark:bg-slate-950/30">
      <div className="max-w-md">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</p>
      </div>
    </div>
  );
}

export function OrganizationDetailPanel({
  organization,
  activeTab,
  onChangeTab,
}: OrganizationDetailPanelProps) {
  if (!organization) {
    return (
      <section className="flex min-h-[620px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
        <div className="max-w-md">
          <Building2 className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Nenhuma organização selecionada.
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Selecione uma organização no diretório para abrir os detalhes.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-[620px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900 xl:h-full">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold text-slate-900 dark:text-white">
                {organization.name}
              </h2>
              <span className="rounded-full bg-[var(--colors-brand-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300">
                {getStatusLabel(organization.status)}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {organization.slug}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400">Plano: </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {organization.subscription_plan}
            </span>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-1 overflow-x-auto">
            {DETAIL_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onChangeTab(tab.key)}
                  className={`min-w-fit flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-[var(--colors-brand-soft)] text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon className="mr-2 inline-block h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
          {activeTab === "overview" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Identificação
                </h3>
                <div className="mt-3">
                  <DetailItem label="Nome" value={organization.name} />
                  <DetailItem label="Slug" value={organization.slug} />
                  <DetailItem label="CNPJ" value={organization.cnpj} />
                  <DetailItem label="Criador" value={organization.email_created_by} />
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Operação
                </h3>
                <div className="mt-3">
                  <DetailItem label="Status" value={getStatusLabel(organization.status)} />
                  <DetailItem label="Plano" value={organization.subscription_plan} />
                  <DetailItem label="Criada em" value={formatDate(organization.created_at)} />
                  <DetailItem label="Atualizada em" value={formatDate(organization.updated_at)} />
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "users" ? <PlatformUsersPanel organization={organization} /> : null}

          {activeTab === "audit" ? (
            <FutureScopeState
              title="Auditoria entra na próxima etapa de frontend."
              description="A aba fica reservada para consumir os registros do audit-service sem misturar esse escopo com a listagem inicial de organizações e usuários."
            />
          ) : null}

          {activeTab === "support" ? (
            <FutureScopeState
              title="Suporte assistido entra na próxima etapa de frontend."
              description="A troca de token e o banner persistente ficam fora desta task para preservar a revisão por PR."
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
