import { useEffect, useState } from "react";
import { AlertTriangle, Check, Pencil, Plus, Save, Trash2, UserRound, X } from "lucide-react";
import { toast } from "react-toastify";

import { departmentService, type DepItem } from "@modules/departments";
import { useFetch } from "@shared/hooks";

import { useRhPermissions } from "../hooks/useRhPermissions";
import {
  useCreateRhContactMutation,
  useDeleteRhContactMutation,
  useRhAllergies,
  useRhContacts,
  useRhDossier,
  useRhDossierList,
  useReplaceRhAllergiesMutation,
  useUpdateRhContactMutation,
  useUpdateRhDossierMutation,
} from "../hooks/useRhProfile";
import type {
  RhAllergy,
  RhDossier,
  RhDossierListItem,
  RhEmergencyContact,
  UpdateRhDossierPayload,
} from "../types";

const SELF_FIELDS = ["address", "email", "phone"] as const;
const RH_DOSSIER_MANAGER_PERMISSION = 2;
const ADMIN_FIELDS = [
  "full_name",
  "gender",
  "birth_date",
  "cpf",
  "rg",
  "address",
  "job_title",
  "email",
  "phone",
  "hire_date",
  "dominio_hire_date",
  "termination_date",
  "photo_url",
  "status",
  "department_id",
] as const;
type DossierField = (typeof ADMIN_FIELDS)[number];
type ContactDraft = { name: string; phone: string; reference: string };

type DossierListProps = {
  items: RhDossierListItem[];
  isLoading: boolean;
  error: Error | null;
  selectedUserId?: string;
  onSelect?: (id: string) => void;
};

type DossierListRowProps = {
  item: RhDossierListItem;
  selected: boolean;
  onSelect?: (id: string) => void;
};

type DossierDetailProps = {
  dossier?: RhDossier;
  isLoading: boolean;
  error: Error | null;
  canEdit: boolean;
  isAdmin: boolean;
  contacts: RhEmergencyContact[];
  allergies: RhAllergy[];
  contactsLoading: boolean;
  allergiesLoading: boolean;
  updateDossierMutation: ReturnType<typeof useUpdateRhDossierMutation>;
  createContactMutation: ReturnType<typeof useCreateRhContactMutation>;
  updateContactMutation: ReturnType<typeof useUpdateRhContactMutation>;
  deleteContactMutation: ReturnType<typeof useDeleteRhContactMutation>;
  replaceAllergiesMutation: ReturnType<typeof useReplaceRhAllergiesMutation>;
  targetUserId?: string;
};

type ReadOnlySupplementProps = {
  contacts: RhEmergencyContact[];
  allergies: RhAllergy[];
};

type ContactPanelProps = {
  contacts: RhEmergencyContact[];
  loading: boolean;
  draft: ContactDraft;
  editingId: string | null;
  saving: boolean;
  onChange: (draft: ContactDraft) => void;
  onSave: () => void;
  onEdit: (contact: RhEmergencyContact) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
};

type AllergyPanelProps = {
  allergies: RhAllergy[];
  loading: boolean;
  saving: boolean;
  onChange: (allergies: RhAllergy[]) => void;
  onSave: () => void;
};

const FIELD_LABELS: Record<DossierField, string> = {
  full_name: "Nome completo",
  gender: "Gênero",
  birth_date: "Nascimento",
  cpf: "CPF",
  rg: "RG",
  address: "Endereço",
  job_title: "Cargo",
  email: "E-mail",
  phone: "Telefone",
  hire_date: "Admissão real",
  dominio_hire_date: "Admissão Domínio",
  termination_date: "Desligamento",
  photo_url: "Foto (URL)",
  status: "Status",
  department_id: "Departamento",
};

function inputValue(value: string | null | undefined, field: DossierField): string {
  if (!value) return "";
  return field.endsWith("_date") ? value.slice(0, 10) : value;
}

function displayValue(value: string | null | undefined): string {
  return value || "Não informado";
}

