import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import { toast } from "react-toastify";
import {
  Bell,
  CalendarClock,
  Copy,
  Eye,
  EyeOff,
  Filter,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { useModuleAccess } from "@modules/auth";
import { Dialog } from "@shared/components/ui/Dialog";
import { formatCnpjInput, formatCpfInput, normalizeDigits } from "@shared/utils/inputFormatting";
import {
  DEFAULT_CERTIFICATE_PAGE,
  DEFAULT_CERTIFICATE_PAGE_SIZE,
} from "@modules/certificates/services/certificateService.contract";
import {
  useCertificateNotificationsList,
  useCertificatePjDetail,
  useCertificatePjList,
  useCertificatePfDetail,
  useCertificatePfList,
  useCreateCertificatePjMutation,
  useCreateCertificatePfMutation,
  useDeleteCertificatePjMutation,
  useDeleteCertificatePfMutation,
  useUpdateCertificatePjMutation,
  useUpdateCertificatePfMutation,
} from "@modules/certificates/hooks";
import type {
  CertificateNotification,
  CertificatePj,
  CertificatePf,
  CreateCertificatePjBody,
  CreateCertificatePfBody,
  UpdateCertificatePjBody,
  UpdateCertificatePfBody,
} from "@modules/certificates/types";

import { CertificateNativeSelect } from "./CertificateNativeSelect";
import { CertificateFileActions } from "./CertificateFileActions";
import { CertificateForm } from "./CertificateForm";
import {
  CERTIFICATE_COMPACT_BUTTON_CLASSNAME,
  CERTIFICATE_DATE_STATUS_OK_CLASSNAME,
  CERTIFICATE_BADGE_CLASSNAME,
  CERTIFICATE_FORM_MODAL_BODY_CLASSNAME,
  CERTIFICATE_FORM_MODAL_CONTENT_CLASSNAME,
  CERTIFICATE_FILTER_LABEL_CLASSNAME,
  CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME,
  CERTIFICATE_FILTER_MENU_CLASSNAME,
  CERTIFICATE_FILTER_MENU_GRID_CLASSNAME,
  CERTIFICATE_INPUT_CLASSNAME,
  CERTIFICATE_PANEL_CLASSNAME,
  CERTIFICATE_PRIMARY_BUTTON_CLASSNAME,
  CERTIFICATE_SECONDARY_BUTTON_CLASSNAME,
  CERTIFICATE_SUBPANEL_CLASSNAME,
  CERTIFICATE_TAB_ACTIVE_BUTTON_CLASSNAME,
  CERTIFICATE_TAB_BUTTON_CLASSNAME,
  CERTIFICATE_TABLE_ACTION_BUTTON_CLASSNAME,
  CERTIFICATE_TABLE_ACTION_CELL_CLASSNAME,
  CERTIFICATE_TABLE_ACTION_GROUP_CLASSNAME,
  CERTIFICATE_TABLE_ACTION_HEAD_CELL_CLASSNAME,
  CERTIFICATE_TABLE_DANGER_ACTION_BUTTON_CLASSNAME,
  CERTIFICATE_TABLE_CELL_CLASSNAME,
  CERTIFICATE_TABLE_CLASSNAME,
  CERTIFICATE_TABLE_EMPTY_CELL_CLASSNAME,
  CERTIFICATE_TABLE_HEAD_CELL_CLASSNAME,
  CERTIFICATE_TABLE_NAME_CELL_CLASSNAME,
  CERTIFICATE_TABLE_NAME_HEAD_CELL_CLASSNAME,
  CERTIFICATE_TABLE_SCROLL_AREA_CLASSNAME,
  CERTIFICATE_SUMMARY_BAR_CLASSNAME,
  CERTIFICATE_SUMMARY_ITEM_CLASSNAME,
  formatDateBR,
  getExpirationTone,
  resolveCertificateWorkspaceCapabilities,
} from "./certificateWorkspaceUi";

type CertificateTab = "pj" | "pf" | "notifications";
type WorkspaceMode = "view" | "createPj" | "createPf" | "editPj" | "editPf";

type PjFilters = {
  name: string;
  cnpj: string;
  responsible: string;
  model: string;
  clientCasteloStatus?: boolean;
  clientFocusStatus?: boolean;
  wasPaid?: boolean;
  hasCertificate?: boolean;
};

type PfFilters = {
  search: string;
  cpf: string;
  enterprise: string;
  cnpj: string;
  model: string;
  clientCasteloStatus?: boolean;
  clientFocusStatus?: boolean;
  wasPaid?: boolean;
  hasCertificate?: boolean;
};

type DetailTarget = {
  type: "pj";
  id: string;
} | {
  type: "pf";
  id: string;
} | null;

type CertificateErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  requestId?: string;
};

const BOOL_OPTIONS = [
  { value: "" as const, label: "Todos" },
  { value: "true" as const, label: "Sim" },
  { value: "false" as const, label: "Não" },
];

const ZERO = 0;
const FIRST_PAGE = DEFAULT_CERTIFICATE_PAGE;
const PAGE_SIZE = DEFAULT_CERTIFICATE_PAGE_SIZE;
const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

function parseBooleanFilterValue(value: string): boolean | undefined {
  if (value === "") {
    return undefined;
  }

  return value === "true";
}

function trimValue(value: string): string {
  return value.trim();
}

function mergeListById<T extends { id: string }>(current: T[], next: T[]): T[] {
  const byId = new Map<string, T>();

  for (const item of current) {
    byId.set(item.id, item);
  }

  for (const item of next) {
    byId.set(item.id, item);
  }

  return Array.from(byId.values());
}

function buildStats(total: number, expiringInDays: number, expired: number, withCertificate: number) {
  return [
    { label: "Total", value: total },
    {
      label: "Vencidos",
      value: expired,
    },
    {
      label: "Vencem em 30 dias",
      value: expiringInDays,
    },
    {
      label: "Com arquivo",
      value: withCertificate,
    },
  ];
}

function calcDaysUntil(date: string | null | undefined): number | null {
  if (!date) {
    return null;
  }

  const normalized = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(normalized.getTime())) {
    return null;
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((normalized.getTime() - startOfToday.getTime()) / MILLISECONDS_IN_DAY);
}

function paymentAmountText(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "R$ 0,00";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getCertificateErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError<CertificateErrorBody>(error)) {
    return fallback;
  }

  if (error.response?.status === 401) {
    return "Sua sessão não está mais válida. Entre novamente para continuar.";
  }

  if (error.response?.status === 403) {
    return "Seu perfil não possui permissão para visualizar estes dados.";
  }

  return fallback;
}

function AccessDeniedCard() {
  return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-amber-600 dark:bg-slate-900/80">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
            Acesso negado ao módulo de certificados
          </h2>
          <p className="text-sm leading-6 text-amber-800 dark:text-amber-200">
            Seu perfil atual não possui permissão de visualização para certificados.
          </p>
        </div>
      </div>
    </section>
  );
}

