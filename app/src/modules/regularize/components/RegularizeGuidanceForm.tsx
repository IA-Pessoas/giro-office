import { ClientPickerModal } from "@modules/clients";
import { Dialog } from "@shared/components";
import { formatCpfCnpjInput, normalizeDigits } from "@shared/utils/inputFormatting";
import {
  REGULARIZE_GUIDANCE_CHECKLIST_ITEMS,
  REGULARIZE_GUIDANCE_CHECKLIST_STATUSES,
  REGULARIZE_GUIDANCE_TARGET_TYPES,
  type RegularizeGuidanceBranchData,
  type RegularizeGuidanceChecklistCode,
  type RegularizeGuidanceChecklistStatus,
  type RegularizeGuidanceTargetType,
} from "@workspace/shared/regularize";
import { type FormEvent, useEffect, useState } from "react";

import type {
  CreateRegularizeGuidancePayload,
  RegularizeGuidance,
  RegularizeGuidanceChecklistInput,
  RegularizeGuidanceManualSnapshot,
  UpdateRegularizeGuidancePayload,
} from "../types";
import {
  getRegularizeMutationErrorMessage,
  toRegularizeOptionalNumber,
  trimRegularizeOptionalText,
  trimRegularizeText,
} from "../utils/regularizeForm";
import { RegularizeClientPfSelect } from "./RegularizeClientPfSelect";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";
import {
  RegularizeFormActions,
  RegularizeFormError,
  RegularizeFormField,
  type RegularizeFormOption,
  regularizeSecondaryButtonClassName,
  regularizeTextareaClassName,
  regularizeTextFieldClassName,
} from "./regularizeFormControls";

const regularizeGuidanceStatusOptions = ["Em andamento", "Finalizado"] as const;

type RegularizeGuidanceStatus = (typeof regularizeGuidanceStatusOptions)[number];
type RegularizeGuidanceSnapshotState = RegularizeGuidanceManualSnapshot & Record<string, unknown>;

type RegularizeGuidanceFormState = {
  process_id: string;
  target_type: RegularizeGuidanceTargetType;
  client_pj_id: string;
  client_pf_id: string;
  target_snapshot: RegularizeGuidanceSnapshotState;
  checklist: RegularizeGuidanceChecklistInput[];
  branch_data: RegularizeGuidanceBranchData | null;
  type: string;
  request: string;
  framework_obs: string;
  legal_nature: string;
  company_name: string;
  trade_name: string;
  cpf_cnpj: string;
  share_capital: string;
  iptu: string;
  address: string;
  comporate_purpose: string;
  carryng: string;
  regime: string;
  legal_representative: string;
  status: string;
};

function normalizeGuidanceStatus(value: string | null | undefined): RegularizeGuidanceStatus {
  return value === "Finalizado" ? "Finalizado" : "Em andamento";
}

