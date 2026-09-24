import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { BriefcaseBusiness, CircleAlert, Database, Landmark, Plus, Save } from "lucide-react";
import { toast } from "react-toastify";

import { ClientNativeSelect } from "../form/ClientNativeSelect";
import { clientTextFieldClassName, clientTextareaClassName } from "../form/clientFormControls";
import {
  useClientPa,
  useCreateClientPaMutation,
  useUpdateClientPaMutation,
} from "../hooks/useClients";
import type { ClientPaResponse, UpdateClientPaPayload } from "../types";

const PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

type BooleanInputValue = "" | "true" | "false";

type ClientPaFormValues = {
  activities: string;
  tax_billing: string;
  management_billing: string;
  works_bidding: BooleanInputValue;
  dissatisfaction: string;
  registered_collabortors: string;
  unregistered_collabortors: string;
  esocial: BooleanInputValue;
  how_many_banks: BooleanInputValue;
  whitch_banks: string;
  responsible_departments: string;
  works_system: BooleanInputValue;
  system_name: string;
  system_usage_time: string;
  system_value: string;
  system_contact: string;
  system_operations: string;
  cloud_storage: BooleanInputValue;
  which_cloud_storage: string;
  rental_agreement: BooleanInputValue;
  assessment_regime: string;
  permit: string;
  services: string;
};

const textFieldNames = [
  "activities",
  "tax_billing",
  "management_billing",
  "dissatisfaction",
  "whitch_banks",
  "responsible_departments",
  "system_name",
  "system_usage_time",
  "system_value",
  "system_contact",
  "system_operations",
  "which_cloud_storage",
  "assessment_regime",
  "permit",
  "services",
] as const;

const numberFieldNames = [
  "registered_collabortors",
  "unregistered_collabortors",
] as const;

const booleanFieldNames = [
  "works_bidding",
  "esocial",
  "how_many_banks",
  "works_system",
  "cloud_storage",
  "rental_agreement",
] as const;

function toTextValue(value: string | null | undefined) {
  return value ?? "";
}

function toNumberValue(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function toBooleanValue(value: boolean | null | undefined): BooleanInputValue {
  if (value === true) {
    return "true";
  }

  if (value === false) {
    return "false";
  }

  return "";
}

function normalizeTextValue(value: string): string | null {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNumberValue(value: string): number | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function getInvalidIntegerFieldLabel(values: ClientPaFormValues): string | null {
  if (values.registered_collabortors.trim().length > 0) {
    const parsed = Number(values.registered_collabortors.trim());

    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return "Colaboradores registrados";
    }
  }

  if (values.unregistered_collabortors.trim().length > 0) {
    const parsed = Number(values.unregistered_collabortors.trim());

    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return "Colaboradores não registrados";
    }
  }

  return null;
}

function normalizeBooleanValue(value: BooleanInputValue): boolean | null {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function createInitialValues(pa?: ClientPaResponse | null): ClientPaFormValues {
  return {
    activities: toTextValue(pa?.activities),
    tax_billing: toTextValue(pa?.tax_billing),
    management_billing: toTextValue(pa?.management_billing),
    works_bidding: toBooleanValue(pa?.works_bidding),
    dissatisfaction: toTextValue(pa?.dissatisfaction),
    registered_collabortors: toNumberValue(pa?.registered_collabortors),
    unregistered_collabortors: toNumberValue(pa?.unregistered_collabortors),
    esocial: toBooleanValue(pa?.esocial),
    how_many_banks: toBooleanValue(pa?.how_many_banks),
    whitch_banks: toTextValue(pa?.whitch_banks),
    responsible_departments: toTextValue(pa?.responsible_departments),
    works_system: toBooleanValue(pa?.works_system),
    system_name: toTextValue(pa?.system_name),
    system_usage_time: toTextValue(pa?.system_usage_time),
    system_value: toTextValue(pa?.system_value),
    system_contact: toTextValue(pa?.system_contact),
    system_operations: toTextValue(pa?.system_operations),
    cloud_storage: toBooleanValue(pa?.cloud_storage),
    which_cloud_storage: toTextValue(pa?.which_cloud_storage),
    rental_agreement: toBooleanValue(pa?.rental_agreement),
    assessment_regime: toTextValue(pa?.assessment_regime),
    permit: toTextValue(pa?.permit),
    services: toTextValue(pa?.services),
  };
}

function buildUpdatePayload(
  values: ClientPaFormValues,
  pa: ClientPaResponse,
): UpdateClientPaPayload {
  const payload: UpdateClientPaPayload = {};

  for (const fieldName of textFieldNames) {
    const nextValue = normalizeTextValue(values[fieldName]);
    const currentValue = pa[fieldName] ?? null;

    if (nextValue !== currentValue) {
      payload[fieldName] = nextValue;
    }
  }

  for (const fieldName of numberFieldNames) {
    const nextValue = normalizeNumberValue(values[fieldName]);
    const currentValue = pa[fieldName] ?? null;

    if (nextValue !== currentValue) {
      payload[fieldName] = nextValue;
    }
  }

  for (const fieldName of booleanFieldNames) {
    const nextValue = normalizeBooleanValue(values[fieldName]);
    const currentValue = pa[fieldName] ?? null;

    if (nextValue !== currentValue) {
      payload[fieldName] = nextValue;
    }
  }

  return payload;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Não informado";
  }

  return new Date(value).toLocaleDateString("pt-BR");
}

