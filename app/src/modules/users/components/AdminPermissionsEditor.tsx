import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { RotateCcw, Save, Search } from "lucide-react";
import { toast } from "react-toastify";

import { resolveDepartmentModuleKey } from "@modules/auth";

import {
  PERMISSION_MODULE_GROUPS,
  PERMISSION_SELECT_OPTIONS,
  getPermissionModuleLabel,
  getPermissionSelectOptions,
  normalizePermissionForModule,
} from "../constants/permissionConfig";
import {
  ADMIN_USER_STATUS_LABELS,
  getAdminUserStatusLabel,
} from "../services/adminUsersService";
import type { PermissionDraft, UserItem } from "../types";
import type { AdminUserPermissionsDataSource } from "../types/adminUserContracts";
import {
  arePermissionDraftsEqual,
  buildPermissionUpdatePayload,
  freezePermissionSnapshot,
  isOwnerUser,
  normalizePermissionDraft,
  normalizePermissionResponse,
} from "../utils/permissionUtils";
import {
  buildDepartmentPermissionSyncPayload,
  needsDepartmentPermissionSync,
} from "../utils/createUserPayload";
import { ConfirmationDialog } from "@shared/components";

type PermissionSelectValue = (typeof PERMISSION_SELECT_OPTIONS)[number]["value"];

type PermissionQueryResult = {
  userId: string;
  raw: Record<string, unknown>;
};

interface AdminPermissionsEditorProps {
  dataSource: AdminUserPermissionsDataSource;
  departments: ReadonlyArray<{ id: string; name: string }>;
  currentUserId?: string;
  onAccessDenied?: () => void;
  onPermissionsUpdated: () => Promise<unknown> | unknown;
  onCurrentUserPermissionsUpdated?: () => void;
  queryKey?: ReadonlyArray<unknown>;
}

const PANEL_CLASSNAME = "rounded-3xl bg-white shadow-sm dark:bg-slate-900";
const SUBPANEL_CLASSNAME = "rounded-2xl bg-slate-50/70 dark:bg-slate-950/40";
const EMPTY_STATE_CLASSNAME =
  "rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center dark:border-slate-700 dark:bg-slate-950/30";
const TEXT_CLASSNAME = "dialog-neutral-text text-sm text-slate-700 dark:text-white";
const MUTED_CLASSNAME = "dialog-neutral-muted text-sm text-slate-500 dark:text-slate-300";
const SELECT_CLASSNAME =
  "w-full appearance-none rounded-lg border border-slate-200 bg-white bg-[length:14px] bg-[position:right_0.95rem_center] bg-no-repeat px-3 py-2.5 pr-11 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white";
const SELECT_ARROW_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='m5 7.5 5 5 5-5' stroke='%2394a3b8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
} as const;
const GRADIENT_BUTTON_CLASSNAME =
  "bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-70";

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getPermissionSelectValue(value: number | null | undefined): PermissionSelectValue {
  if (value === 0 || value === 1 || value === 2 || value === 3) {
    return String(value) as Exclude<PermissionSelectValue, "null">;
  }

  return "0";
}

function getPermissionErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const responseMessage = error.response?.data?.error;
    if (typeof responseMessage === "string" && responseMessage.trim()) {
      return responseMessage;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Não foi possível salvar as permissões agora.";
}

