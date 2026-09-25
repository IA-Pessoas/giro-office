import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { useAssignableUsers } from "@modules/rh";
import { ConfirmationDialog } from "@shared/components";
import { cn } from "@shared/ui/newLayout/utils";

import {
  useCreatePessoalPasswordMutation,
  useDeletePessoalPasswordMutation,
  usePessoalPasswordDetail,
  usePessoalPasswords,
  useUpdatePessoalPasswordMutation,
} from "../hooks/usePessoalPasswords";
import { hasPessoalPasswordSecretFields } from "../services/pessoalService";
import type {
  PessoalPasswordDetail,
  PessoalPasswordListItem,
  PessoalPasswordPayload,
  PessoalPasswordUpdatePayload,
} from "../types/passwords";
import { getPessoalErrorMessage } from "../utils/pessoalErrorMessage";
import {
  pessoalPrimaryButtonClassName,
  pessoalSecondaryButtonClassName,
  pessoalTextFieldClassName,
} from "./pessoalFormControls";
import { optional } from "./pessoalFormValueHelpers";
import { PessoalPlaceholderSection } from "./PessoalPlaceholderSection";

interface PessoalPasswordsSectionProps {
  selectedClientId: string;
  canEdit: boolean;
}

type PasswordFormValues = {
  service_name: string;
  login_main: string;
  senha_main: string;
  login_secondary: string;
  senha_secondary: string;
  responsavel_id: string;
  notes: string;
};

type SecretFieldName =
  | "login_main"
  | "senha_main"
  | "login_secondary"
  | "senha_secondary";

const emptyPasswordFormValues: PasswordFormValues = {
  service_name: "",
  login_main: "",
  senha_main: "",
  login_secondary: "",
  senha_secondary: "",
  responsavel_id: "",
  notes: "",
};

const secretFields = [
  { name: "login_main", label: "Login principal" },
  { name: "senha_main", label: "Senha principal" },
  { name: "login_secondary", label: "Login secundário" },
  { name: "senha_secondary", label: "Senha secundária" },
] as const satisfies ReadonlyArray<{ name: SecretFieldName; label: string }>;

const PESSOAL_PASSWORD_CUSTOM_SERVICE_OPTION = "__custom_service__";

const pessoalPasswordServiceOptions = [
  "Portal eSocial",
  "Gov.br",
  "Cefaz",
  "Feira Legal",
  "Prefeitura",
  "Bem Mais",
  "BSF",
  "Onvio",
] as const;

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isPessoalPasswordKnownService(value: string): boolean {
  return pessoalPasswordServiceOptions.includes(
    value as (typeof pessoalPasswordServiceOptions)[number],
  );
}

function buildPasswordFormValues(
  password: PessoalPasswordDetail | PessoalPasswordListItem | null,
): PasswordFormValues {
  if (!password) {
    return emptyPasswordFormValues;
  }

  return {
    service_name: password.service_name,
    login_main: "",
    senha_main: "",
    login_secondary: "",
    senha_secondary: "",
    responsavel_id: password.responsavel_id ?? "",
    notes: "notes" in password && typeof password.notes === "string" ? password.notes : "",
  };
}

function buildPasswordCreatePayload(
  clientId: string,
  values: PasswordFormValues,
): PessoalPasswordPayload {
  return {
    client_id: clientId,
    service_name: values.service_name.trim(),
    login_main: optional(values.login_main),
    senha_main: optional(values.senha_main),
    login_secondary: optional(values.login_secondary),
    senha_secondary: optional(values.senha_secondary),
    responsavel_id: optional(values.responsavel_id),
    notes: optional(values.notes),
  };
}

function buildPasswordUpdatePayload(
  values: PasswordFormValues,
  clearedSecretFields: Set<SecretFieldName>,
): PessoalPasswordUpdatePayload {
  const payload: PessoalPasswordUpdatePayload = {
    service_name: values.service_name.trim(),
    responsavel_id: optional(values.responsavel_id),
    notes: optional(values.notes),
  };

  for (const field of secretFields) {
    if (clearedSecretFields.has(field.name)) {
      payload[field.name] = null;
      continue;
    }

    const value = optional(values[field.name]);

    if (value !== null) {
      payload[field.name] = value;
    }
  }

  return payload;
}