function buildGuidanceFormState(
  guidance: RegularizeGuidance | null,
  defaultProcessId = "",
): RegularizeGuidanceFormState {
  const targetSnapshot: RegularizeGuidanceSnapshotState = {
    ...(guidance?.target_snapshot ?? {}),
    version: 1,
    source: "manual",
    name: guidance?.target_snapshot?.name ?? guidance?.company_name ?? "",
  };
  const targetState = {
    target_type: guidance?.target_type ?? "SEM_CLIENTE",
    client_pj_id: guidance?.target_type === "PJ" ? (guidance.client_pj_id ?? "") : "",
    client_pf_id: guidance?.target_type === "PF" ? (guidance.client_pf_id ?? "") : "",
    target_snapshot: targetSnapshot,
    checklist: REGULARIZE_GUIDANCE_CHECKLIST_ITEMS.map(({ code }) => {
      const item = guidance?.checklist_items?.find((entry) => entry.code === code);
      return { code, status: item?.status ?? "Pendente", observation: item?.observation ?? "" };
    }),
    branch_data: guidance?.checklist_items?.some(
      (item) => item.code === "branch" && item.status === "Concluído",
    )
      ? guidance.branch_data
      : null,
  };
  if (!guidance) {
    return {
      ...targetState,
      process_id: defaultProcessId,
      type: "",
      request: "",
      framework_obs: "",
      legal_nature: "",
      company_name: "",
      trade_name: "",
      cpf_cnpj: "",
      share_capital: "",
      iptu: "",
      address: "",
      comporate_purpose: "",
      carryng: "",
      regime: "",
      legal_representative: "",
      status: "Em andamento" as RegularizeGuidanceStatus,
    };
  }

  return {
    ...targetState,
    process_id: guidance.process_id ?? "",
    type: guidance.type ?? targetSnapshot.type ?? "",
    request: guidance.request ?? targetSnapshot.request ?? "",
    framework_obs: guidance.framework_obs ?? targetSnapshot.framework_obs ?? "",
    legal_nature: guidance.legal_nature ?? targetSnapshot.legal_nature ?? "",
    company_name: guidance.company_name ?? targetSnapshot.company_name ?? "",
    trade_name: guidance.trade_name ?? targetSnapshot.trade_name ?? "",
    cpf_cnpj: formatCpfCnpjInput(guidance.cpf_cnpj ?? ""),
    share_capital:
      guidance.share_capital === null || guidance.share_capital === undefined
        ? ""
        : String(guidance.share_capital),
    iptu: guidance.iptu ?? targetSnapshot.iptu ?? "",
    address: guidance.address ?? targetSnapshot.address ?? "",
    comporate_purpose: guidance.comporate_purpose ?? targetSnapshot.comporate_purpose ?? "",
    carryng: guidance.carryng ?? targetSnapshot.carryng ?? "",
    regime: guidance.regime ?? targetSnapshot.regime ?? "",
    legal_representative:
      guidance.legal_representative ?? targetSnapshot.legal_representative ?? "",
    status: normalizeGuidanceStatus(guidance.status ?? targetSnapshot.status),
  };
}

