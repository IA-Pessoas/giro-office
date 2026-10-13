import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, History, Loader2 } from "lucide-react";

import { listAdminUsers } from "@modules/users";
import { useFetch } from "@shared/hooks";
import { formatDateTime } from "@shared/utils/dateFormat";

import { tiQueryKeys, useTiAccessLogs } from "../hooks";
import type { TiAccessLogType } from "../types";
import { TiNativeSelect } from "./TiNativeSelect";
import {
  TiDataTable,
  TiEmptyState,
  TiInlineNotice,
  TiPanel,
  TiSectionHeader,
} from "./tiFormControls";
import { tiSecondaryButtonClassName } from "./tiWorkspaceUi";

const ACCESS_LOG_TYPE_LABELS: Record<TiAccessLogType, string> = {
  login: "Login",
  access: "Acesso",
};

export function TiAccessLogsTab() {
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);

  // Sem filtro de status: ex-colaboradores também têm acessos a consultar.
  const usersQuery = useFetch(tiQueryKeys.accessLogUsers(), () => listAdminUsers());
  const accessLogsQuery = useTiAccessLogs(userId || undefined, page);

  const userOptions = useMemo(
    () => [
      { value: "", label: "Selecione" },
      ...(usersQuery.data ?? []).map((user) => ({
        value: user.id,
        label: user.department?.name ? `${user.name} - ${user.department.name}` : user.name,
      })),
    ],
    [usersQuery.data],
  );

  const accessLogs = accessLogsQuery.data;
  const userName = accessLogs ? (accessLogs.user.full_name ?? accessLogs.user.name) : "-";

  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Logs de acesso"
        description="Logins e acessos registrados no Workspace antigo, por usuário, do mais recente para o mais antigo."
      />

      <div className="max-w-md">
        <TiNativeSelect
          disabled={usersQuery.isLoading}
          label="Usuário"
          onChange={(event) => {
            setUserId(event.target.value);
            setPage(1);
          }}
          options={userOptions}
          value={userId}
        />
      </div>

      {usersQuery.isError ? (
        <TiInlineNotice tone="danger">Não foi possível carregar os usuários.</TiInlineNotice>
      ) : null}

      {!userId ? (
        <TiEmptyState
          icon={History}
          title="Selecione um usuário"
          description="Os logins e acessos do usuário escolhido aparecem aqui."
        />
      ) : null}

      {userId && accessLogsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Carregando logs de acesso...</span>
        </div>
      ) : null}

      {userId && accessLogsQuery.isError ? (
        <TiInlineNotice tone="danger">Não foi possível carregar os logs de acesso.</TiInlineNotice>
      ) : null}

      {userId && accessLogs && accessLogs.items.length === 0 ? (
        <TiEmptyState
          icon={History}
          title="Nenhum acesso registrado"
          description={
            page > 1
              ? "Não há registros mais antigos para este usuário."
              : "Este usuário não tem logins ou acessos migrados do Workspace antigo."
          }
        />
      ) : null}

      {userId && accessLogs && accessLogs.items.length > 0 ? (
        <TiDataTable headers={["Tipo", "Referente", "Usuário", "Data", "Local/origem"]}>
          {accessLogs.items.map((item) => (
            <tr key={item.id} className="text-slate-700 dark:text-slate-200">
              <td className="px-4 py-2">{ACCESS_LOG_TYPE_LABELS[item.type]}</td>
              <td className="px-4 py-2">{item.referring}</td>
              <td className="px-4 py-2">{userName}</td>
              <td className="px-4 py-2">{formatDateTime(item.date, "-")}</td>
              <td className="px-4 py-2">{item.origin ?? "Não migrado"}</td>
            </tr>
          ))}
        </TiDataTable>
      ) : null}

      {userId && accessLogs ? (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className={tiSecondaryButtonClassName}
            disabled={page === 1 || accessLogsQuery.isFetching}
            onClick={() => setPage((current) => current - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Mais recentes</span>
          </button>
          <span className="text-sm text-slate-600 dark:text-slate-300">Página {page}</span>
          <button
            type="button"
            className={tiSecondaryButtonClassName}
            disabled={!accessLogs.has_more || accessLogsQuery.isFetching}
            onClick={() => setPage((current) => current + 1)}
          >
            <span>Mais antigos</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </TiPanel>
  );
}