export function ClientPASection({ clientId }: { clientId: string }) {
  const paQuery = useClientPa(clientId);
  const createPaMutation = useCreateClientPaMutation(clientId);
  const updatePaMutation = useUpdateClientPaMutation(clientId);
  const [formValues, setFormValues] = useState<ClientPaFormValues>(createInitialValues());

  const pa = paQuery.data;
  const hasPa = Boolean(pa);
  const updatePayload = useMemo(
    () => (pa ? buildUpdatePayload(formValues, pa) : {}),
    [formValues, pa],
  );
  const hasChanges = Object.keys(updatePayload).length > 0;
  const isBusy = createPaMutation.isPending || updatePaMutation.isPending;

  useEffect(() => {
    setFormValues(createInitialValues(pa));
  }, [pa]);

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;

    setFormValues((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleCreate = async () => {
    try {
      await createPaMutation.mutateAsync();
      toast.success("PA criado com sucesso.");
      await paQuery.refetch();
    } catch (error) {
      // #1310: tela desatualizada. O PA já existe; recarrega para o salvar usar PATCH.
      if ((error as { response?: { status?: number } })?.response?.status === 409) {
        await paQuery.refetch();
        return;
      }

      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Não foi possível criar o PA.";

      toast.error(message);
    }
  };

  const handleUpdate = async () => {
    if (!pa || !hasChanges) {
      return;
    }

    const invalidIntegerField = getInvalidIntegerFieldLabel(formValues);

    if (invalidIntegerField) {
      toast.error(`${invalidIntegerField} deve ser um número inteiro.`);
      return;
    }

    try {
      await updatePaMutation.mutateAsync(updatePayload);
      toast.success("PA atualizado com sucesso.");
      await paQuery.refetch();
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Não foi possível atualizar o PA.";

      toast.error(message);
    }
  };

  if (paQuery.isLoading) {
    return (
      <section className={`${PANEL_CLASSNAME} p-6`}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">PA</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Carregando dados de PA...</p>
      </section>
    );
  }

  if (paQuery.isError) {
    return (
      <section className={`${PANEL_CLASSNAME} p-6`}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">PA</h2>
        <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">
          Não foi possível carregar os dados de PA deste cliente.
        </p>
      </section>
    );
  }

  if (!hasPa) {
    return (
      <section className={`${PANEL_CLASSNAME} p-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">PA</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Este cliente ainda não possui um registro de PA inicializado.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isBusy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {createPaMutation.isPending ? "Criando PA..." : "Criar PA"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={`${PANEL_CLASSNAME} p-6`}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">PA</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Atualize os dados de PA do cliente. O envio considera apenas os campos alterados.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ReadonlyItem label="Razão social" value={pa.client.company_name || "Não informado"} />
        <ReadonlyItem label="Responsável" value={pa.client.responsible || "Não informado"} />
        <ReadonlyItem label="Contato" value={pa.client.email || pa.client.number || "Não informado"} />
        <ReadonlyItem label="Abertura" value={formatDate(pa.client.opening_date)} />
      </div>

      <div className="mt-6 space-y-6">
        <FormGroup
          icon={<BriefcaseBusiness className="h-4 w-4" />}
          title="Operação"
          description="Contexto geral das atividades e da estrutura operacional."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <TextareaField
              label="Atividades"
              name="activities"
              value={formValues.activities}
              onChange={handleInputChange}
            />
            <TextareaField
              label="Serviços"
              name="services"
              value={formValues.services}
              onChange={handleInputChange}
            />
            <InputField
              label="Faturamento tributário"
              name="tax_billing"
              value={formValues.tax_billing}
              onChange={handleInputChange}
            />
            <InputField
              label="Faturamento gerencial"
              name="management_billing"
              value={formValues.management_billing}
              onChange={handleInputChange}
            />
            <InputField
              label="Regime de avaliação"
              name="assessment_regime"
              value={formValues.assessment_regime}
              onChange={handleInputChange}
            />
            <InputField
              label="Alvará / licença"
              name="permit"
              value={formValues.permit}
              onChange={handleInputChange}
            />
            <SelectField
              label="Trabalha com licitação"
              name="works_bidding"
              value={formValues.works_bidding}
              onChange={handleInputChange}
            />
            <SelectField
              label="Possui eSocial"
              name="esocial"
              value={formValues.esocial}
              onChange={handleInputChange}
            />
            <NumberField
              label="Colaboradores registrados"
              name="registered_collabortors"
              value={formValues.registered_collabortors}
              onChange={handleInputChange}
            />
            <NumberField
              label="Colaboradores não registrados"
              name="unregistered_collabortors"
              value={formValues.unregistered_collabortors}
              onChange={handleInputChange}
            />
            <TextareaField
              label="Insatisfações"
              name="dissatisfaction"
              value={formValues.dissatisfaction}
              onChange={handleInputChange}
            />
            <TextareaField
              label="Departamentos responsáveis"
              name="responsible_departments"
              value={formValues.responsible_departments}
              onChange={handleInputChange}
            />
          </div>
        </FormGroup>

        <FormGroup
          icon={<Landmark className="h-4 w-4" />}
          title="Bancos e contratos"
          description="Informações bancárias, locação e estrutura de apoio."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Possui múltiplos bancos"
              name="how_many_banks"
              value={formValues.how_many_banks}
              onChange={handleInputChange}
            />
            <InputField
              label="Quais bancos"
              name="whitch_banks"
              value={formValues.whitch_banks}
              onChange={handleInputChange}
            />
            <SelectField
              label="Possui contrato de aluguel"
              name="rental_agreement"
              value={formValues.rental_agreement}
              onChange={handleInputChange}
            />
            <SelectField
              label="Usa armazenamento em nuvem"
              name="cloud_storage"
              value={formValues.cloud_storage}
              onChange={handleInputChange}
            />
            <InputField
              label="Qual armazenamento em nuvem"
              name="which_cloud_storage"
              value={formValues.which_cloud_storage}
              onChange={handleInputChange}
            />
          </div>
        </FormGroup>

        <FormGroup
          icon={<Database className="h-4 w-4" />}
          title="Sistema"
          description="Dependências de sistema, uso e operação."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Trabalha com sistema"
              name="works_system"
              value={formValues.works_system}
              onChange={handleInputChange}
            />
            <InputField
              label="Nome do sistema"
              name="system_name"
              value={formValues.system_name}
              onChange={handleInputChange}
            />
            <InputField
              label="Tempo de uso"
              name="system_usage_time"
              value={formValues.system_usage_time}
              onChange={handleInputChange}
            />
            <InputField
              label="Valor do sistema"
              name="system_value"
              value={formValues.system_value}
              onChange={handleInputChange}
            />
            <InputField
              label="Contato do sistema"
              name="system_contact"
              value={formValues.system_contact}
              onChange={handleInputChange}
            />
            <TextareaField
              label="Operações do sistema"
              name="system_operations"
              value={formValues.system_operations}
              onChange={handleInputChange}
            />
          </div>
        </FormGroup>
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-6 dark:border-slate-700 md:flex-row md:items-center md:justify-between">
        <div className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <CircleAlert className="h-4 w-4" />
          {hasChanges
            ? "Há alterações prontas para envio."
            : "Nenhuma alteração detectada para atualização."}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setFormValues(createInitialValues(pa))}
            disabled={isBusy || !hasChanges}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Descartar alterações
          </button>
          <button
            type="button"
            onClick={() => void handleUpdate()}
            disabled={isBusy || !hasChanges}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {updatePaMutation.isPending ? "Salvando PA..." : "Salvar PA"}
          </button>
        </div>
      </div>
    </section>
  );
}

function FormGroup({
  children,
  description,
  icon,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40">
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-slate-200 p-2 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ReadonlyItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function InputField({
  label,
  name,
  onChange,
  value,
}: {
  label: string;
  name: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  value: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-sm font-medium text-slate-700 dark:text-white">{label}</span>
      <input name={name} value={value} onChange={onChange} className={clientTextFieldClassName} />
    </label>
  );
}

function NumberField({
  label,
  name,
  onChange,
  value,
}: {
  label: string;
  name: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  value: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-sm font-medium text-slate-700 dark:text-white">{label}</span>
      <input
        name={name}
        value={value}
        onChange={onChange}
        type="number"
        min="0"
        step="1"
        className={clientTextFieldClassName}
      />
    </label>
  );
}

function TextareaField({
  label,
  name,
  onChange,
  value,
}: {
  label: string;
  name: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  value: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-sm font-medium text-slate-700 dark:text-white">{label}</span>
      <textarea name={name} value={value} onChange={onChange} className={clientTextareaClassName} />
    </label>
  );
}

function SelectField({
  label,
  name,
  onChange,
  value,
}: {
  label: string;
  name: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  value: BooleanInputValue;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-sm font-medium text-slate-700 dark:text-white">{label}</span>
      <ClientNativeSelect name={name} value={value} onChange={onChange}>
        <option value="">Não informado</option>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </ClientNativeSelect>
    </label>
  );
}