function buildGuidancePayload(
  formState: RegularizeGuidanceFormState,
): Extract<CreateRegularizeGuidancePayload, { checklist: RegularizeGuidanceChecklistInput[] }> {
  const isBranchCompleted = formState.checklist.some(
    (item) => item.code === "branch" && item.status === "Concluído",
  );
  const branch = formState.branch_data;
  const targetSnapshotAddress = formState.target_snapshot.address ?? "";
  const targetSnapshotCity = formState.target_snapshot.city ?? "";
  const targetSnapshotState = formState.target_snapshot.state ?? "";
  const manualTargetSnapshot = {
    ...formState.target_snapshot,
    version: 1,
    source: "manual",
    name: formState.target_snapshot.name.trim(),
    document: normalizeDigits(formState.target_snapshot.document ?? ""),
    address: trimRegularizeOptionalText(targetSnapshotAddress),
    city: trimRegularizeOptionalText(targetSnapshotCity),
    state: trimRegularizeOptionalText(targetSnapshotState),
    type: trimRegularizeOptionalText(formState.type),
    request: trimRegularizeOptionalText(formState.request),
    framework_obs: trimRegularizeOptionalText(formState.framework_obs),
    legal_nature: trimRegularizeOptionalText(formState.legal_nature),
    company_name: trimRegularizeOptionalText(formState.company_name),
    trade_name: trimRegularizeOptionalText(formState.trade_name),
    cpf_cnpj: normalizeDigits(trimRegularizeOptionalText(formState.cpf_cnpj) ?? ""),
    share_capital: toRegularizeOptionalNumber(formState.share_capital),
    iptu: trimRegularizeOptionalText(formState.iptu),
    comporate_purpose: trimRegularizeOptionalText(formState.comporate_purpose),
    carryng: trimRegularizeOptionalText(formState.carryng),
    regime: trimRegularizeOptionalText(formState.regime),
    legal_representative: trimRegularizeOptionalText(formState.legal_representative),
    status: formState.status,
  } satisfies RegularizeGuidanceManualSnapshot;
  return {
    process_id: formState.process_id || null,
    target_type: formState.target_type,
    client_pj_id: formState.target_type === "PJ" ? formState.client_pj_id : null,
    client_pf_id: formState.target_type === "PF" ? formState.client_pf_id : null,
    target_snapshot: formState.target_type === "SEM_CLIENTE" ? manualTargetSnapshot : undefined,
    checklist: REGULARIZE_GUIDANCE_CHECKLIST_ITEMS.map(({ code }) => {
      const item = formState.checklist.find((entry) => entry.code === code);
      return {
        code,
        status: item?.status ?? "Pendente",
        observation: item?.observation?.trim() ?? "",
      };
    }),
    branch_data: isBranchCompleted
      ? {
          name: branch?.name.trim() ?? "",
          document: normalizeDigits(branch?.document ?? "") || undefined,
          address: branch?.address.trim() ?? "",
          city: branch?.city.trim() ?? "",
          state: branch?.state.trim() ?? "",
        }
      : undefined,
    type: trimRegularizeOptionalText(formState.type),
    request: trimRegularizeOptionalText(formState.request),
    framework_obs: trimRegularizeOptionalText(formState.framework_obs),
    legal_nature: trimRegularizeOptionalText(formState.legal_nature),
    company_name: trimRegularizeOptionalText(formState.company_name),
    trade_name: trimRegularizeOptionalText(formState.trade_name),
    cpf_cnpj: normalizeDigits(trimRegularizeOptionalText(formState.cpf_cnpj)),
    share_capital: toRegularizeOptionalNumber(formState.share_capital),
    iptu: trimRegularizeOptionalText(formState.iptu),
    address: trimRegularizeOptionalText(formState.address),
    comporate_purpose: trimRegularizeOptionalText(formState.comporate_purpose),
    carryng: trimRegularizeOptionalText(formState.carryng),
    regime: trimRegularizeOptionalText(formState.regime),
    legal_representative: trimRegularizeOptionalText(formState.legal_representative),
    status: trimRegularizeText(formState.status),
  };
}