export function AdminPermissionsEditor({
  dataSource,
  departments,
  currentUserId,
  onAccessDenied,
  onPermissionsUpdated,
  onCurrentUserPermissionsUpdated,
  queryKey = ["admin", "permissions"],
}: AdminPermissionsEditorProps) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<PermissionDraft>(() =>
    normalizePermissionDraft({}),
  );
  const [permissionSnapshot, setPermissionSnapshot] = useState<Readonly<PermissionDraft> | null>(null);
  const [permissionBaseline, setPermissionBaseline] = useState<Readonly<Record<string, unknown>> | null>(null);
  const [permissionExtraKeys, setPermissionExtraKeys] = useState<string[]>([]);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const usersQuery = useQuery({
    queryKey: [...queryKey, "users"],
    queryFn: () => dataSource.listUsers(),
    retry: false,
  });
  const users = usersQuery.data ?? [];
  const departmentNameById = useMemo(
    () => new Map(departments.map((department) => [department.id, department.name])),
    [departments],
  );
  const filteredUsers = useMemo(() => {
    const normalizedSearch = normalizeSearchText(searchTerm);
    if (!normalizedSearch) return users;

    return users.filter((candidate) => {
      const departmentName =
        departmentNameById.get(candidate.department_id) ?? candidate.department?.name ?? "";
      return [candidate.name, candidate.login, departmentName, getAdminUserStatusLabel(candidate.status)].some(
        (value) => normalizeSearchText(value).includes(normalizedSearch),
      );
    });
  }, [departmentNameById, searchTerm, users]);
  const selectedUser = useMemo(
    () => users.find((candidate) => candidate.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );
  const selectedDepartmentModule = useMemo(() => {
    if (!selectedUser) return null;
    return resolveDepartmentModuleKey(
      departmentNameById.get(selectedUser.department_id) ?? selectedUser.department?.name ?? null,
    );
  }, [departmentNameById, selectedUser]);
  const normalizedPermissionDraft = useMemo(
    () => normalizePermissionDraft(permissionDraft, permissionExtraKeys),
    [permissionDraft, permissionExtraKeys],
  );
  const isOwner = isOwnerUser(selectedUser);
  const isDirty = useMemo(() => {
    if (!permissionSnapshot) return false;
    return !arePermissionDraftsEqual(normalizedPermissionDraft, permissionSnapshot) || needsDepartmentPermissionSync(
      selectedDepartmentModule,
      normalizedPermissionDraft,
      selectedUser,
      permissionBaseline ?? undefined,
    );
  }, [normalizedPermissionDraft, permissionBaseline, permissionSnapshot, selectedDepartmentModule, selectedUser]);
  const permissionQuery = useQuery<PermissionQueryResult>({
    queryKey: [...queryKey, "user", selectedUserId],
    enabled: Boolean(selectedUserId),
    retry: false,
    queryFn: async ({ signal }) => ({
      userId: selectedUserId as string,
      raw: await dataSource.loadPermissions(selectedUserId as string, signal),
    }),
  });

  useEffect(() => {
    if (!users.length) {
      setSelectedUserId(null);
      return;
    }
    setSelectedUserId((currentUserId) =>
      currentUserId && users.some((candidate) => candidate.id === currentUserId)
        ? currentUserId
        : users[0]?.id ?? null,
    );
  }, [users]);

  useEffect(() => {
    if (!selectedUserId) {
      setPermissionDraft(normalizePermissionDraft({}));
      setPermissionSnapshot(null);
      setPermissionBaseline(null);
      setPermissionExtraKeys([]);
      setLoadedUserId(null);
      setSaveError(null);
    } else if (selectedUserId !== loadedUserId) {
      setPermissionDraft(normalizePermissionDraft({}));
      setPermissionSnapshot(null);
      setPermissionBaseline(null);
      setPermissionExtraKeys([]);
      setSaveError(null);
    }
  }, [loadedUserId, selectedUserId]);

  useEffect(() => {
    if (!permissionQuery.data || permissionQuery.data.userId !== selectedUserId) return;
    const normalization = normalizePermissionResponse(permissionQuery.data.raw);
    const extraKeys = Object.keys(normalization.extras);
    const nextDraft = normalizePermissionDraft({ ...normalization.known, ...normalization.extras }, extraKeys);
    setPermissionDraft(nextDraft);
    setPermissionSnapshot(freezePermissionSnapshot(nextDraft));
    setPermissionBaseline(permissionQuery.data.raw);
    setPermissionExtraKeys(extraKeys);
    setLoadedUserId(permissionQuery.data.userId);
    setSaveError(null);
  }, [permissionQuery.data, selectedUserId]);

  useEffect(() => {
    const error = permissionQuery.error ?? usersQuery.error;
    if (isAxiosError(error) && error.response?.status === 403) onAccessDenied?.();
  }, [onAccessDenied, permissionQuery.error, usersQuery.error]);

  const getDepartmentName = (candidate: UserItem) =>
    departmentNameById.get(candidate.department_id) ?? candidate.department?.name ?? "Sem departamento";
  const handleSelectUser = (nextUserId: string) => {
    if (nextUserId === selectedUserId || isSaving) return;
    if (isDirty) {
      setPendingUserId(nextUserId);
      return;
    }
    setSelectedUserId(nextUserId);
  };
  const handlePermissionChange = (moduleKey: string, nextValue: PermissionSelectValue) => {
    setPermissionDraft((currentDraft) => normalizePermissionDraft({
      ...currentDraft,
      [moduleKey]: normalizePermissionForModule(moduleKey, Number(nextValue)),
    }, permissionExtraKeys));
    setSaveError(null);
  };
  const handleSave = async () => {
    if (!selectedUserId || !permissionSnapshot || isOwner || isSaving) return;
    const payload = buildPermissionUpdatePayload(permissionDraft, permissionExtraKeys);
    const shouldSyncDepartmentPermission = needsDepartmentPermissionSync(
      selectedDepartmentModule,
      payload,
      selectedUser,
    );
    if (arePermissionDraftsEqual(payload, permissionSnapshot) && !shouldSyncDepartmentPermission) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      let raw: Record<string, unknown>;
      if (shouldSyncDepartmentPermission) {
        if (!selectedDepartmentModule) throw new Error("Módulo do departamento não encontrado.");
        await dataSource.syncDepartmentPermission(
          selectedUserId,
          buildDepartmentPermissionSyncPayload(selectedDepartmentModule, payload),
        );
        raw = await dataSource.loadPermissions(selectedUserId);
      } else {
        raw = await dataSource.savePermissions(selectedUserId, payload);
      }
      const normalization = normalizePermissionResponse(raw);
      const extraKeys = Object.keys(normalization.extras);
      const nextDraft = normalizePermissionDraft({ ...normalization.known, ...normalization.extras }, extraKeys);
      setPermissionDraft(nextDraft);
      setPermissionSnapshot(freezePermissionSnapshot(nextDraft));
      setPermissionBaseline(raw);
      setPermissionExtraKeys(extraKeys);
      setLoadedUserId(selectedUserId);
      queryClient.setQueryData([...queryKey, "user", selectedUserId], { userId: selectedUserId, raw });
      await onPermissionsUpdated();
      if (selectedUserId === currentUserId) {
        onCurrentUserPermissionsUpdated?.();
      } else {
        toast.success("Permissões atualizadas com sucesso.");
      }
    } catch (error) {
      setSaveError(getPermissionErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };
  const isPermissionQuery404 = isAxiosError(permissionQuery.error) && permissionQuery.error.response?.status === 404;
  const isLoadingPermissions = permissionQuery.isLoading || (permissionQuery.isFetching && loadedUserId !== selectedUserId);

  return (
    <div className="grid gap-4 xl:h-[575px] xl:grid-cols-[350px_minmax(0,1fr)] xl:items-stretch">
      <aside className={`${PANEL_CLASSNAME} overflow-hidden p-4 max-xl:h-[680px] xl:h-full`}>
        <div className="flex h-full min-h-0 flex-col space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Usuários ativos</h2>
            <p className={MUTED_CLASSNAME}>Escolha um usuário para carregar e editar as permissões.</p>
          </div>
          {usersQuery.isError ? (
            <div className={`${SUBPANEL_CLASSNAME} p-4`}>
              <p className={TEXT_CLASSNAME}>Não foi possível carregar os usuários ativos.</p>
              <button type="button" onClick={() => void usersQuery.refetch()} className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Tentar novamente</button>
            </div>
          ) : null}
          <div className={`${SUBPANEL_CLASSNAME} space-y-3 p-3`}>
            <label className="dialog-neutral-label block text-sm font-medium text-slate-700 dark:text-white">Busca</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="text" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar usuário ativo" disabled={usersQuery.isLoading || usersQuery.isError} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500" />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col space-y-3">
            <div className="flex items-center justify-between"><p className={TEXT_CLASSNAME}>{filteredUsers.length} de {users.length} usuário{users.length === 1 ? "" : "s"}</p><span className="rounded-full bg-[var(--colors-brand-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300">Ativo</span></div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {usersQuery.isLoading ? <div className={EMPTY_STATE_CLASSNAME}><p className={MUTED_CLASSNAME}>Carregando usuários ativos...</p></div> : null}
              {!usersQuery.isLoading && !usersQuery.isError && users.length === 0 ? <div className={EMPTY_STATE_CLASSNAME}><p className={TEXT_CLASSNAME}>Nenhum usuário ativo encontrado.</p></div> : null}
              {!usersQuery.isLoading && !usersQuery.isError && users.length > 0 && filteredUsers.length === 0 ? <div className={EMPTY_STATE_CLASSNAME}><p className={TEXT_CLASSNAME}>Nenhum usuário ativo corresponde à busca.</p></div> : null}
              {filteredUsers.map((candidate) => <button key={candidate.id} type="button" onClick={() => handleSelectUser(candidate.id)} className={`w-full rounded-2xl p-4 text-left transition-all ${candidate.id === selectedUserId ? "bg-slate-50 shadow-sm ring-1 ring-[var(--colors-brand-gradient-end)] dark:bg-slate-950/60" : "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/70"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{candidate.name}</p><p className="dialog-neutral-muted truncate text-sm text-slate-600 dark:text-slate-300">{getDepartmentName(candidate)}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{getAdminUserStatusLabel(candidate.status)}</span></div></button>)}
            </div>
          </div>
        </div>
      </aside>
      <section className={`${PANEL_CLASSNAME} overflow-hidden p-6 xl:h-full`}>
        {!selectedUser ? <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center dark:border-slate-700 dark:bg-slate-950/30"><p className={TEXT_CLASSNAME}>Selecione um usuário para editar as permissões.</p></div> : isLoadingPermissions ? <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center dark:border-slate-700 dark:bg-slate-950/30"><p className={TEXT_CLASSNAME}>Carregando permissões...</p></div> : permissionQuery.isError ? <div className="flex h-full items-center rounded-2xl border border-amber-200 bg-amber-50/90 p-8 text-slate-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-white"><div><p className="text-sm font-semibold">{isPermissionQuery404 ? "Permissões não configuradas para este usuário. Solicite criação/configuração via suporte." : "Não foi possível carregar as permissões deste usuário."}</p><button type="button" onClick={() => void permissionQuery.refetch()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" disabled={permissionQuery.isFetching}><RotateCcw className="h-4 w-4" />Tentar novamente</button></div></div> : <div className="flex h-full min-h-0 flex-col">
          <div className="space-y-1 pb-6"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold text-slate-900 dark:text-white">{selectedUser.name}</h2>{isOwner ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-900 dark:bg-amber-950/50 dark:text-white">Owner</span> : null}{isDirty ? <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">Alterações pendentes</span> : null}</div><p className={MUTED_CLASSNAME}>{getDepartmentName(selectedUser)} - {getAdminUserStatusLabel(selectedUser.status)}</p></div>
          <div className="flex flex-wrap items-center justify-between gap-3 pb-6"><div className="space-y-1"><p className="text-sm font-medium text-slate-700 dark:text-white">Níveis da permissão por módulo</p><p className={MUTED_CLASSNAME}>Ajuste apenas acessos complementares ao módulo principal do usuário selecionado.</p></div><button type="button" onClick={() => void handleSave()} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all ${isDirty && !isOwner && !isSaving ? GRADIENT_BUTTON_CLASSNAME : "bg-slate-300 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`} disabled={!isDirty || isOwner || isSaving}><Save className="h-4 w-4" />{isSaving ? "Salvando..." : "Salvar permissões"}</button></div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">{saveError ? <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100"><p className="text-sm font-semibold">Não foi possível salvar as permissões.</p><p className="mt-1 text-sm opacity-90">{saveError}</p><button type="button" onClick={() => void handleSave()} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-900 transition-colors hover:bg-rose-100 dark:border-rose-900/60 dark:text-rose-100 dark:hover:bg-rose-900/30" disabled={isOwner || isSaving}><RotateCcw className="h-4 w-4" />Tentar novamente</button></div> : null}{isOwner ? <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-slate-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-white"><p className="text-sm font-semibold">Owners recebem acesso máximo e não são editáveis nesta tela.</p></div> : null}<div className="grid gap-4 xl:grid-cols-2">{PERMISSION_MODULE_GROUPS.map((group) => <section key={group.title} className={`${SUBPANEL_CLASSNAME} p-4`}><h3 className="text-sm font-semibold text-slate-900 dark:text-white">{group.title}</h3><div className="mt-4 space-y-3">{group.keys.map((moduleKey) => { const isDepartmentModule = selectedDepartmentModule === moduleKey; const moduleLabel = getPermissionModuleLabel(moduleKey); return <div key={moduleKey} className="grid gap-2 2xl:grid-cols-[minmax(0,1fr)_200px] 2xl:items-center"><label className="flex max-w-full items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200" title={isDepartmentModule ? `${moduleLabel} - módulo vinculado ao departamento do usuário` : moduleLabel}><span className="min-w-0 truncate">{moduleLabel}</span>{isDepartmentModule ? <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Departamento</span> : null}</label><select value={getPermissionSelectValue(normalizedPermissionDraft[moduleKey])} onChange={(event) => handlePermissionChange(moduleKey, event.target.value as PermissionSelectValue)} className={SELECT_CLASSNAME} style={SELECT_ARROW_STYLE} disabled={isOwner || isSaving}>{getPermissionSelectOptions(moduleKey).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>; })}</div></section>)}</div></div>
        </div>}
      </section>
      <ConfirmationDialog open={pendingUserId !== null} onOpenChange={(open) => { if (!open) setPendingUserId(null); }} title="Descartar alterações pendentes?" description="Existem alterações pendentes para este usuário. Ao trocar de contexto, elas serão descartadas." onConfirm={() => { if (pendingUserId) setSelectedUserId(pendingUserId); }} isConfirming={false} errorMessage={null} confirmLabel="Descartar e trocar" cancelLabel="Continuar editando" variant="destructive" />
    </div>
  );
}
