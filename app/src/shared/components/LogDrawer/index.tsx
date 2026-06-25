import { useState } from "react";
import type { AxiosError } from "axios";
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
  action?: string | null;
  createdAt: string;
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

function extractAuditItems(payload: unknown): AuditRecord[] {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    payload.data &&
    typeof payload.data === "object" &&
    "items" in payload.data &&
    Array.isArray((payload.data as AuditSearchResponse).items)
  ) {
    return (payload.data as AuditSearchResponse).items;
  }

  return [];
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
  const [logs, setLogs] = useState<AuditRecord[]>([]);
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

  const handleOpen = async () => {
    setLoading(true);
    setIsOpen(true);
    setErrorMessage(null);

    try {
      const response = await apiClient.get("/audit/requests", {
        params: {
          referring,
          referringId,
          page: 1,
          pageSize: 20,
        },
      });

      setLogs(extractAuditItems(response.data));
    } catch (error) {
      setLogs([]);
      setErrorMessage(getHistoryErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button type="button" className={styles.trigger} onClick={handleOpen}>
        <FiClock />
        Histórico
      </button>

      {isOpen && (
        <div className={styles.overlay} onClick={() => setIsOpen(false)}>
          <aside className={styles.drawer} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => setIsOpen(false)}
              aria-label="Fechar histórico"
            >
              x
            </button>
            <div className={styles.header}>Histórico de alterações</div>
            <div className={styles.body}>
              {loading ? (
                <div className={styles.spinner}>Carregando...</div>
              ) : errorMessage ? (
                <p className={styles.text}>{errorMessage}</p>
              ) : logs.length === 0 ? (
                <p className={styles.text}>Nenhuma alteração registrada.</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className={styles.logCard}>
                    <p className={styles.logTitle}>{log.action ?? "Alteração"}</p>
                    <p className={styles.text}>
                      Em: {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                    {log.userId ? (
                      <p className={styles.text}>Usuário: {log.userId}</p>
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
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