export function RegularizeGuidanceForm({
  defaultProcessId,
  guidance,
  isSubmitting,
  mode,
  onClose,
  onSubmit,
  open,
  processOptions = [],
  processOptionsLoading = false,
  processOptionsError = null,
  readOnly = false,
}: {
  defaultProcessId?: string;
  guidance: RegularizeGuidance | null;
  isSubmitting: boolean;
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (
    payload: CreateRegularizeGuidancePayload | UpdateRegularizeGuidancePayload,
  ) => Promise<void>;
  open: boolean;
  processOptions?: RegularizeFormOption[];
  processOptionsLoading?: boolean;
  processOptionsError?: string | null;
  readOnly?: boolean;
}) {
  const [formState, setFormState] = useState<RegularizeGuidanceFormState>(
    buildGuidanceFormState(guidance, defaultProcessId),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = mode === "edit";
  const isBranchCompleted = formState.checklist.some(
    (item) => item.code === "branch" && item.status === "Concluído",
  );

  useEffect(() => {
    if (open) {
      setFormState(buildGuidanceFormState(guidance, defaultProcessId));
      setFormError(null);
    }
  }, [defaultProcessId, guidance, open]);

  function handleChange<K extends keyof RegularizeGuidanceFormState>(
    key: K,
    value: RegularizeGuidanceFormState[K],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleTargetChange(target_type: RegularizeGuidanceTargetType) {
    setFormState((current) => ({
      ...current,
      target_type,
      client_pj_id: "",
      client_pf_id: "",
      target_snapshot: { version: 1, source: "manual", name: "" },
    }));
  }

  function handleChecklistStatus(
    code: RegularizeGuidanceChecklistCode,
    status: RegularizeGuidanceChecklistStatus,
  ) {
    setFormState((current) => ({
      ...current,
      checklist: current.checklist.map((item) => (item.code === code ? { ...item, status } : item)),
      ...(code === "branch" && status !== "Concluído" ? { branch_data: null } : {}),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || isSubmitting) return;
    setFormError(null);

    if (!formState.status.trim() || (isEditing && !guidance)) {
      setFormError("Preencha os campos obrigatórios.");
      return;
    }

    if (
      (formState.target_type === "PJ" && (!formState.client_pj_id || formState.client_pf_id)) ||
      (formState.target_type === "PF" && (!formState.client_pf_id || formState.client_pj_id))
    ) {
      setFormError("Selecione um cadastro compatível com o alvo PJ ou PF.");
      return;
    }
    if (
      formState.target_type === "SEM_CLIENTE" &&
      (!formState.target_snapshot.name.trim() || formState.client_pj_id || formState.client_pf_id)
    ) {
      setFormError("Informe o nome do não cliente e remova os vínculos cadastrais.");
      return;
    }
    const branch = formState.branch_data;
    if (
      isBranchCompleted &&
      (!branch ||
        !branch.name.trim() ||
        !branch.address.trim() ||
        !branch.city.trim() ||
        !branch.state.trim())
    ) {
      setFormError("Preencha nome, endereço, cidade e UF da filial concluída.");
      return;
    }

    try {
      const payload = buildGuidancePayload(formState);

      if (isEditing && guidance) {
        await onSubmit({
          ...payload,
          id: guidance.id,
        });
      } else {
        await onSubmit(payload);
      }
    } catch (error) {
      setFormError(
        getRegularizeMutationErrorMessage(error, "Não foi possível salvar a orientação."),
      );
    }
  }

  return (
    <Dialog
      open={open}
      preventClose={isSubmitting}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSubmitting) {
          onClose();
        }
      }}
      title={
        readOnly ? "Consultar orientação" : isEditing ? "Editar orientação" : "Nova orientação"
      }
      description="Orientação do Regularize, com processo opcional."
      contentClassName="w-[min(94vw,920px)]"
      bodyClassName="max-h-[72vh] overflow-y-auto"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <RegularizeFormError message={formError} />
        {readOnly ? <output>Somente leitura.</output> : null}

        <fieldset disabled={readOnly || isSubmitting} className="space-y-4">
          <legend className="sr-only">Dados da orientação</legend>
          <div className="grid gap-4 md:grid-cols-3">
            <RegularizeFormField label="Processo (opcional)" className="md:col-span-2">
              <RegularizeNativeSelect
                value={formState.process_id}
                onChange={(event) => handleChange("process_id", event.target.value)}
                disabled={processOptionsLoading || Boolean(processOptionsError)}
              >
                <option value="">Sem processo</option>
                {formState.process_id &&
                !processOptions.some((process) => process.id === formState.process_id) ? (
                  <option value={formState.process_id}>Processo vinculado (fora da lista)</option>
                ) : null}
                {processOptions.map((process) => (
                  <option key={process.id} value={process.id}>
                    {process.label}
                    {process.description ? `, ${process.description}` : ""}
                  </option>
                ))}
              </RegularizeNativeSelect>
              {processOptionsLoading ? <output>Carregando processos...</output> : null}
              {processOptionsError ? <span role="alert">{processOptionsError}</span> : null}
            </RegularizeFormField>

            <RegularizeFormField label="Alvo" required>
              <RegularizeNativeSelect
                value={formState.target_type}
                onChange={(event) =>
                  handleTargetChange(event.target.value as RegularizeGuidanceTargetType)
                }
              >
                {REGULARIZE_GUIDANCE_TARGET_TYPES.map((target) => (
                  <option key={target} value={target}>
                    {target === "SEM_CLIENTE" ? "Não cliente" : target}
                  </option>
                ))}
              </RegularizeNativeSelect>
            </RegularizeFormField>
            {formState.target_type === "PJ" ? (
              <fieldset className="md:col-span-2 space-y-2">
                <legend>Cliente PJ *</legend>
                <ClientPickerModal
                  filters={{ status: "Todos", legacyIntegrationStatusFilter: false }}
                  selectedClient={
                    formState.client_pj_id
                      ? {
                          id: formState.client_pj_id,
                          name: formState.target_snapshot.name || "Cliente PJ vinculado",
                          document: formState.target_snapshot.document,
                        }
                      : null
                  }
                  onSelectClient={(client) =>
                    setFormState((current) => ({
                      ...current,
                      client_pj_id: client?.id ?? "",
                      client_pf_id: "",
                      target_snapshot: {
                        version: 1,
                        source: "manual",
                        name: client?.name ?? "",
                        document: client?.document ?? "",
                      },
                    }))
                  }
                />
              </fieldset>
            ) : formState.target_type === "PF" ? (
              <fieldset className="md:col-span-2 space-y-2">
                <legend>Cliente PF *</legend>
                <RegularizeClientPfSelect
                  value={formState.client_pf_id}
                  onChange={(id, option) =>
                    setFormState((current) => ({
                      ...current,
                      client_pj_id: "",
                      client_pf_id: id,
                      target_snapshot: {
                        version: 1,
                        source: "manual",
                        name: option?.label ?? "",
                        document: option?.cpf ?? "",
                      },
                    }))
                  }
                />
              </fieldset>
            ) : null}
            <fieldset
              className="grid gap-4 md:grid-cols-3 md:col-span-3"
              disabled={formState.target_type !== "SEM_CLIENTE"}
            >
              <legend>
                {formState.target_type === "SEM_CLIENTE"
                  ? "Dados do não cliente"
                  : "Snapshot cadastral"}
              </legend>
              {(
                [
                  ["name", "Nome"],
                  ["document", "Documento"],
                  ["address", "Endereço cadastral"],
                  ["city", "Cidade"],
                  ["state", "UF"],
                ] as const
              ).map(([key, label]) => (
                <RegularizeFormField
                  key={key}
                  label={label}
                  required={key === "name" && formState.target_type === "SEM_CLIENTE"}
                >
                  <input
                    value={formState.target_snapshot[key] ?? ""}
                    onChange={(event) =>
                      handleChange("target_snapshot", {
                        ...formState.target_snapshot,
                        [key]:
                          key === "document"
                            ? formatCpfCnpjInput(event.target.value)
                            : event.target.value,
                      })
                    }
                    className={regularizeTextFieldClassName}
                  />
                </RegularizeFormField>
              ))}
            </fieldset>

            <RegularizeFormField label="Status" required>
              <RegularizeNativeSelect
                value={formState.status}
                onChange={(event) => handleChange("status", event.target.value)}
              >
                {regularizeGuidanceStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </RegularizeNativeSelect>
            </RegularizeFormField>

            <RegularizeFormField label="Tipo">
              <input
                value={formState.type}
                onChange={(event) => handleChange("type", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Solicitação">
              <input
                value={formState.request}
                onChange={(event) => handleChange("request", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField
              label="Natureza jurídica"
              help="Classificação jurídica da empresa conforme o cadastro oficial."
            >
              <input
                value={formState.legal_nature}
                onChange={(event) => handleChange("legal_nature", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Razão social">
              <input
                value={formState.company_name}
                onChange={(event) => handleChange("company_name", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Nome fantasia">
              <input
                value={formState.trade_name}
                onChange={(event) => handleChange("trade_name", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="CPF/CNPJ">
              <input
                value={formState.cpf_cnpj}
                onChange={(event) =>
                  handleChange("cpf_cnpj", formatCpfCnpjInput(event.target.value))
                }
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Capital social">
              <input
                type="number"
                min="0"
                step="0.01"
                value={formState.share_capital}
                onChange={(event) => handleChange("share_capital", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="IPTU">
              <input
                value={formState.iptu}
                onChange={(event) => handleChange("iptu", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Endereço" className="md:col-span-2">
              <input
                value={formState.address}
                onChange={(event) => handleChange("address", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Regime">
              <input
                value={formState.regime}
                onChange={(event) => handleChange("regime", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Porte">
              <input
                value={formState.carryng}
                onChange={(event) => handleChange("carryng", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Representante legal">
              <input
                value={formState.legal_representative}
                onChange={(event) => handleChange("legal_representative", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Objeto social" className="md:col-span-3">
              <textarea
                value={formState.comporate_purpose}
                onChange={(event) => handleChange("comporate_purpose", event.target.value)}
                className={regularizeTextareaClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Observações de enquadramento" className="md:col-span-3">
              <textarea
                value={formState.framework_obs}
                onChange={(event) => handleChange("framework_obs", event.target.value)}
                className={regularizeTextareaClassName}
              />
            </RegularizeFormField>
          </div>

          <fieldset className="space-y-3">
            <legend className="font-medium">Checklist da orientação</legend>
            {REGULARIZE_GUIDANCE_CHECKLIST_ITEMS.map(({ code, label }) => {
              const item = formState.checklist.find((entry) => entry.code === code);
              return (
                <fieldset
                  key={code}
                  className="grid gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-2 dark:border-slate-700"
                >
                  <legend className="text-sm font-medium">{label}</legend>
                  <RegularizeFormField label={`Status — ${label}`}>
                    <RegularizeNativeSelect
                      value={item?.status ?? "Pendente"}
                      onChange={(event) =>
                        handleChecklistStatus(
                          code,
                          event.target.value as RegularizeGuidanceChecklistStatus,
                        )
                      }
                    >
                      {REGULARIZE_GUIDANCE_CHECKLIST_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </RegularizeNativeSelect>
                  </RegularizeFormField>
                  <RegularizeFormField label={`Observação — ${label}`}>
                    <textarea
                      value={item?.observation ?? ""}
                      onChange={(event) =>
                        handleChange(
                          "checklist",
                          formState.checklist.map((entry) =>
                            entry.code === code
                              ? { ...entry, observation: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      className={regularizeTextareaClassName}
                    />
                  </RegularizeFormField>
                </fieldset>
              );
            })}
          </fieldset>
          <fieldset disabled={!isBranchCompleted} className="grid gap-4 md:grid-cols-3">
            <legend className="font-medium">Dados da filial</legend>
            <p className="md:col-span-3 text-sm text-gray-500">
              Disponíveis quando o item Filial estiver Concluído.
            </p>
            {(
              [
                ["name", "Nome da filial"],
                ["document", "Documento da filial"],
                ["address", "Endereço da filial"],
                ["city", "Cidade da filial"],
                ["state", "UF da filial"],
              ] as const
            ).map(([key, label]) => (
              <RegularizeFormField
                key={key}
                label={label}
                required={isBranchCompleted && key !== "document"}
              >
                <input
                  value={formState.branch_data?.[key] ?? ""}
                  onChange={(event) =>
                    handleChange("branch_data", {
                      name: "",
                      address: "",
                      city: "",
                      state: "",
                      ...formState.branch_data,
                      [key]:
                        key === "document"
                          ? formatCpfCnpjInput(event.target.value)
                          : event.target.value,
                    })
                  }
                  className={regularizeTextFieldClassName}
                />
              </RegularizeFormField>
            ))}
          </fieldset>
        </fieldset>

        {readOnly ? (
          <button type="button" onClick={onClose} className={regularizeSecondaryButtonClassName}>
            Fechar
          </button>
        ) : (
          <RegularizeFormActions
            isSubmitting={isSubmitting}
            onCancel={onClose}
            submitLabel={isEditing ? "Salvar alterações" : "Criar orientação"}
          />
        )}
      </form>
    </Dialog>
  );
}
