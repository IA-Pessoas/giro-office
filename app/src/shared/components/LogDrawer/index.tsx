import { useState } from "react";
import type { AxiosError } from "axios";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FiClock } from "react-icons/fi";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import styles from "./LogDrawer.module.css";

import { setupAPIClient } from "@shared/services/api";

interface LogDrawerProps {
  referring: string;
  referringId: string;
}

interface AuditChange {
  from?: unknown;
  to?: unknown;
}

interface AuditRecord {
  id: string;
  userId?: string | null;
  method?: string;
  path?: string;
  action?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
  changes?: Record<string, AuditChange> | null;
}

interface AuditSearchResponse {
  items: AuditRecord[];
  total: number;
  page: number;
  pageSize: number;
}

const fieldLabels: Record<string, string> = {
  department_id: "Departamento",
  name: "Nome",
  permission: "Permissão",
  status: "Status",
  color: "Cor",
  solution: "Solução",
};

const permissionMap: Record<number, string> = {
  0: "Padrão",
  1: "Sub Administrador",
  2: "Administrador",
};

function extractAuditSearchResponse(payload: unknown): AuditSearchResponse | null {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    payload.data &&
    typeof payload.data === "object" &&
    "items" in payload.data &&
    Array.isArray((payload.data as AuditSearchResponse).items)
  ) {
    const data = payload.data as AuditSearchResponse;
    return {
      items: data.items,
      total: typeof data.total === "number" ? data.total : data.items.length,
      page: typeof data.page === "number" ? data.page : 1,
      pageSize: typeof data.pageSize === "number" ? data.pageSize : 20,
    };
  }

  return null;
}

function formatValue(key: string, value: unknown): unknown {
  if (key === "permission" && typeof value === "number") {
    return permissionMap[value] ?? value;
  }

  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }

  return value ?? "-";
}

export default function LogDrawer({ referring, referringId }: LogDrawerProps) {
  const apiClient = setupAPIClient();
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState<"item" | "organization">("item");
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getHistoryErrorMessage = (error: unknown): string => {
    const axiosError = error as AxiosError<{ error?: string }>;
    const status = axiosError.response?.status;

    if (status === 500 || status === 502 || status === 503) {
      return "Histórico indisponível no momento.";
    }

    if (status === 403) {
      return "Você não tem permissão para visualizar o histórico.";
    }

    return "Não foi possível carregar o histórico agora.";
  };

  const loadHistory = async (nextScope: "item" | "organization", nextPage = 1) => {
    setScope(nextScope);
    setLoading(true);
    setIsOpen(true);
    setErrorMessage(null);

    try {
      const response = await apiClient.get("/audit/requests", {
        params: {
          ...(nextScope === "item" ? { referring, referringId } : {}),
          page: nextPage,
          pageSize: 20,
        },
      });

      const result = extractAuditSearchResponse(response.data);
      setLogs(result?.items ?? []);
      setPage(result?.page ?? nextPage);
      setTotal(result?.total ?? 0);
    } catch (error) {
      setLogs([]);
      setTotal(0);
      setErrorMessage(getHistoryErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsOpen(false);
      return;
    }

    void loadHistory("item");
  };

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <button type="button" className={styles.trigger}>
          <FiClock />
          Histórico
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={styles.overlay} />
        <DialogPrimitive.Content className={styles.drawer}>
          <DialogPrimitive.Close asChild>
            <button type="button" className={styles.closeBtn} aria-label="Fechar histórico">
              x
            </button>
          </DialogPrimitive.Close>
          <DialogPrimitive.Title className={styles.header}>
            {scope === "organization" ? "Auditoria da organização" : "Histórico de alterações"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {scope === "organization"
              ? "Lista paginada de requisições auditadas nesta organização."
              : "Lista de alterações registradas para o item selecionado."}
          </DialogPrimitive.Description>
          <div className={styles.body}>
            <div className={styles.historyScopes} role="group" aria-label="Escopo do histórico">
              <button
                type="button"
                className={styles.trigger}
                aria-pressed={scope === "item"}
                onClick={() => void loadHistory("item")}
              >
                Histórico do item
              </button>
              <button
                type="button"
                className={styles.trigger}
                aria-pressed={scope === "organization"}
                onClick={() => void loadHistory("organization")}
              >
                Auditoria da organização
              </button>
            </div>
            {loading ? (
              <div className={styles.spinner}>Carregando...</div>
            ) : errorMessage ? (
              <p className={styles.text}>{errorMessage}</p>
            ) : logs.length === 0 ? (
              <p className={styles.text}>
                {scope === "organization"
                  ? "Nenhuma requisição registrada."
                  : "Nenhuma alteração registrada."}
              </p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className={styles.logCard}>
                  <p className={styles.logTitle}>
                    {scope === "organization"
                      ? (log.action ?? `${log.method ?? "Requisição"} ${log.path ?? ""}`)
                      : (log.action ?? "Alteração")}
                  </p>
                  <p className={styles.text}>
                    Em: {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </p>
                  {log.userId ? (
                    <p className={styles.text}>Usuário: {log.userId}</p>
                  ) : null}
                  {log.metadata?.actorKind === "platform" &&
                  typeof log.metadata.actorPlatformUserId === "string" ? (
                    <p className={styles.text}>
                      Operador na personificação: {log.metadata.actorPlatformUserId}
                    </p>
                  ) : null}
                  <div className={styles.changes}>
                    {log.action !== "Cadastro" && log.changes
                      ? Object.entries(log.changes).map(([key, value]) => {
                          const label = fieldLabels[key] || key;
                          const from = formatValue(key, value?.from);
                          const to = formatValue(key, value?.to);

                          return (
                            <p key={key} className={styles.text}>
                              <strong>{label}:</strong> De: {String(from)} → Para: {String(to)}
                            </p>
                          );
                        })
                      : null}
                  </div>
                </div>
              ))
            )}
            {scope === "organization" && total > 20 ? (
              <div
                className={styles.historyPagination}
                role="group"
                aria-label="Paginação da auditoria"
              >
                <button
                  type="button"
                  className={styles.trigger}
                  aria-label="Página anterior"
                  disabled={loading || page <= 1}
                  onClick={() => void loadHistory("organization", page - 1)}
                >
                  Anterior
                </button>
                <span className={styles.text} aria-live="polite">
                  Página {page} de {Math.ceil(total / 20)}
                </span>
                <button
                  type="button"
                  className={styles.trigger}
                  aria-label="Próxima página"
                  disabled={loading || page * 20 >= total}
                  onClick={() => void loadHistory("organization", page + 1)}
                >
                  Próxima
                </button>
              </div>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
