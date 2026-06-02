import { useEffect, useMemo, useState } from "react";
import { Award, BarChart3, Calendar, Clock, FileText, Users } from "lucide-react";

import {
  RhDashboardSection,
  RhHolidaysSection,
  RhPointSection,
  RhRequestsSection,
  RhScoreSection,
  useRhRequests,
} from "@modules/rh";
import { useRhPermissions } from "@modules/rh/hooks/useRhPermissions";
import { Dialog } from "@shared/components";

type RhMainTab = "dashboard" | "requests" | "evaluations" | "point";

export function RH() {
  const [activeTab, setActiveTab] = useState<RhMainTab>("dashboard");
  const [isHolidaysManagerOpen, setIsHolidaysManagerOpen] = useState(false);
  const { canManageRh, canManageRhRequests, canViewRhDashboard, permissionQuery } =
    useRhPermissions("rh-shell");
  const newRequestsQuery = useRhRequests(
    { status: "New" },
    { enabled: canManageRhRequests },
  );
  const inProgressRequestsQuery = useRhRequests(
    { status: "In_Progress" },
    { enabled: canManageRhRequests },
  );

  const pendingRequestsCount = useMemo(() => {
    if (!canManageRhRequests) {
      return 0;
    }

    const newCount = newRequestsQuery.data?.length ?? 0;
    const inProgressCount = inProgressRequestsQuery.data?.length ?? 0;
    return newCount + inProgressCount;
  }, [canManageRhRequests, inProgressRequestsQuery.data, newRequestsQuery.data]);

  useEffect(() => {
    if (!permissionQuery.isLoading && !canViewRhDashboard && activeTab === "dashboard") {
      setActiveTab("requests");
    }
  }, [activeTab, canViewRhDashboard, permissionQuery.isLoading]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
              <Users className="h-6 w-6 text-white" />
            </div>
            Recursos Humanos
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Solicitações, ponto, folhas e avaliações em um único fluxo.
          </p>
        </div>

        {canManageRh ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsHolidaysManagerOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Calendar className="h-4 w-4" />
              <span>Gerenciar feriados</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
        <div className="overflow-x-auto">
          <div className="flex min-w-max items-center justify-center gap-1">
            {canViewRhDashboard ? (
              <RhTabButton
                active={activeTab === "dashboard"}
                icon={BarChart3}
                label="Dashboard"
                onClick={() => setActiveTab("dashboard")}
              />
            ) : null}
            <RhTabButton
              active={activeTab === "requests"}
              icon={FileText}
              label="Solicitações"
              badgeCount={pendingRequestsCount}
              onClick={() => setActiveTab("requests")}
            />
            <RhTabButton
              active={activeTab === "evaluations"}
              icon={Award}
              label="Avaliações"
              onClick={() => setActiveTab("evaluations")}
            />
            <RhTabButton
              active={activeTab === "point"}
              icon={Clock}
              label="Ponto"
              onClick={() => setActiveTab("point")}
            />
          </div>
        </div>
      </div>

      {canViewRhDashboard && activeTab === "dashboard" ? (
        <RhDashboardSection
          isActive={activeTab === "dashboard"}
          onNavigateToTab={setActiveTab}
        />
      ) : null}

      {activeTab === "requests" ? <RhRequestsSection /> : null}
      {activeTab === "evaluations" ? <RhScoreSection /> : null}
      {activeTab === "point" ? <RhPointSection /> : null}

      <Dialog
        open={isHolidaysManagerOpen}
        onOpenChange={setIsHolidaysManagerOpen}
        title="Gerenciar feriados"
        description="Gerenciamento administrativo de feriados do RH"
        contentClassName="w-[min(92vw,960px)]"
        bodyClassName="max-h-[78vh] overflow-y-auto"
      >
        <RhHolidaysSection />
      </Dialog>
    </div>
  );
}

function RhTabButton({
  active,
  badgeCount,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  badgeCount?: number;
  icon: typeof BarChart3;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-lg px-5 py-2.5 font-medium transition-all ${
        active
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
      }`}
    >
      <Icon className="mr-2 h-4 w-4" />
      <span>{label}</span>
      {badgeCount ? (
        <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
          {badgeCount}
        </span>
      ) : null}
    </button>
  );
}