export function CertificatesWorkspace() {
  const { access, isLoading: isModuleAccessLoading } = useModuleAccess("certificado");
  const [activeTab, setActiveTab] = useState<CertificateTab>("pj");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("view");
  const [selected, setSelected] = useState<DetailTarget>(null);
  const [showDetailPassword, setShowDetailPassword] = useState(false);
  const [pjPage, setPjPage] = useState(FIRST_PAGE);
  const [pfPage, setPfPage] = useState(FIRST_PAGE);
  const [notificationPage, setNotificationPage] = useState(FIRST_PAGE);
  const [visiblePjItems, setVisiblePjItems] = useState<CertificatePj[]>([]);
  const [visiblePfItems, setVisiblePfItems] = useState<CertificatePf[]>([]);
  const [visibleNotificationItems, setVisibleNotificationItems] = useState<CertificateNotification[]>([]);

  const [pjFilters, setPjFilters] = useState<PjFilters>({
    name: "",
    cnpj: "",
    responsible: "",
    model: "",
    clientCasteloStatus: undefined,
    clientFocusStatus: undefined,
    wasPaid: undefined,
    hasCertificate: undefined,
  });

  const [pfFilters, setPfFilters] = useState<PfFilters>({
    search: "",
    cpf: "",
    enterprise: "",
    cnpj: "",
    model: "",
    clientCasteloStatus: undefined,
    clientFocusStatus: undefined,
    wasPaid: undefined,
    hasCertificate: undefined,
  });

  const pjQueryParams = useMemo(
    () => ({
      page: pjPage,
      page_size: PAGE_SIZE,
      name: trimValue(pjFilters.name) || undefined,
      cnpj: normalizeDigits(pjFilters.cnpj) || undefined,
      responsible: trimValue(pjFilters.responsible) || undefined,
      model: trimValue(pjFilters.model) || undefined,
      client_castelo_status: pjFilters.clientCasteloStatus,
      client_focus_status: pjFilters.clientFocusStatus,
      was_paid: pjFilters.wasPaid,
      has_certificate: pjFilters.hasCertificate,
    }),
    [pjFilters, pjPage],
  );

  const pfQueryParams = useMemo(
    () => ({
      page: pfPage,
      page_size: PAGE_SIZE,
      search: trimValue(pfFilters.search) || undefined,
      cpf: normalizeDigits(pfFilters.cpf) || undefined,
      enterprise: trimValue(pfFilters.enterprise) || undefined,
      cnpj: normalizeDigits(pfFilters.cnpj) || undefined,
      model: trimValue(pfFilters.model) || undefined,
      client_castelo_status: pfFilters.clientCasteloStatus,
      client_focus_status: pfFilters.clientFocusStatus,
      was_paid: pfFilters.wasPaid,
      has_certificate: pfFilters.hasCertificate,
    }),
    [pfFilters, pfPage],
  );

  const notificationsParams = useMemo(
    () => ({
      page: notificationPage,
      page_size: PAGE_SIZE,
    }),
    [notificationPage],
  );

  const deferredPjQueryParams = useDeferredValue(pjQueryParams);
  const deferredPfQueryParams = useDeferredValue(pfQueryParams);
  const deferredNotificationsParams = useDeferredValue(notificationsParams);
  const certificateCapabilities = resolveCertificateWorkspaceCapabilities(access);
  const shouldFetchCertificates =
    certificateCapabilities.canReadRecords && !isModuleAccessLoading;
  const canManageCertificateModule = certificateCapabilities.canManageRecords;

  const pjListQuery = useCertificatePjList(deferredPjQueryParams, {
    enabled: shouldFetchCertificates && activeTab === "pj",
  });
  const pfListQuery = useCertificatePfList(deferredPfQueryParams, {
    enabled: shouldFetchCertificates && activeTab === "pf",
  });
  const notificationsQuery = useCertificateNotificationsList(deferredNotificationsParams, {
    enabled: shouldFetchCertificates && activeTab === "notifications",
  });

  const pjDetailQuery = useCertificatePjDetail(
    selected?.type === "pj" ? selected.id : undefined,
    { enabled: shouldFetchCertificates },
  );
  const pfDetailQuery = useCertificatePfDetail(
    selected?.type === "pf" ? selected.id : undefined,
    { enabled: shouldFetchCertificates },
  );
  const createPjMutation = useCreateCertificatePjMutation();
  const createPfMutation = useCreateCertificatePfMutation();
  const deletePjMutation = useDeleteCertificatePjMutation();
  const deletePfMutation = useDeleteCertificatePfMutation();
  const updatePjMutation = useUpdateCertificatePjMutation(selected?.type === "pj" ? selected.id : "");
  const updatePfMutation = useUpdateCertificatePfMutation(selected?.type === "pf" ? selected.id : "");

  useEffect(() => {
    if (
      !pjListQuery.data ||
      pjListQuery.isPlaceholderData ||
      pjListQuery.data.page !== pjPage
    ) {
      return;
    }

    const nextItems = pjListQuery.data.data;

    setVisiblePjItems((current) =>
      pjPage === FIRST_PAGE ? nextItems : mergeListById(current, nextItems),
    );
  }, [pjListQuery.data, pjListQuery.isPlaceholderData, pjPage]);

  useEffect(() => {
    if (
      !pfListQuery.data ||
      pfListQuery.isPlaceholderData ||
      pfListQuery.data.page !== pfPage
    ) {
      return;
    }

    const nextItems = pfListQuery.data.data;

    setVisiblePfItems((current) =>
      pfPage === FIRST_PAGE ? nextItems : mergeListById(current, nextItems),
    );
  }, [pfListQuery.data, pfListQuery.isPlaceholderData, pfPage]);

  useEffect(() => {
    if (
      !notificationsQuery.data ||
      notificationsQuery.isPlaceholderData ||
      notificationsQuery.data.page !== notificationPage
    ) {
      return;
    }

    const nextItems = notificationsQuery.data.data;

    setVisibleNotificationItems((current) =>
      notificationPage === FIRST_PAGE ? nextItems : mergeListById(current, nextItems),
    );
  }, [notificationPage, notificationsQuery.data, notificationsQuery.isPlaceholderData]);

  useEffect(() => {
    setPjPage(FIRST_PAGE);
    setVisiblePjItems([]);
    setSelected((current) => (current?.type === "pj" ? null : current));
  }, [
    pjFilters.name,
    pjFilters.cnpj,
    pjFilters.responsible,
    pjFilters.model,
    pjFilters.clientCasteloStatus,
    pjFilters.clientFocusStatus,
    pjFilters.wasPaid,
    pjFilters.hasCertificate,
  ]);

  useEffect(() => {
    setPfPage(FIRST_PAGE);
    setVisiblePfItems([]);
    setSelected((current) => (current?.type === "pf" ? null : current));
  }, [
    pfFilters.search,
    pfFilters.cpf,
    pfFilters.enterprise,
    pfFilters.cnpj,
    pfFilters.model,
    pfFilters.clientCasteloStatus,
    pfFilters.clientFocusStatus,
    pfFilters.wasPaid,
    pfFilters.hasCertificate,
  ]);

  const pjStats = useMemo(() => {
    const total = visiblePjItems.length;
    const expired = visiblePjItems.filter((item) => {
      const days = calcDaysUntil(item.expiration_date);
      return days !== null && days < ZERO;
    }).length;
    const dueSoon = visiblePjItems.filter((item) => {
      const days = calcDaysUntil(item.expiration_date);
      return days !== null && days >= ZERO && days <= 30;
    }).length;
    const withCertificate = visiblePjItems.filter((item) => item.has_certificate).length;

    return buildStats(total, dueSoon, expired, withCertificate);
  }, [visiblePjItems]);

  const pfStats = useMemo(() => {
    const total = visiblePfItems.length;
    const expired = visiblePfItems.filter((item) => {
      const days = calcDaysUntil(item.expiration_date);
      return days !== null && days < ZERO;
    }).length;
    const dueSoon = visiblePfItems.filter((item) => {
      const days = calcDaysUntil(item.expiration_date);
      return days !== null && days >= ZERO && days <= 30;
    }).length;
    const withCertificate = visiblePfItems.filter((item) => item.has_certificate).length;

    return buildStats(total, dueSoon, expired, withCertificate);
  }, [visiblePfItems]);

  const notificationsStats = useMemo(() => {
    const total = visibleNotificationItems.length;
    const pjCount = visibleNotificationItems.filter((item) => item.type === "PJ").length;
    const pfCount = total - pjCount;

    return [
      {
        label: "Total",
        value: total,
      },
      {
        label: "PJ",
        value: pjCount,
      },
      {
        label: "PF",
        value: pfCount,
      },
    ];
  }, [visibleNotificationItems]);

  const activeStats = activeTab === "pf" ? pfStats : activeTab === "pj" ? pjStats : notificationsStats;
  const activeListHasMore = activeTab === "pf"
    ? !pfListQuery.isPlaceholderData && pfListQuery.data?.page === pfPage && pfListQuery.data.hasMore
    : activeTab === "pj"
      ? !pjListQuery.isPlaceholderData && pjListQuery.data?.page === pjPage && pjListQuery.data.hasMore
      :
          !notificationsQuery.isPlaceholderData &&
          notificationsQuery.data?.page === notificationPage &&
          notificationsQuery.data.hasMore;
  const activeListIsLoading = activeTab === "pf"
    ? pfListQuery.isFetching
    : activeTab === "pj"
      ? pjListQuery.isFetching
      : notificationsQuery.isFetching;
  const activeListError = activeTab === "pf" ? pfListQuery.isError : activeTab === "pj" ? pjListQuery.isError : notificationsQuery.isError;
  const activeListErrorMessage = activeTab === "pf"
    ? getCertificateErrorMessage(pfListQuery.error, "Não foi possível carregar os certificados PF agora. Tente atualizar em alguns instantes.")
    : activeTab === "pj"
      ? getCertificateErrorMessage(pjListQuery.error, "Não foi possível carregar os certificados PJ agora. Tente atualizar em alguns instantes.")
      : getCertificateErrorMessage(notificationsQuery.error, "Não foi possível carregar as notificações agora. Tente atualizar em alguns instantes.");
  const activeListIsFetching = activeTab === "pf"
    ? pfListQuery.isFetching
    : activeTab === "pj"
      ? pjListQuery.isFetching
      : notificationsQuery.isFetching;

  const hasPjRows = visiblePjItems.length > ZERO;
  const hasPfRows = visiblePfItems.length > ZERO;
  const hasNotificationRows = visibleNotificationItems.length > ZERO;
  const hasActiveRows = activeTab === "pf"
    ? hasPfRows
    : activeTab === "pj"
      ? hasPjRows
      : hasNotificationRows;
  const activeAdvancedFilterCount = activeTab === "pf"
    ? [
      pfFilters.clientCasteloStatus,
      pfFilters.clientFocusStatus,
      pfFilters.wasPaid,
      pfFilters.hasCertificate,
    ].filter((value) => value !== undefined).length
    : [
      pjFilters.clientCasteloStatus,
      pjFilters.clientFocusStatus,
      pjFilters.wasPaid,
      pjFilters.hasCertificate,
    ].filter((value) => value !== undefined).length;
  const advancedFilterLabel =
    activeAdvancedFilterCount > ZERO ? `Filtros (${activeAdvancedFilterCount})` : "Filtros";

  const isCreating = workspaceMode === "createPj" || workspaceMode === "createPf";
  const isEditing = workspaceMode === "editPj" || workspaceMode === "editPf";
  const isFormMode = isCreating || isEditing;
  const formSubmitting = isCreating
    ? (workspaceMode === "createPj" ? createPjMutation.isPending : createPfMutation.isPending)
    : isEditing
      ? (workspaceMode === "editPj" ? updatePjMutation.isPending : updatePfMutation.isPending)
      : false;

  const shouldShowDetailPanel = Boolean(selected);
  const pjDetail = pjDetailQuery.data;
  const pfDetail = pfDetailQuery.data;
  const activeDetailIsLoading = selected?.type === "pj"
    ? pjDetailQuery.isLoading
    : selected?.type === "pf"
      ? pfDetailQuery.isLoading
      : false;
  const activeDetailErrorMessage = selected?.type === "pj" && pjDetailQuery.isError
    ? getCertificateErrorMessage(pjDetailQuery.error, "Não foi possível carregar o detalhe do certificado agora. Tente novamente em alguns instantes.")
    : selected?.type === "pf" && pfDetailQuery.isError
      ? getCertificateErrorMessage(pfDetailQuery.error, "Não foi possível carregar o detalhe do certificado agora. Tente novamente em alguns instantes.")
      : "";
  const formDialogTitle = workspaceMode === "createPj"
    ? "Novo certificado PJ"
    : workspaceMode === "createPf"
      ? "Novo certificado PF"
      : workspaceMode === "editPj"
        ? "Editar certificado PJ"
        : "Editar certificado PF";
  const formDialogDescription = isCreating
    ? "Formulário de criação de certificado"
    : "Formulário de edição de certificado";
  const formSubmitLabel = isCreating ? "Criar certificado" : "Salvar alterações";
  const shouldDisableFormSubmit =
    formSubmitting ||
    activeDetailIsLoading ||
    Boolean(activeDetailErrorMessage) ||
    !canManageCertificateModule;
  const activeFormId = `certificate-${workspaceMode}-form`;

  function handleTabChange(next: CertificateTab) {
    setActiveTab(next);
    setSelected(null);
    setWorkspaceMode("view");
    setShowDetailPassword(false);
  }

  function handleSelectPj(pj: CertificatePj) {
    setSelected({ type: "pj", id: pj.id });
    setWorkspaceMode("view");
    setShowDetailPassword(false);
  }

  function handleSelectPf(pf: CertificatePf) {
    setSelected({ type: "pf", id: pf.id });
    setWorkspaceMode("view");
    setShowDetailPassword(false);
  }

  function handleOpenNotification(notification: CertificateNotification) {
    if (notification.type === "PJ") {
      setActiveTab("pj");
      setSelected({ type: "pj", id: notification.certificate_id });
      setWorkspaceMode("view");
      setShowDetailPassword(false);
      return;
    }

    setActiveTab("pf");
    setSelected({ type: "pf", id: notification.certificate_id });
    setWorkspaceMode("view");
    setShowDetailPassword(false);
  }

  function handleRefresh() {
    if (activeTab === "pj") {
      if (pjPage === FIRST_PAGE) {
        void pjListQuery.refetch();
      } else {
        setPjPage(FIRST_PAGE);
      }
      setWorkspaceMode("view");
      setShowDetailPassword(false);
      return;
    }

    if (activeTab === "pf") {
      if (pfPage === FIRST_PAGE) {
        void pfListQuery.refetch();
      } else {
        setPfPage(FIRST_PAGE);
      }
      setWorkspaceMode("view");
      setShowDetailPassword(false);
      return;
    }

    if (activeTab === "notifications") {
      if (notificationPage === FIRST_PAGE) {
        void notificationsQuery.refetch();
      } else {
        setNotificationPage(FIRST_PAGE);
      }
      setWorkspaceMode("view");
      setShowDetailPassword(false);
    }
  }

  function handlePjFileActionSuccess(certificateId: string) {
    void pjListQuery.refetch();
    if (selected?.type === "pj" && selected.id === certificateId) {
      void pjDetailQuery.refetch();
    }
  }

  function handlePfFileActionSuccess(certificateId: string) {
    void pfListQuery.refetch();
    if (selected?.type === "pf" && selected.id === certificateId) {
      void pfDetailQuery.refetch();
    }
  }

  async function handleDeletePj(certificate: CertificatePj) {
    if (
      !canManageCertificateModule ||
      (typeof window !== "undefined" &&
        !window.confirm(`Excluir o certificado PJ "${certificate.name}"?`))
    ) {
      return;
    }

    try {
      await deletePjMutation.mutateAsync({ id: certificate.id });
      setVisiblePjItems((current) => current.filter((item) => item.id !== certificate.id));
      setSelected((current) =>
        current?.type === "pj" && current.id === certificate.id ? null : current,
      );
      setWorkspaceMode("view");
      setShowDetailPassword(false);
      toast.success("Certificado PJ excluído com sucesso.");
    } catch (error) {
      toast.error(
        getCertificateErrorMessage(error, "Não foi possível excluir o certificado PJ."),
      );
    }
  }

  async function handleDeletePf(certificate: CertificatePf) {
    if (
      !canManageCertificateModule ||
      (typeof window !== "undefined" &&
        !window.confirm(`Excluir o certificado PF "${certificate.name}"?`))
    ) {
      return;
    }

    try {
      await deletePfMutation.mutateAsync({ id: certificate.id });
      setVisiblePfItems((current) => current.filter((item) => item.id !== certificate.id));
      setSelected((current) =>
        current?.type === "pf" && current.id === certificate.id ? null : current,
      );
      setWorkspaceMode("view");
      setShowDetailPassword(false);
      toast.success("Certificado PF excluído com sucesso.");
    } catch (error) {
      toast.error(
        getCertificateErrorMessage(error, "Não foi possível excluir o certificado PF."),
      );
    }
  }

  function handleLoadMore() {
    if (activeTab === "pj") {
      setPjPage((current) => current + 1);
      return;
    }

    if (activeTab === "pf") {
      setPfPage((current) => current + 1);
      return;
    }

    setNotificationPage((current) => current + 1);
  }

  function handleStartCreatePj() {
    if (!canManageCertificateModule) {
      return;
    }

    setSelected(null);
    setWorkspaceMode("createPj");
    setShowDetailPassword(false);
  }

  function handleStartCreatePf() {
    if (!canManageCertificateModule) {
      return;
    }

    setSelected(null);
    setWorkspaceMode("createPf");
    setShowDetailPassword(false);
  }

  function handleStartEditSelected() {
    if (!canManageCertificateModule) {
      return;
    }

    if (selected?.type === "pj") {
      setWorkspaceMode("editPj");
      setShowDetailPassword(false);
      return;
    }

    if (selected?.type === "pf") {
      setWorkspaceMode("editPf");
      setShowDetailPassword(false);
    }
  }

  function handleCancelForm() {
    setWorkspaceMode("view");
    setShowDetailPassword(false);
  }

  function handleFormOpenChange(open: boolean) {
    if (open || formSubmitting) {
      return;
    }

    handleCancelForm();
  }

  async function handleSubmitCreatePj(payload: CreateCertificatePjBody) {
    if (!canManageCertificateModule) {
      return;
    }

    const certificate = await createPjMutation.mutateAsync(payload);
    setActiveTab("pj");
    setSelected({ type: "pj", id: certificate.id });
    setWorkspaceMode("view");
    setShowDetailPassword(false);
  }

  async function handleSubmitCreatePf(payload: CreateCertificatePfBody) {
    if (!canManageCertificateModule) {
      return;
    }

    const certificate = await createPfMutation.mutateAsync(payload);
    setActiveTab("pf");
    setSelected({ type: "pf", id: certificate.id });
    setWorkspaceMode("view");
    setShowDetailPassword(false);
  }

  async function handleSubmitEditPj(payload: UpdateCertificatePjBody) {
    if (!canManageCertificateModule) {
      return;
    }

    await updatePjMutation.mutateAsync(payload);
    setWorkspaceMode("view");
    setShowDetailPassword(false);
  }

  async function handleSubmitEditPf(payload: UpdateCertificatePfBody) {
    if (!canManageCertificateModule) {
      return;
    }

    await updatePfMutation.mutateAsync(payload);
    setWorkspaceMode("view");
    setShowDetailPassword(false);
  }

  function handleCopyPassword(password: string) {
    if (!password) {
      return;
    }

    if (typeof navigator !== "undefined") {
      void navigator.clipboard.writeText(password);
    }
  }

  function renderPasswordBlock(value: string | null | undefined) {
    if (!value) {
      return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
          <p className="text-xs text-slate-500 dark:text-slate-400">Senha</p>
          <p className="mt-1 font-semibold text-slate-900 dark:text-white">
            Senha indisponível para seu nível de acesso
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">Senha</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowDetailPassword((prev) => !prev)}
              className={`${CERTIFICATE_COMPACT_BUTTON_CLASSNAME} px-2 py-1 text-xs`}
              title={showDetailPassword ? "Ocultar senha" : "Revelar senha"}
            >
              {showDetailPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => handleCopyPassword(value)}
              className={`${CERTIFICATE_COMPACT_BUTTON_CLASSNAME} px-2 py-1 text-xs`}
              title="Copiar senha"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="font-semibold text-slate-900 dark:text-white break-all">
          {showDetailPassword ? value : "********"}
        </p>
      </div>
    );
  }

  function renderExpirationBadge(expirationDate: string | null) {
    const tone = getExpirationTone(expirationDate);
    const toneClassName = expirationDate
      ? tone.className
      : CERTIFICATE_DATE_STATUS_OK_CLASSNAME;

    return (
      <span className={`${CERTIFICATE_BADGE_CLASSNAME} ${toneClassName}`}>{tone.text}</span>
    );
  }

  if (isModuleAccessLoading) {
    return (
      <section className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">Carregando permissão do módulo de certificados...</p>
      </section>
    );
  }

  if (!access.canView) {
    return <AccessDeniedCard />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-slate-900 dark:text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20 text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            Certificados
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Visualização centralizada de certificados PJ e PF no fluxo real.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 self-start lg:self-auto">
          {canManageCertificateModule && !isFormMode ? (
            activeTab === "pj" ? (
              <button
                type="button"
                onClick={handleStartCreatePj}
                className={CERTIFICATE_PRIMARY_BUTTON_CLASSNAME}
              >
                <Plus className="h-4 w-4" />
                Novo PJ
              </button>
            ) : activeTab === "pf" ? (
              <button
                type="button"
                onClick={handleStartCreatePf}
                className={CERTIFICATE_PRIMARY_BUTTON_CLASSNAME}
              >
                <Plus className="h-4 w-4" />
                Novo PF
              </button>
            ) : null
          ) : null}

          <button
            type="button"
            onClick={handleRefresh}
            className={`${CERTIFICATE_COMPACT_BUTTON_CLASSNAME} w-fit`}
            disabled={activeListIsFetching}
          >
            <RefreshCcw className={activeListIsFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleTabChange("pj")}
          className={
            activeTab === "pj"
              ? CERTIFICATE_TAB_ACTIVE_BUTTON_CLASSNAME
              : CERTIFICATE_TAB_BUTTON_CLASSNAME
          }
        >
          PJ
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("pf")}
          className={
            activeTab === "pf"
              ? CERTIFICATE_TAB_ACTIVE_BUTTON_CLASSNAME
              : CERTIFICATE_TAB_BUTTON_CLASSNAME
          }
        >
          PF
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("notifications")}
          className={
            activeTab === "notifications"
              ? CERTIFICATE_TAB_ACTIVE_BUTTON_CLASSNAME
              : CERTIFICATE_TAB_BUTTON_CLASSNAME
          }
        >
          <Bell className="h-4 w-4" />
          Notificações
        </button>
      </div>

      {hasActiveRows ? (
        <section className={CERTIFICATE_SUMMARY_BAR_CLASSNAME}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {activeStats.map((stat) => (
              <div key={stat.label} className={CERTIFICATE_SUMMARY_ITEM_CLASSNAME}>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
                <p className="text-xl font-semibold text-slate-900 dark:text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "pj" ? (
        <section className={CERTIFICATE_SUBPANEL_CLASSNAME}>
          <div className="grid items-end gap-3 lg:grid-cols-[minmax(0,1.2fr)_160px_180px_150px_auto]">
            <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
              <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>
                <Search className="h-4 w-4 text-slate-400" />
                Busca por nome
              </span>
              <input
                type="text"
                value={pjFilters.name}
                onChange={(event) => setPjFilters((prev) => ({ ...prev, name: event.target.value }))}
                className={CERTIFICATE_INPUT_CLASSNAME}
                placeholder="Nome do cliente"
              />
            </label>

            <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
              <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>CNPJ</span>
              <input
                type="text"
                value={pjFilters.cnpj}
                onChange={(event) =>
                  setPjFilters((prev) => ({ ...prev, cnpj: formatCnpjInput(event.target.value) }))
                }
                className={CERTIFICATE_INPUT_CLASSNAME}
                placeholder="Digite CNPJ"
              />
            </label>

            <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
              <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Responsável</span>
              <input
                type="text"
                value={pjFilters.responsible}
                onChange={(event) =>
                  setPjFilters((prev) => ({ ...prev, responsible: event.target.value }))
                }
                className={CERTIFICATE_INPUT_CLASSNAME}
                placeholder="Nome do responsável"
              />
            </label>

            <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
              <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Modelo</span>
              <input
                type="text"
                value={pjFilters.model}
                onChange={(event) => setPjFilters((prev) => ({ ...prev, model: event.target.value }))}
                className={CERTIFICATE_INPUT_CLASSNAME}
                placeholder="Modelo"
              />
            </label>
            <details className="relative self-end">
              <summary
                className={`${CERTIFICATE_COMPACT_BUTTON_CLASSNAME} h-10 cursor-pointer list-none justify-center [&::-webkit-details-marker]:hidden`}
              >
                <Filter className="h-4 w-4" />
                {advancedFilterLabel}
              </summary>
              <div className={CERTIFICATE_FILTER_MENU_CLASSNAME}>
                <div className={CERTIFICATE_FILTER_MENU_GRID_CLASSNAME}>
                  <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
                    <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>
                      <Filter className="h-4 w-4 text-slate-400" />
                      Status castelo
                    </span>
                    <CertificateNativeSelect
                      value={String(pjFilters.clientCasteloStatus ?? "")}
                      onChange={(event) =>
                        setPjFilters((prev) => ({
                          ...prev,
                          clientCasteloStatus: parseBooleanFilterValue(event.target.value),
                        }))
                      }
                    >
                      {BOOL_OPTIONS.map((option) => (
                        <option key={option.value || "all"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </CertificateNativeSelect>
                  </label>

                  <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
                    <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>
                      <Filter className="h-4 w-4 text-slate-400" />
                      Status focus
                    </span>
                    <CertificateNativeSelect
                      value={String(pjFilters.clientFocusStatus ?? "")}
                      onChange={(event) =>
                        setPjFilters((prev) => ({
                          ...prev,
                          clientFocusStatus: parseBooleanFilterValue(event.target.value),
                        }))
                      }
                    >
                      {BOOL_OPTIONS.map((option) => (
                        <option key={option.value || "all"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </CertificateNativeSelect>
                  </label>

                  <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
                    <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>
                      <Filter className="h-4 w-4 text-slate-400" />
                      Pago
                    </span>
                    <CertificateNativeSelect
                      value={String(pjFilters.wasPaid ?? "")}
                      onChange={(event) =>
                        setPjFilters((prev) => ({ ...prev, wasPaid: parseBooleanFilterValue(event.target.value) }))
                      }
                    >
                      {BOOL_OPTIONS.map((option) => (
                        <option key={option.value || "all"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </CertificateNativeSelect>
                  </label>

                  <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
                    <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>
                      <Filter className="h-4 w-4 text-slate-400" />
                      Com arquivo
                    </span>
                    <CertificateNativeSelect
                      value={String(pjFilters.hasCertificate ?? "")}
                      onChange={(event) =>
                        setPjFilters((prev) => ({ ...prev, hasCertificate: parseBooleanFilterValue(event.target.value) }))
                      }
                    >
                      {BOOL_OPTIONS.map((option) => (
                        <option key={option.value || "all"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </CertificateNativeSelect>
                  </label>
                </div>
              </div>
            </details>
          </div>
        </section>
      ) : null}

      {activeTab === "pf" ? (
        <section className={CERTIFICATE_SUBPANEL_CLASSNAME}>
          <div className="grid items-end gap-3 lg:grid-cols-[minmax(0,1.2fr)_145px_minmax(0,1fr)_150px_150px_auto]">
            <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
              <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>
                <Search className="h-4 w-4 text-slate-400" />
                Busca geral
              </span>
              <input
                type="text"
                value={pfFilters.search}
                onChange={(event) => setPfFilters((prev) => ({ ...prev, search: event.target.value }))}
                className={CERTIFICATE_INPUT_CLASSNAME}
                placeholder="Nome, e-mail ou observação"
              />
            </label>

            <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
              <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>CPF</span>
              <input
                type="text"
                value={pfFilters.cpf}
                onChange={(event) =>
                  setPfFilters((prev) => ({ ...prev, cpf: formatCpfInput(event.target.value) }))
                }
                className={CERTIFICATE_INPUT_CLASSNAME}
                placeholder="Digite CPF"
              />
            </label>

            <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
              <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Empresa</span>
              <input
                type="text"
                value={pfFilters.enterprise}
                onChange={(event) => setPfFilters((prev) => ({ ...prev, enterprise: event.target.value }))}
                className={CERTIFICATE_INPUT_CLASSNAME}
                placeholder="Nome da empresa"
              />
            </label>

            <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
              <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>CNPJ</span>
              <input
                type="text"
                value={pfFilters.cnpj}
                onChange={(event) =>
                  setPfFilters((prev) => ({ ...prev, cnpj: formatCnpjInput(event.target.value) }))
                }
                className={CERTIFICATE_INPUT_CLASSNAME}
                placeholder="Digite CNPJ da empresa"
              />
            </label>

            <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
              <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Modelo</span>
              <input
                type="text"
                value={pfFilters.model}
                onChange={(event) => setPfFilters((prev) => ({ ...prev, model: event.target.value }))}
                className={CERTIFICATE_INPUT_CLASSNAME}
                placeholder="Modelo"
              />
            </label>

            <details className="relative self-end">
              <summary
                className={`${CERTIFICATE_COMPACT_BUTTON_CLASSNAME} h-10 cursor-pointer list-none justify-center [&::-webkit-details-marker]:hidden`}
              >
                <Filter className="h-4 w-4" />
                {advancedFilterLabel}
              </summary>
              <div className={CERTIFICATE_FILTER_MENU_CLASSNAME}>
                <div className={CERTIFICATE_FILTER_MENU_GRID_CLASSNAME}>
                  <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
                    <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>
                      <Filter className="h-4 w-4 text-slate-400" />
                      Status castelo
                    </span>
                    <CertificateNativeSelect
                      value={String(pfFilters.clientCasteloStatus ?? "")}
                      onChange={(event) =>
                        setPfFilters((prev) => ({
                          ...prev,
                          clientCasteloStatus: parseBooleanFilterValue(event.target.value),
                        }))
                      }
                    >
                      {BOOL_OPTIONS.map((option) => (
                        <option key={option.value || "all"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </CertificateNativeSelect>
                  </label>

                  <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
                    <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>
                      <Filter className="h-4 w-4 text-slate-400" />
                      Status focus
                    </span>
                    <CertificateNativeSelect
                      value={String(pfFilters.clientFocusStatus ?? "")}
                      onChange={(event) =>
                        setPfFilters((prev) => ({
                          ...prev,
                          clientFocusStatus: parseBooleanFilterValue(event.target.value),
                        }))
                      }
                    >
                      {BOOL_OPTIONS.map((option) => (
                        <option key={option.value || "all"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </CertificateNativeSelect>
                  </label>

                  <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
                    <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>
                      <Filter className="h-4 w-4 text-slate-400" />
                      Pago
                    </span>
                    <CertificateNativeSelect
                      value={String(pfFilters.wasPaid ?? "")}
                      onChange={(event) =>
                        setPfFilters((prev) => ({ ...prev, wasPaid: parseBooleanFilterValue(event.target.value) }))
                      }
                    >
                      {BOOL_OPTIONS.map((option) => (
                        <option key={option.value || "all"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </CertificateNativeSelect>
                  </label>

                  <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
                    <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>
                      <Filter className="h-4 w-4 text-slate-400" />
                      Com arquivo
                    </span>
                    <CertificateNativeSelect
                      value={String(pfFilters.hasCertificate ?? "")}
                      onChange={(event) =>
                        setPfFilters((prev) => ({ ...prev, hasCertificate: parseBooleanFilterValue(event.target.value) }))
                      }
                    >
                      {BOOL_OPTIONS.map((option) => (
                        <option key={option.value || "all"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </CertificateNativeSelect>
                  </label>
                </div>
              </div>
            </details>
          </div>
        </section>
      ) : null}

      {activeListError ? (
        <section
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300"
        >
          <p className="font-semibold">Não foi possível carregar os dados desta aba.</p>
          <p className="mt-1">{activeListErrorMessage}</p>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className={CERTIFICATE_TABLE_SCROLL_AREA_CLASSNAME}>
          {activeTab === "pj" ? (
            <table className={CERTIFICATE_TABLE_CLASSNAME}>
              <thead className="border-b border-gray-200 bg-gray-50 dark:border-slate-800 dark:bg-slate-800/60">
                <tr>
                  <th className={CERTIFICATE_TABLE_NAME_HEAD_CELL_CLASSNAME}>Cliente</th>
                  <th className={CERTIFICATE_TABLE_HEAD_CELL_CLASSNAME}>Responsável</th>
                  <th className={CERTIFICATE_TABLE_HEAD_CELL_CLASSNAME}>Modelo</th>
                  <th className={CERTIFICATE_TABLE_HEAD_CELL_CLASSNAME}>Vencimento</th>
                  <th className={CERTIFICATE_TABLE_HEAD_CELL_CLASSNAME}>Arquivo</th>
                  <th className={CERTIFICATE_TABLE_ACTION_HEAD_CELL_CLASSNAME}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {activeListIsLoading && !hasPjRows ? (
                  <tr>
                    <td className={CERTIFICATE_TABLE_EMPTY_CELL_CLASSNAME} colSpan={6}>
                      <span className="inline-flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 animate-spin" />
                        Carregando certificados PJ...
                      </span>
                    </td>
                  </tr>
                ) : !hasPjRows ? (
                  <tr>
                    <td className={CERTIFICATE_TABLE_EMPTY_CELL_CLASSNAME} colSpan={6}>
                      Nenhum certificado PJ encontrado.
                    </td>
                  </tr>
                ) : (
                  visiblePjItems.map((item) => {
                    const expirationTone = getExpirationTone(item.expiration_date);
                    const withCertificateClassName = item.has_certificate
                      ? `${CERTIFICATE_BADGE_CLASSNAME} bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300`
                      : `${CERTIFICATE_BADGE_CLASSNAME} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300`;

                    return (
                      <tr
                        key={item.id}
                        className="border-b border-slate-200/80 align-top last:border-b-0 dark:border-slate-800"
                      >
                        <td className={CERTIFICATE_TABLE_NAME_CELL_CLASSNAME}>
                          <p className="font-semibold text-slate-900 dark:text-white">{item.name}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.cnpj}</p>
                        </td>
                        <td className={CERTIFICATE_TABLE_CELL_CLASSNAME}>{item.responsible}</td>
                        <td className={CERTIFICATE_TABLE_CELL_CLASSNAME}>{item.model}</td>
                        <td className={CERTIFICATE_TABLE_CELL_CLASSNAME}>
                          <div className="space-y-1">
                            <p>{formatDateBR(item.expiration_date)}</p>
                            <span className={`${CERTIFICATE_BADGE_CLASSNAME} ${expirationTone.className}`}>
                              {expirationTone.text}
                            </span>
                          </div>
                        </td>
                        <td className={CERTIFICATE_TABLE_CELL_CLASSNAME}>
                          <span className={withCertificateClassName}>
                            {item.has_certificate ? "Sim" : "Não"}
                          </span>
                        </td>
                        <td className={CERTIFICATE_TABLE_ACTION_CELL_CLASSNAME}>
                          <div className={CERTIFICATE_TABLE_ACTION_GROUP_CLASSNAME}>
                            <button
                              type="button"
                              onClick={() => handleSelectPj(item)}
                              className={CERTIFICATE_TABLE_ACTION_BUTTON_CLASSNAME}
                              title="Ver detalhe"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <CertificateFileActions
                              kind="pj"
                              certificateId={item.id}
                              hasCertificate={item.has_certificate}
                              canEdit={certificateCapabilities.canManageFiles}
                              canDeleteFile={certificateCapabilities.canDeleteFiles}
                              canDeleteRecord={certificateCapabilities.canDeleteRecords}
                              variant="inline"
                              onUploadSuccess={() => handlePjFileActionSuccess(item.id)}
                              onDeleteSuccess={() => handlePjFileActionSuccess(item.id)}
                            />
                            {canManageCertificateModule ? (
                              <button
                                type="button"
                                onClick={() => void handleDeletePj(item)}
                                className={CERTIFICATE_TABLE_DANGER_ACTION_BUTTON_CLASSNAME}
                                disabled={deletePjMutation.isPending}
                                title="Excluir certificado"
                              >
                                {deletePjMutation.isPending ? (
                                  <LoaderCircle className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : null}

          {activeTab === "pf" ? (
            <table className={CERTIFICATE_TABLE_CLASSNAME}>
              <thead className="border-b border-gray-200 bg-gray-50 dark:border-slate-800 dark:bg-slate-800/60">
                <tr>
                  <th className={CERTIFICATE_TABLE_NAME_HEAD_CELL_CLASSNAME}>Titular</th>
                  <th className={CERTIFICATE_TABLE_HEAD_CELL_CLASSNAME}>Empresa</th>
                  <th className={CERTIFICATE_TABLE_HEAD_CELL_CLASSNAME}>Modelo</th>
                  <th className={CERTIFICATE_TABLE_HEAD_CELL_CLASSNAME}>Vencimento</th>
                  <th className={CERTIFICATE_TABLE_HEAD_CELL_CLASSNAME}>Arquivo</th>
                  <th className={CERTIFICATE_TABLE_ACTION_HEAD_CELL_CLASSNAME}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {activeListIsLoading && !hasPfRows ? (
                  <tr>
                    <td className={CERTIFICATE_TABLE_EMPTY_CELL_CLASSNAME} colSpan={6}>
                      <span className="inline-flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 animate-spin" />
                        Carregando certificados PF...
                      </span>
                    </td>
                  </tr>
                ) : !hasPfRows ? (
                  <tr>
                    <td className={CERTIFICATE_TABLE_EMPTY_CELL_CLASSNAME} colSpan={6}>
                      Nenhum certificado PF encontrado.
                    </td>
                  </tr>
                ) : (
                  visiblePfItems.map((item) => {
                    const expirationTone = getExpirationTone(item.expiration_date);

                    return (
                      <tr
                        key={item.id}
                        className="border-b border-slate-200/80 align-top last:border-b-0 dark:border-slate-800"
                      >
                        <td className={CERTIFICATE_TABLE_NAME_CELL_CLASSNAME}>
                          <p className="font-semibold text-slate-900 dark:text-white">{item.name}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.cpf}</p>
                        </td>
                        <td className={CERTIFICATE_TABLE_CELL_CLASSNAME}>
                          <p>{item.enterprise || "-"}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.cnpj || "-"}</p>
                        </td>
                        <td className={CERTIFICATE_TABLE_CELL_CLASSNAME}>{item.model}</td>
                        <td className={CERTIFICATE_TABLE_CELL_CLASSNAME}>
                          <div className="space-y-1">
                            <p>{formatDateBR(item.expiration_date)}</p>
                            <span className={`${CERTIFICATE_BADGE_CLASSNAME} ${expirationTone.className}`}>
                              {expirationTone.text}
                            </span>
                          </div>
                        </td>
                        <td className={CERTIFICATE_TABLE_CELL_CLASSNAME}>
                          <span className={item.has_certificate ? CERTIFICATE_BADGE_CLASSNAME + " bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : CERTIFICATE_BADGE_CLASSNAME + " bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}>
                            {item.has_certificate ? "Sim" : "Não"}
                          </span>
                        </td>
                        <td className={CERTIFICATE_TABLE_ACTION_CELL_CLASSNAME}>
                          <div className={CERTIFICATE_TABLE_ACTION_GROUP_CLASSNAME}>
                            <button
                              type="button"
                              onClick={() => handleSelectPf(item)}
                              className={CERTIFICATE_TABLE_ACTION_BUTTON_CLASSNAME}
                              title="Ver detalhe"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <CertificateFileActions
                              kind="pf"
                              certificateId={item.id}
                              hasCertificate={item.has_certificate}
                              canEdit={certificateCapabilities.canManageFiles}
                              canDeleteFile={certificateCapabilities.canDeleteFiles}
                              canDeleteRecord={certificateCapabilities.canDeleteRecords}
                              variant="inline"
                              onUploadSuccess={() => handlePfFileActionSuccess(item.id)}
                              onDeleteSuccess={() => handlePfFileActionSuccess(item.id)}
                            />
                            {canManageCertificateModule ? (
                              <button
                                type="button"
                                onClick={() => void handleDeletePf(item)}
                                className={CERTIFICATE_TABLE_DANGER_ACTION_BUTTON_CLASSNAME}
                                disabled={deletePfMutation.isPending}
                                title="Excluir certificado"
                              >
                                {deletePfMutation.isPending ? (
                                  <LoaderCircle className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : null}

          {activeTab === "notifications" ? (
            <table className={CERTIFICATE_TABLE_CLASSNAME}>
              <thead className="border-b border-gray-200 bg-gray-50 dark:border-slate-800 dark:bg-slate-800/60">
                <tr>
                  <th className={CERTIFICATE_TABLE_NAME_HEAD_CELL_CLASSNAME}>Cliente</th>
                  <th className={CERTIFICATE_TABLE_HEAD_CELL_CLASSNAME}>Tipo</th>
                  <th className={CERTIFICATE_TABLE_HEAD_CELL_CLASSNAME}>Data</th>
                  <th className={CERTIFICATE_TABLE_ACTION_HEAD_CELL_CLASSNAME}>Abrir</th>
                </tr>
              </thead>
              <tbody>
                {activeListIsLoading && !hasNotificationRows ? (
                  <tr>
                    <td className={CERTIFICATE_TABLE_EMPTY_CELL_CLASSNAME} colSpan={4}>
                      <span className="inline-flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 animate-spin" />
                        Carregando notificações...
                      </span>
                    </td>
                  </tr>
                ) : !hasNotificationRows ? (
                  <tr>
                    <td className={CERTIFICATE_TABLE_EMPTY_CELL_CLASSNAME} colSpan={4}>
                      Nenhuma notificação encontrada.
                    </td>
                  </tr>
                ) : (
                  visibleNotificationItems.map((notification) => (
                    <tr
                      key={notification.id}
                      className="border-b border-slate-200/80 align-top last:border-b-0 dark:border-slate-800"
                    >
                      <td className={CERTIFICATE_TABLE_NAME_CELL_CLASSNAME}>{notification.client_name}</td>
                      <td className={CERTIFICATE_TABLE_CELL_CLASSNAME}>
                        {notification.type}
                      </td>
                      <td className={CERTIFICATE_TABLE_CELL_CLASSNAME}>{formatDateBR(notification.date)}</td>
                      <td className={CERTIFICATE_TABLE_ACTION_CELL_CLASSNAME}>
                        <button
                          type="button"
                          onClick={() => handleOpenNotification(notification)}
                          className={CERTIFICATE_TABLE_ACTION_BUTTON_CLASSNAME}
                          title="Abrir certificado relacionado"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : null}
        </div>

        {hasActiveRows && activeListHasMore ? (
          <div className="flex items-center justify-end border-t border-slate-200 px-4 py-3 dark:border-slate-800">
            <button
              type="button"
              onClick={handleLoadMore}
              className={CERTIFICATE_COMPACT_BUTTON_CLASSNAME}
              disabled={activeListIsFetching}
            >
              {activeListIsFetching ? (
                <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CalendarClock className="h-3.5 w-3.5" />
              )}
              Carregar mais
            </button>
          </div>
        ) : null}
      </section>

      <Dialog
        open={isFormMode}
        onOpenChange={handleFormOpenChange}
        title={formDialogTitle}
        description={formDialogDescription}
        contentClassName={CERTIFICATE_FORM_MODAL_CONTENT_CLASSNAME}
        bodyClassName={CERTIFICATE_FORM_MODAL_BODY_CLASSNAME}
        footer={
          <>
            <button
              type="button"
              onClick={handleCancelForm}
              className={CERTIFICATE_SECONDARY_BUTTON_CLASSNAME}
              disabled={formSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form={activeFormId}
              className={CERTIFICATE_PRIMARY_BUTTON_CLASSNAME}
              disabled={shouldDisableFormSubmit}
            >
              {formSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {formSubmitLabel}
            </button>
          </>
        }
      >
        {workspaceMode === "createPj" ? (
          <CertificateForm
            key="create-pj"
            formId={activeFormId}
            kind="pj"
            mode="create"
            isSubmitting={formSubmitting}
            onSubmit={handleSubmitCreatePj}
          />
        ) : null}

        {workspaceMode === "createPf" ? (
          <CertificateForm
            key="create-pf"
            formId={activeFormId}
            kind="pf"
            mode="create"
            isSubmitting={formSubmitting}
            onSubmit={handleSubmitCreatePf}
          />
        ) : null}

        {workspaceMode === "editPj" ? (
          activeDetailErrorMessage ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
              {activeDetailErrorMessage}
            </div>
          ) : activeDetailIsLoading || !pjDetail ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              Carregando detalhe do certificado PJ...
            </div>
          ) : (
            <CertificateForm
              key="edit-pj"
              formId={activeFormId}
              kind="pj"
              mode="edit"
              initialData={pjDetail}
              isSubmitting={formSubmitting}
              onSubmit={handleSubmitEditPj}
            />
          )
        ) : null}

        {workspaceMode === "editPf" ? (
          activeDetailErrorMessage ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
              {activeDetailErrorMessage}
            </div>
          ) : activeDetailIsLoading || !pfDetail ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              Carregando detalhe do certificado PF...
            </div>
          ) : (
            <CertificateForm
              key="edit-pf"
              formId={activeFormId}
              kind="pf"
              mode="edit"
              initialData={pfDetail}
              isSubmitting={formSubmitting}
              onSubmit={handleSubmitEditPf}
            />
          )
        ) : null}
      </Dialog>

      {shouldShowDetailPanel ? (
        <section className={`${CERTIFICATE_PANEL_CLASSNAME} space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Detalhe</h2>
            {canManageCertificateModule ? (
              <button
                type="button"
                onClick={handleStartEditSelected}
                className={CERTIFICATE_COMPACT_BUTTON_CLASSNAME}
                disabled={isFormMode}
              >
                Editar
              </button>
            ) : null}
          </div>

          {activeDetailIsLoading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
              <span className="inline-flex items-center gap-2">
                <CalendarClock className="h-4 w-4 animate-spin" />
                Carregando detalhe do certificado...
              </span>
            </div>
          ) : null}

          {activeDetailErrorMessage ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
              {activeDetailErrorMessage}
            </div>
          ) : null}

          {!activeDetailIsLoading && !activeDetailErrorMessage && selected?.type === "pj" ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Cliente</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {pjDetail?.name ?? "-"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">CNPJ</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">{pjDetail?.cnpj ?? "-"}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Responsável</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {pjDetail?.responsible ?? "-"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Modelo</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">{pjDetail?.model ?? "-"}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Vencimento</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {formatDateBR(pjDetail?.expiration_date)}
                    <span className="ml-2">| {renderExpirationBadge(pjDetail?.expiration_date ?? "")}</span>
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Pagamento</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {pjDetail?.was_paid ? "Pago" : "Não pago"}
                  </p>
                  {pjDetail?.was_paid ? (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      {formatDateBR(pjDetail?.payment_date)} | {paymentAmountText(pjDetail?.payment_amount)}
                    </p>
                  ) : null}
                </div>
              </div>

              {renderPasswordBlock(pjDetail?.password)}

              {pjDetail ? (
                <CertificateFileActions
                  kind="pj"
                  certificateId={pjDetail.id}
                  hasCertificate={pjDetail.has_certificate}
                  canEdit={certificateCapabilities.canManageFiles}
                  canDeleteFile={certificateCapabilities.canDeleteFiles}
                  canDeleteRecord={certificateCapabilities.canDeleteRecords}
                  onUploadSuccess={() => handlePjFileActionSuccess(pjDetail.id)}
                  onDeleteSuccess={() => handlePjFileActionSuccess(pjDetail.id)}
                />
              ) : null}

              <div className="grid gap-3">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Observações</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-words">
                  {pjDetail?.notes ?? "Sem observações."}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Telefone/contato: {pjDetail?.contact_info ?? "-"}
                </p>
              </div>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <span
                  className={`inline-flex w-fit ${pjDetail?.client_castelo_status ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"} ${ "rounded-full px-2.5 py-1 text-xs font-semibold"}`}
                >
                  Castelo: {pjDetail?.client_castelo_status ? "Sim" : "Não"}
                </span>
                <span
                  className={`inline-flex w-fit ${pjDetail?.client_focus_status ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"} ${ "rounded-full px-2.5 py-1 text-xs font-semibold"}`}
                >
                  Focus: {pjDetail?.client_focus_status ? "Sim" : "Não"}
                </span>
                <span
                  className={`inline-flex w-fit ${pjDetail?.has_certificate ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"} ${ "rounded-full px-2.5 py-1 text-xs font-semibold"}`}
                >
                  Arquivo: {pjDetail?.has_certificate ? "Sim" : "Não"}
                </span>
                <span
                  className="inline-flex w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Natureza: {pjDetail?.legal_nature ?? "-"}
                </span>
              </div>
            </div>
          ) : null}

          {!activeDetailIsLoading && !activeDetailErrorMessage && selected?.type === "pf" ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Titular</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {pfDetail?.name ?? "-"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">CPF</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">{pfDetail?.cpf ?? "-"}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Empresa</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">{pfDetail?.enterprise ?? "-"}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Modelo</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">{pfDetail?.model ?? "-"}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Vencimento</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {formatDateBR(pfDetail?.expiration_date)}
                    <span className="ml-2">| {renderExpirationBadge(pfDetail?.expiration_date ?? "")}</span>
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Pagamento</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {pfDetail?.was_paid ? "Pago" : "Não pago"}
                  </p>
                  {pfDetail?.was_paid ? (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      {formatDateBR(pfDetail?.payment_date)} | {paymentAmountText(pfDetail?.payment_amount)}
                    </p>
                  ) : null}
                </div>
              </div>

              {renderPasswordBlock(pfDetail?.password)}

              {pfDetail ? (
                <CertificateFileActions
                  kind="pf"
                  certificateId={pfDetail.id}
                  hasCertificate={pfDetail.has_certificate}
                  canEdit={certificateCapabilities.canManageFiles}
                  canDeleteFile={certificateCapabilities.canDeleteFiles}
                  canDeleteRecord={certificateCapabilities.canDeleteRecords}
                  onUploadSuccess={() => handlePfFileActionSuccess(pfDetail.id)}
                  onDeleteSuccess={() => handlePfFileActionSuccess(pfDetail.id)}
                />
              ) : null}

              <div className="grid gap-3">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Observações</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-words">
                  {pfDetail?.notes ?? "Sem observações."}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Telefone/contato: {pfDetail?.contact_info ?? "-"}
                </p>
              </div>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <span
                  className={`inline-flex w-fit ${pfDetail?.client_castelo_status ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"} ${ "rounded-full px-2.5 py-1 text-xs font-semibold"}`}
                >
                  Castelo: {pfDetail?.client_castelo_status ? "Sim" : "Não"}
                </span>
                <span
                  className={`inline-flex w-fit ${pfDetail?.client_focus_status ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"} ${ "rounded-full px-2.5 py-1 text-xs font-semibold"}`}
                >
                  Focus: {pfDetail?.client_focus_status ? "Sim" : "Não"}
                </span>
                <span
                  className={`inline-flex w-fit ${pfDetail?.has_certificate ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"} ${ "rounded-full px-2.5 py-1 text-xs font-semibold"}`}
                >
                  Arquivo: {pfDetail?.has_certificate ? "Sim" : "Não"}
                </span>
                <span
                  className="inline-flex w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  CNPJ da empresa: {pfDetail?.cnpj ?? "-"}
                </span>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