export function RhDossierSection() {
  const { user, canAccessRhPortal, canManageRh, permissionQuery } = useRhPermissions("dossier");
  const permission = user?.modules?.rh ?? 0;
  const canList = canManageRh || permission === RH_DOSSIER_MANAGER_PERMISSION;
  const canEdit = canManageRh || permission === 1;
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();
  const listQuery = useRhDossierList(canList);
  const targetUserId = canManageRh ? selectedUserId : undefined;
  const dossierQuery = useRhDossier(targetUserId, canAccessRhPortal && (!canManageRh || Boolean(selectedUserId)));
  const contactsQuery = useRhContacts(targetUserId, canEdit && (!canManageRh || Boolean(selectedUserId)));
  const allergiesQuery = useRhAllergies(targetUserId, canEdit && (!canManageRh || Boolean(selectedUserId)));
  const updateDossierMutation = useUpdateRhDossierMutation();
  const createContactMutation = useCreateRhContactMutation();
  const updateContactMutation = useUpdateRhContactMutation();
  const deleteContactMutation = useDeleteRhContactMutation();
  const replaceAllergiesMutation = useReplaceRhAllergiesMutation();

  useEffect(() => {
    if (canManageRh && !selectedUserId && listQuery.data?.[0]) {
      setSelectedUserId(listQuery.data[0].id);
    }
  }, [canManageRh, listQuery.data, selectedUserId]);

  if (permissionQuery.isLoading) return <StatusPanel text="Validando acesso ao dossiê..." />;
  if (!canAccessRhPortal) return <StatusPanel text="Seu perfil não possui acesso ao dossiê de RH." />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">
            Cadastro protegido
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">Dossiê do colaborador</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
            Consulte dados cadastrais, alergias e contatos de emergência conforme seu nível de acesso.
          </p>
        </div>
        {canManageRh ? <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">RH administrativo</span> : null}
      </div>

      {canList ? (
        <DossierList
          items={listQuery.data ?? []}
          isLoading={listQuery.isLoading}
          error={listQuery.error}
          selectedUserId={selectedUserId}
          onSelect={canManageRh ? setSelectedUserId : undefined}
        />
      ) : null}

      {(!canManageRh || selectedUserId) && permission !== RH_DOSSIER_MANAGER_PERMISSION ? (
        <DossierDetail
          dossier={dossierQuery.data}
          isLoading={dossierQuery.isLoading}
          error={dossierQuery.error}
          canEdit={canEdit}
          isAdmin={canManageRh}
          contacts={contactsQuery.data ?? dossierQuery.data?.emergency_contacts ?? []}
          allergies={allergiesQuery.data ?? dossierQuery.data?.allergies ?? []}
          contactsLoading={contactsQuery.isLoading}
          allergiesLoading={allergiesQuery.isLoading}
          updateDossierMutation={updateDossierMutation}
          createContactMutation={createContactMutation}
          updateContactMutation={updateContactMutation}
          deleteContactMutation={deleteContactMutation}
          replaceAllergiesMutation={replaceAllergiesMutation}
          targetUserId={targetUserId}
        />
      ) : null}
    </div>
  );
}

function StatusPanel({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
      {text}
    </div>
  );
}