function getResponsibleName(password: PessoalPasswordListItem | PessoalPasswordDetail): string {
  const responsible = password.responsavel;

  if (responsible !== null && typeof responsible === "object") {
    const value = responsible as { full_name?: unknown; name?: unknown };

    if (typeof value.full_name === "string" && value.full_name.trim()) {
      return value.full_name;
    }

    if (typeof value.name === "string" && value.name.trim()) {
      return value.name;
    }
  }

  return password.responsavel_id ?? "-";
}

function getSecretText(
  detail: PessoalPasswordDetail,
  field: SecretFieldName,
  isRevealed: boolean,
): string {
  if (!(field in detail)) {
    return "Sem permissão";
  }

  const value = detail[field];

  if (!value) {
    return "Não informado";
  }

  return isRevealed ? value : "********";
}

export function PessoalPasswordsSection({
  selectedClientId,
  canEdit,
}: PessoalPasswordsSectionProps) {
  const hasClient = selectedClientId.length > 0;
  const passwordsQuery = usePessoalPasswords(selectedClientId, hasClient);
  const createMutation = useCreatePessoalPasswordMutation();
  const deleteMutation = useDeletePessoalPasswordMutation(selectedClientId);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPasswordId, setSelectedPasswordId] = useState("");
  const detailQuery = usePessoalPasswordDetail(
    selectedPasswordId,
    hasClient && selectedPasswordId.length > 0,
  );
  const [editingPasswordId, setEditingPasswordId] = useState("");
  const updateMutation = useUpdatePessoalPasswordMutation(editingPasswordId, selectedClientId);
  const [formValues, setFormValues] = useState<PasswordFormValues>(
    emptyPasswordFormValues,
  );
  const [isCustomService, setIsCustomService] = useState(false);
  const [clearedSecretFields, setClearedSecretFields] = useState<Set<SecretFieldName>>(
    new Set(),
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const usersQuery = useAssignableUsers({
    enabled: isFormOpen && canEdit,
    module: "pessoal",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [revealedFields, setRevealedFields] = useState<Set<SecretFieldName>>(new Set());
  const passwords = passwordsQuery.data ?? [];
  const hasPasswords = passwords.length > 0;
  const users = usersQuery.data ?? [];
  const selectedPassword =
    passwords.find((password) => password.id === selectedPasswordId) ?? null;
  const detail = detailQuery.data;
  const hasSecretFields = detail ? hasPessoalPasswordSecretFields(detail) : false;
  const isSubmitting =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const filteredPasswords = useMemo(() => {
    const normalizedTerm = normalizeSearch(searchTerm.trim());

    if (!normalizedTerm) {
      return passwords;
    }

    return passwords.filter((password) => {
      const searchable = normalizeSearch(
        `${password.service_name} ${getResponsibleName(password)}`,
      );

      return searchable.includes(normalizedTerm);
    });
  }, [passwords, searchTerm]);

  useEffect(() => {
    setSearchTerm("");
    setSelectedPasswordId("");
    setEditingPasswordId("");
    setFormValues(emptyPasswordFormValues);
    setIsCustomService(false);
    setClearedSecretFields(new Set());
    setIsFormOpen(false);
    setIsDeleteDialogOpen(false);
    setFormError(null);
    setSuccessMessage(null);
    setRevealedFields(new Set());
  }, [selectedClientId]);

  useEffect(() => {
    setRevealedFields(new Set());
    setEditingPasswordId("");
    setIsFormOpen(false);
    setIsDeleteDialogOpen(false);
    setFormError(null);
  }, [selectedPasswordId]);

  if (!hasClient) {
    return (
      <PessoalPlaceholderSection
        icon={KeyRound}
        title="Senhas"
        description="Selecione um cliente para continuar."
        requiresClient
        hasClient={false}
      />
    );
  }

  function clearFeedback() {
    setFormError(null);
    setSuccessMessage(null);
  }

  function startCreate() {
    clearFeedback();
    setEditingPasswordId("");
    setFormValues(emptyPasswordFormValues);
    setIsCustomService(false);
    setClearedSecretFields(new Set());
    setIsFormOpen(true);
  }

  function startEdit() {
    if (!detail && !selectedPassword) {
      return;
    }

    clearFeedback();
    setEditingPasswordId(selectedPasswordId);
    setFormValues(buildPasswordFormValues(detail ?? selectedPassword));
    setIsCustomService(!isPessoalPasswordKnownService((detail ?? selectedPassword).service_name));
    setClearedSecretFields(new Set());
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingPasswordId("");
    setFormValues(emptyPasswordFormValues);
    setIsCustomService(false);
    setClearedSecretFields(new Set());
    setFormError(null);
  }

  function handleFieldChange(field: keyof PasswordFormValues, value: string) {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function getServiceSelectValue() {
    if (isCustomService) {
      return PESSOAL_PASSWORD_CUSTOM_SERVICE_OPTION;
    }

    if (!formValues.service_name) {
      return "";
    }

    return isPessoalPasswordKnownService(formValues.service_name)
      ? formValues.service_name
      : PESSOAL_PASSWORD_CUSTOM_SERVICE_OPTION;
  }

  function handleServiceSelectChange(value: string) {
    if (value === PESSOAL_PASSWORD_CUSTOM_SERVICE_OPTION) {
      setIsCustomService(true);
      setFormValues((current) => ({
        ...current,
        service_name: isPessoalPasswordKnownService(current.service_name)
          ? ""
          : current.service_name,
      }));
      return;
    }

    setIsCustomService(false);
    handleFieldChange("service_name", value);
  }

  function shouldRenderCurrentUserOption(userId: string) {
    return Boolean(userId) && !users.some((user) => user.id === userId);
  }

  function getUserPlaceholder() {
    if (usersQuery.isLoading) {
      return "Carregando usuários...";
    }

    if (usersQuery.isError) {
      return "Usuários indisponíveis";
    }

    return "Sem responsável";
  }

  function toggleSecretField(field: SecretFieldName) {
    setRevealedFields((current) => {
      const next = new Set(current);

      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }

      return next;
    });
  }

  function toggleClearedSecretField(field: SecretFieldName) {
    setClearedSecretFields((current) => {
      const next = new Set(current);

      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
        setFormValues((values) => ({
          ...values,
          [field]: "",
        }));
      }

      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit) {
      return;
    }

    if (!formValues.service_name.trim()) {
      setFormError("Informe o nome do serviço.");
      return;
    }

    setFormError(null);
    setSuccessMessage(null);

    try {
      const savedPassword = editingPasswordId
        ? await updateMutation.mutateAsync(
            buildPasswordUpdatePayload(formValues, clearedSecretFields),
          )
        : await createMutation.mutateAsync(
            buildPasswordCreatePayload(selectedClientId, formValues),
          );

      setSelectedPasswordId(savedPassword.id);
      closeForm();
      setSuccessMessage(editingPasswordId ? "Senha atualizada." : "Senha criada.");
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Não foi possível salvar a senha."));
    }
  }

  function openDeleteDialog() {
    if (!canEdit || !selectedPasswordId) {
      return;
    }

    setIsDeleteDialogOpen(true);
  }

  async function handleConfirmDelete() {
    if (!canEdit || !selectedPasswordId) {
      return;
    }

    setDeleteError(null);
    setSuccessMessage(null);

    try {
      await deleteMutation.mutateAsync(selectedPasswordId);
      setSelectedPasswordId("");
      setIsDeleteDialogOpen(false);
      setSuccessMessage("Senha removida.");
    } catch (error) {
      setDeleteError(getPessoalErrorMessage(error, "Não foi possível remover a senha."));
      // Relança para o ConfirmationDialog permanecer aberto com o erro.
      throw error;
    }
  }

  async function handleCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setSuccessMessage("Campo copiado.");
      setFormError(null);
    } catch {
      setFormError("Não foi possível copiar.");
      setSuccessMessage(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Senhas</h2>
            </div>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Acessos vinculados ao cliente selecionado.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <button
                type="button"
                onClick={startCreate}
                className={pessoalPrimaryButtonClassName}
              >
                <Plus className="h-4 w-4" />
                Criar senha
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => passwordsQuery.refetch()}
              disabled={passwordsQuery.isFetching}
              className={pessoalSecondaryButtonClassName}
            >
              {passwordsQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Atualizar
            </button>
          </div>
        </div>

        <div
          className={cn(
            "mt-5 grid gap-5",
            hasPasswords && "xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)]",
          )}
        >
          <div className="space-y-3">
            {hasPasswords ? (
              <div className="relative">
                <label htmlFor="pessoal-password-search" className="sr-only">
                  Buscar senha
                </label>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  id="pessoal-password-search"
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar por serviço ou responsável"
                  className={`${pessoalTextFieldClassName} pl-9`}
                />
              </div>
            ) : null}

            {passwordsQuery.isLoading ? (
              <StateMessage icon={Loader2} title="Carregando senhas" tone="loading">
                Buscando os acessos do cliente selecionado.
              </StateMessage>
            ) : null}

            {passwordsQuery.isError ? (
              <StateMessage icon={AlertCircle} title="Não foi possível carregar" tone="danger">
                {getPessoalErrorMessage(passwordsQuery.error, "Falha ao carregar senhas.")}
              </StateMessage>
            ) : null}

            {!passwordsQuery.isLoading && !passwordsQuery.isError && passwords.length === 0 ? (
              <StateMessage icon={KeyRound} title="Nenhuma senha cadastrada">
                {canEdit
                  ? "Use o botão Criar senha para cadastrar o primeiro acesso."
                  : "Não há senhas cadastradas para este cliente."}
              </StateMessage>
            ) : null}

            {!passwordsQuery.isLoading &&
            !passwordsQuery.isError &&
            passwords.length > 0 &&
            filteredPasswords.length === 0 ? (
              <StateMessage icon={Search} title="Nenhum acesso encontrado">
                Ajuste a busca para localizar outro serviço ou responsável.
              </StateMessage>
            ) : null}

            {filteredPasswords.map((password) => {
              const isSelected = password.id === selectedPasswordId;

              return (
                <button
                  key={password.id}
                  type="button"
                  onClick={() => setSelectedPasswordId(password.id)}
                  className={cn(
                    "w-full rounded-xl border p-4 text-left transition-colors",
                    isSelected
                      ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30"
                      : "border-gray-200 bg-gray-50 hover:border-blue-200 hover:bg-blue-50/50 dark:border-gray-700 dark:bg-gray-900/30 dark:hover:border-blue-800",
                  )}
                >
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {password.service_name}
                  </p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Responsável: {getResponsibleName(password)}
                  </p>
                </button>
              );
            })}
          </div>

          {hasPasswords ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
              {!selectedPasswordId ? (
                <StateMessage icon={KeyRound} title="Selecione um acesso">
                  Escolha um item da lista para carregar os campos sensíveis.
                </StateMessage>
              ) : null}

              {selectedPasswordId && detailQuery.isLoading ? (
                <StateMessage icon={Loader2} title="Carregando acesso" tone="loading">
                  Buscando os campos liberados para seu usuário.
                </StateMessage>
              ) : null}

              {selectedPasswordId && detailQuery.isError ? (
                <StateMessage icon={AlertCircle} title="Não foi possível carregar" tone="danger">
                  {getPessoalErrorMessage(detailQuery.error, "Falha ao carregar acesso.")}
                </StateMessage>
              ) : null}

              {detail ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                        Acesso selecionado
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                        {detail.service_name}
                      </h3>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        Responsável: {getResponsibleName(detail)}
                      </p>
                    </div>

                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={startEdit}
                          className={pessoalSecondaryButtonClassName}
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={openDeleteDialog}
                          disabled={deleteMutation.isPending}
                          className={pessoalSecondaryButtonClassName}
                        >
                          {deleteMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Remover
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-3">
                    {secretFields.map((field) => {
                      const value = detail[field.name];
                      const canUseValue =
                        hasSecretFields && typeof value === "string" && value.length > 0;
                      const isRevealed = revealedFields.has(field.name);

                      return (
                        <div
                          key={field.name}
                          className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                                {field.label}
                              </p>
                              <p className="mt-1 break-all font-mono text-sm text-gray-900 dark:text-white">
                                {getSecretText(detail, field.name, isRevealed)}
                              </p>
                            </div>
                            {canUseValue ? (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleSecretField(field.name)}
                                  className={pessoalSecondaryButtonClassName}
                                >
                                  {isRevealed ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                  {isRevealed ? "Ocultar" : "Revelar"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(value)}
                                  className={pessoalSecondaryButtonClassName}
                                >
                                  <Copy className="h-4 w-4" />
                                  Copiar
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {detail.notes ? (
                    <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                        Observações
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{detail.notes}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {formError && !isFormOpen ? (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-300">
            {formError}
          </p>
        ) : null}

        {successMessage ? (
          <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-300">
            {successMessage}
          </p>
        ) : null}
      </div>

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open);
          if (!open) {
            setDeleteError(null);
          }
        }}
        title="Remover senha"
        description={`Remover o acesso ${detail?.service_name ?? selectedPassword?.service_name ?? ""}? Os campos sensíveis vinculados a esta senha deixarão de ficar disponíveis para o cliente.`}
        onConfirm={handleConfirmDelete}
        isConfirming={deleteMutation.isPending}
        errorMessage={deleteError}
        confirmLabel="Confirmar remoção"
        cancelLabel="Cancelar"
      />

      {isFormOpen && canEdit ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm"
          onClick={closeForm}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pessoal-password-form-title"
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-800"
            onClick={(event) => event.stopPropagation()}
          >
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3
                    id="pessoal-password-form-title"
                    className="text-base font-semibold text-gray-900 dark:text-white"
                  >
                    {editingPasswordId ? "Editar senha" : "Nova senha"}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Campos em branco não alteram senhas existentes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={isSubmitting}
                  className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-700"
                  aria-label="Fechar senha"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {formError ? (
                <p role="alert" className="text-sm text-red-600 dark:text-red-300">
                  {formError}
                </p>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                  Serviço
                  <div className="relative">
                    <select
                      required
                      value={getServiceSelectValue()}
                      onChange={(event) => handleServiceSelectChange(event.target.value)}
                      disabled={isSubmitting}
                      className={`${pessoalTextFieldClassName} appearance-none pr-12`}
                    >
                      <option value="">Selecione</option>
                      {pessoalPasswordServiceOptions.map((serviceName) => (
                        <option key={serviceName} value={serviceName}>
                          {serviceName}
                        </option>
                      ))}
                      <option value={PESSOAL_PASSWORD_CUSTOM_SERVICE_OPTION}>Outro serviço</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  </div>
                </label>

                <label className="flex flex-col gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                  Responsável
                  <div className="relative">
                    <select
                      value={formValues.responsavel_id}
                      onChange={(event) => handleFieldChange("responsavel_id", event.target.value)}
                      disabled={isSubmitting || usersQuery.isLoading || usersQuery.isError}
                      className={`${pessoalTextFieldClassName} appearance-none pr-12`}
                    >
                      <option value="">{getUserPlaceholder()}</option>
                      {shouldRenderCurrentUserOption(formValues.responsavel_id) ? (
                        <option value={formValues.responsavel_id}>Responsável atual</option>
                      ) : null}
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  </div>
                </label>

                {getServiceSelectValue() === PESSOAL_PASSWORD_CUSTOM_SERVICE_OPTION ? (
                  <label className="flex flex-col gap-1.5 text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
                    Outro serviço
                    <input
                      type="text"
                      required
                      value={formValues.service_name}
                      onChange={(event) => handleFieldChange("service_name", event.target.value)}
                      disabled={isSubmitting}
                      className={pessoalTextFieldClassName}
                    />
                  </label>
                ) : null}

                {secretFields.map((field) => {
                  const isCleared = clearedSecretFields.has(field.name);

                  return (
                    <div key={field.name} className="space-y-1.5">
                      <label className="flex flex-col gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                        {field.label}
                        <input
                          type="password"
                          value={formValues[field.name]}
                          onChange={(event) => handleFieldChange(field.name, event.target.value)}
                          disabled={isSubmitting || isCleared}
                          autoComplete="off"
                          className={pessoalTextFieldClassName}
                        />
                      </label>
                      {editingPasswordId ? (
                        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <input
                            type="checkbox"
                            checked={isCleared}
                            onChange={() => toggleClearedSecretField(field.name)}
                            disabled={isSubmitting}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          Limpar
                        </label>
                      ) : null}
                    </div>
                  );
                })}

                <label className="flex flex-col gap-1.5 text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
                  Observações
                  <textarea
                    value={formValues.notes}
                    onChange={(event) => handleFieldChange("notes", event.target.value)}
                    disabled={isSubmitting}
                    className={`${pessoalTextFieldClassName} min-h-20 resize-y`}
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`${pessoalPrimaryButtonClassName} w-full`}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StateMessage({
  children,
  icon: Icon,
  title,
  tone = "neutral",
}: {
  children: string;
  icon: LucideIcon;
  title: string;
  tone?: "danger" | "loading" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 text-sm",
        tone === "danger" &&
          "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-100",
        tone === "loading" &&
          cn(
            "border-blue-200 bg-blue-50 text-blue-800",
            "dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100",
          ),
        tone === "neutral" &&
          cn(
            "border-dashed border-gray-200 bg-gray-50 text-gray-600",
            "dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
          ),
      )}
    >
      <div className="flex gap-3">
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            tone === "loading" && "animate-spin",
          )}
        />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1">{children}</p>
        </div>
      </div>
    </div>
  );
}
