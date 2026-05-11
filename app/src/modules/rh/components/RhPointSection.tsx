import { useMemo, useState } from "react";

import { useAuth } from "@/context/AuthContext";
import { permissionService } from "@modules/users/services/permissionService";
import { normalizePermissionResponse } from "@modules/users/utils/permissionUtils";
import { useFetch } from "@shared/hooks";
import { useAssignableUsers } from "../hooks/useAssignableUsers";
import type { RhPointAdjustmentStatus } from "../types";
import { RhPointAdjustmentPanel } from "./RhPointAdjustmentPanel";
import { RhPointAdjustmentRequestModal } from "./RhPointAdjustmentRequestModal";
import { RhPointFilters } from "./RhPointFilters";
import { RhPointSummaryCards } from "./RhPointSummaryCards";
import { RhPointTable } from "./RhPointTable";
import { RhPointTodayCard } from "./RhPointTodayCard";

function formatInputDate(date: Date) {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function getMonthStartInputValue() {
  const now = new Date();
  return formatInputDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

function getTodayInputValue() {
  return formatInputDate(new Date());
}

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function RhPointSection() {
  const { user } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [month, setMonth] = useState(getCurrentMonthValue);
  const [dateFrom, setDateFrom] = useState(getMonthStartInputValue);
  const [dateTo, setDateTo] = useState(getTodayInputValue);
  const [selectedAdjustmentStatus, setSelectedAdjustmentStatus] = useState<
    "" | RhPointAdjustmentStatus
  >("");
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);

  const permissionQuery = useFetch(
    ["rh", "point", "permissions", user?.id ?? ""],
    () => permissionService.getByUserId(user?.id ?? ""),
    {
      enabled: Boolean(user?.id),
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  const normalizedPermissions = useMemo(() => {
    if (!permissionQuery.data) {
      return null;
    }

    return normalizePermissionResponse(permissionQuery.data).known;
  }, [permissionQuery.data]);

  const canManagePoint = Boolean(
    user?.permission === 2 ||
      (normalizedPermissions?.rh !== null &&
        normalizedPermissions?.rh !== undefined &&
        normalizedPermissions.rh >= 1),
  );

  const assignableUsersQuery = useAssignableUsers({
    enabled: canManagePoint,
  });

  const assignableUsers = assignableUsersQuery.data ?? [];
  const currentUserName = user?.name?.trim() || "Você";

  return (
    <div className="space-y-6">
      <RhPointFilters
        assignableUsers={assignableUsers}
        canManagePoint={canManagePoint}
        currentUserLabel={currentUserName}
        selectedUserId={selectedUserId}
        month={month}
        dateFrom={dateFrom}
        dateTo={dateTo}
        selectedAdjustmentStatus={selectedAdjustmentStatus}
        onUserChange={setSelectedUserId}
        onMonthChange={setMonth}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onAdjustmentStatusChange={setSelectedAdjustmentStatus}
      />

      <RhPointTodayCard currentUserName={currentUserName} />
      <RhPointSummaryCards />
      <RhPointTable />
      <RhPointAdjustmentPanel />

      <RhPointAdjustmentRequestModal
        open={isAdjustmentModalOpen}
        onClose={() => setIsAdjustmentModalOpen(false)}
      />
    </div>
  );
}