function DossierList({ items, isLoading, error, selectedUserId, onSelect }: DossierListProps) {
  if (isLoading) return <StatusPanel text="Carregando colaboradores..." />;
  if (error) return <StatusPanel text="Não foi possível carregar a lista de colaboradores." />;
  if (items.length === 0) return <StatusPanel text="Nenhum colaborador encontrado no escopo autorizado." />;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">Colaboradores</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">A lista exibe somente a projeção não sensível.</p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {items.map((item) => (
          <DossierListRow
            key={item.id}
            item={item}
            selected={selectedUserId === item.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function DossierListRow({ item, selected, onSelect }: DossierListRowProps) {
  const content = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
        <UserRound className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
          {item.full_name}
        </span>
        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
          {item.job_title || "Cargo não informado"} · {item.department?.name || "Sem departamento"}
        </span>
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{item.status}</span>
    </>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${selected ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
      >
        {content}
      </button>
    );
  }

  return <div className="flex items-center gap-3 px-5 py-3">{content}</div>;
}

function DossierDetail({
  dossier,
  isLoading,
  error,
  canEdit,
  isAdmin,
  contacts,
  allergies,
  contactsLoading,
  allergiesLoading,
  updateDossierMutation,
  createContactMutation,
  updateContactMutation,
  deleteContactMutation,
  replaceAllergiesMutation,
  targetUserId,
}: DossierDetailProps) {
  const [draft, setDraft] = useState<Partial<UpdateRhDossierPayload>>({});
  const [allergiesDraft, setAllergiesDraft] = useState<RhAllergy[]>([]);
  const [contactDraft, setContactDraft] = useState({ name: "", phone: "", reference: "" });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const departmentsQuery = useFetch<DepItem[]>(
    ["rh", "dossier-departments"],
    () => departmentService.list({ status: "Ativo" }),
    { enabled: isAdmin },
  );

  useEffect(() => {
    if (dossier) {
      const values = Object.fromEntries(ADMIN_FIELDS.map((field) => [field, dossier[field]]));
      setDraft(values as Partial<UpdateRhDossierPayload>);
    }
  }, [dossier]);
  useEffect(() => {
    setAllergiesDraft(allergies);
  }, [allergies]);

  if (isLoading) {
    return <StatusPanel text="Carregando dossiê..." />;
  }
  if (error) {
    return <StatusPanel text="Não foi possível carregar o dossiê autorizado." />;
  }
  if (!dossier) {
    return <StatusPanel text="Selecione um colaborador para consultar o dossiê." />;
  }

  const editableFields = isAdmin ? ADMIN_FIELDS : SELF_FIELDS;
  async function saveDossier() {
    try {
      await updateDossierMutation.mutateAsync({
        ...draft,
        ...(targetUserId ? { target_user_id: targetUserId } : {}),
      });
      toast.success("Dossiê atualizado.");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível atualizar o dossiê.",
      );
    }
  }
  async function saveAllergies() {
    try {
      await replaceAllergiesMutation.mutateAsync({ allergies: allergiesDraft, targetUserId });
      toast.success("Alergias atualizadas.");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível atualizar as alergias.",
      );
    }
  }
  async function saveContact() {
    if (!contactDraft.name.trim() || !contactDraft.phone.trim()) {
      toast.error("Informe nome e telefone do contato.");
      return;
    }
    try {
      const reference = contactDraft.reference.trim();
      if (editingContactId) {
        await updateContactMutation.mutateAsync({
          id: editingContactId,
          name: contactDraft.name,
          phone: contactDraft.phone,
          reference: reference || null,
          ...(targetUserId ? { target_user_id: targetUserId } : {}),
        });
      } else {
        await createContactMutation.mutateAsync({
          name: contactDraft.name,
          phone: contactDraft.phone,
          ...(reference ? { reference } : {}),
          ...(targetUserId ? { target_user_id: targetUserId } : {}),
        });
      }
      setContactDraft({ name: "", phone: "", reference: "" });
      setEditingContactId(null);
      toast.success(editingContactId ? "Contato atualizado." : "Contato adicionado.");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar o contato.",
      );
    }
  }
  async function removeContact(id: string) {
    if (!window.confirm("Excluir este contato de emergência?")) return;
    try {
      await deleteContactMutation.mutateAsync({ id, ...(targetUserId ? { target_user_id: targetUserId } : {}) });
      toast.success("Contato excluído.");
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir o contato.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
        <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Dados cadastrais</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{dossier.full_name}</p>
            </div>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {dossier.status}
            </span>
          </div>

          {canEdit ? (
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {editableFields.map((field) => (
                <label key={field} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {FIELD_LABELS[field]}
                  {field === "department_id" ? (
                    <select
                      value={inputValue(draft[field], field)}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          department_id: event.target.value,
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                      disabled={updateDossierMutation.isPending || departmentsQuery.isLoading}
                    >
                      <option value="">
                        {departmentsQuery.isLoading ? "Carregando..." : "Selecione"}
                      </option>
                      {departmentsQuery.data?.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={
                        field.endsWith("_date")
                          ? "date"
                          : field === "email"
                            ? "email"
                            : "text"
                      }
                      value={inputValue(draft[field], field)}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [field]: event.target.value || null,
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                      disabled={updateDossierMutation.isPending}
                    />
                  )}
                </label>
              ))}
            </div>
          ) : (
            <ReadOnlyDossier dossier={dossier} />
          )}

          {canEdit ? (
            <div className="flex justify-end border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={saveDossier}
                disabled={updateDossierMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {updateDossierMutation.isPending ? "Salvando..." : "Salvar dossiê"}
              </button>
            </div>
          ) : null}
        </section>
        <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">Vínculo</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Departamento e status atuais
            </p>
          </div>
          <div className="space-y-3 p-5 text-sm">
            <InfoRow label="Departamento" value={dossier.department?.name} />
            <InfoRow label="Admissão real" value={dossier.hire_date} />
            <InfoRow label="Admissão Domínio" value={dossier.dominio_hire_date} />
            <InfoRow label="Desligamento" value={dossier.termination_date} />
          </div>
        </section>
      </div>

      {canEdit ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <ContactPanel
            contacts={contacts}
            loading={contactsLoading}
            draft={contactDraft}
            editingId={editingContactId}
            saving={createContactMutation.isPending || updateContactMutation.isPending}
            onChange={setContactDraft}
            onSave={saveContact}
            onEdit={(contact) => {
              setEditingContactId(contact.id);
              setContactDraft({
                name: contact.name,
                phone: contact.phone,
                reference: contact.reference ?? "",
              });
            }}
            onCancel={() => {
              setEditingContactId(null);
              setContactDraft({ name: "", phone: "", reference: "" });
            }}
            onDelete={removeContact}
          />
          <AllergyPanel
            allergies={allergiesDraft}
            loading={allergiesLoading}
            saving={replaceAllergiesMutation.isPending}
            onChange={setAllergiesDraft}
            onSave={saveAllergies}
          />
        </div>
      ) : (
        <ReadOnlySupplement contacts={contacts} allergies={allergies} />
      )}
    </div>
  );
}

function ReadOnlyDossier({ dossier }: { dossier: RhDossier }) {
  return (
    <div className="grid gap-4 p-5 sm:grid-cols-2">
      {ADMIN_FIELDS.map((field) => (
        <InfoRow key={field} label={FIELD_LABELS[field]} value={dossier[field]} />
      ))}
    </div>
  );
}

function ReadOnlySupplement({ contacts, allergies }: ReadOnlySupplementProps) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <InfoBlock
        title="Contatos de emergência"
        text={
          contacts.length
            ? contacts.map((contact) => `${contact.name} · ${contact.phone}`).join("\n")
            : "Nenhum contato cadastrado."
        }
      />
      <InfoBlock
        title="Alergias"
        text={
          allergies.length
            ? allergies.map((allergy) => allergy.name).join(", ")
            : "Nenhuma alergia cadastrada."
        }
      />
    </div>
  );
}

function InfoBlock({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="mt-3 whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">{text}</p>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-white">
        {displayValue(typeof value === "string" ? value : null)}
      </dd>
    </div>
  );
}

function ContactPanel({
  contacts,
  loading,
  draft,
  editingId,
  saving,
  onChange,
  onSave,
  onEdit,
  onCancel,
  onDelete,
}: ContactPanelProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">Contatos de emergência</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Cadastro independente do dossiê.
        </p>
      </div>

      <div className="space-y-4 p-5">
        {loading ? (
          <p className="text-sm text-gray-500">Carregando contatos...</p>
        ) : contacts.length ? (
          <div className="space-y-2">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {contact.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {contact.phone}
                    {contact.reference ? ` · ${contact.reference}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onEdit(contact)}
                  aria-label={`Editar ${contact.name}`}
                  className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600 dark:hover:bg-gray-700"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(contact.id)}
                  aria-label={`Excluir ${contact.name}`}
                  className="rounded-md p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhum contato cadastrado.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <input
            aria-label="Nome do contato"
            placeholder="Nome"
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          />
          <input
            aria-label="Telefone do contato"
            placeholder="Telefone"
            value={draft.phone}
            onChange={(event) => onChange({ ...draft, phone: event.target.value })}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          />
          <input
            aria-label="Referência do contato"
            placeholder="Referência (opcional)"
            value={draft.reference}
            onChange={(event) => onChange({ ...draft, reference: event.target.value })}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          />
        </div>

        <div className="flex justify-end gap-2">
          {editingId ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300"
            >
              <X className="h-4 w-4" />
              Cancelar
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {editingId ? "Atualizar contato" : "Adicionar contato"}
          </button>
        </div>
      </div>
    </section>
  );
}

function AllergyPanel({
  allergies,
  loading,
  saving,
  onChange,
  onSave,
}: AllergyPanelProps) {
  function update(index: number, field: keyof RhAllergy, value: string) {
    onChange(
      allergies.map((allergy, currentIndex) =>
        currentIndex === index ? { ...allergy, [field]: value } : allergy,
      ),
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">Alergias</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Cada item exige nome, fontes e tratativa.
        </p>
      </div>

      <div className="space-y-3 p-5">
        {loading ? (
          <p className="text-sm text-gray-500">Carregando alergias...</p>
        ) : (
          allergies.map((allergy, index) => (
            <div
              key={`${allergy.name}-${index}`}
              className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
            >
              <div className="grid gap-2 sm:grid-cols-3">
                {(["name", "fonts", "action"] as const).map((field) => (
                  <input
                    key={field}
                    aria-label={
                      field === "name"
                        ? "Nome da alergia"
                        : field === "fonts"
                          ? "Fontes da alergia"
                          : "Tratativa da alergia"
                    }
                    value={allergy[field]}
                    onChange={(event) => update(index, field, event.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  onChange(
                    allergies.filter((_, currentIndex) => currentIndex !== index),
                  )
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover alergia
              </button>
            </div>
          ))
        )}

        {!loading && allergies.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhuma alergia cadastrada.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => onChange([...allergies, { name: "", fonts: "", action: "" }])}
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          <Plus className="h-4 w-4" />
          Adicionar alergia
        </button>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar alergias"}
          </button>
        </div>
      </div>
    </section>
  );
}
