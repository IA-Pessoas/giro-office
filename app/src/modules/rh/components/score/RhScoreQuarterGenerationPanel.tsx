import { useMemo, useState } from "react";
import { ChevronDown, FilePlus2, Loader2, Target } from "lucide-react";
import { toast } from "@shared/services/toast";
import { useAssignableUsers } from "../../hooks/useAssignableUsers";
import { useGenerateRhScoreQuarterMutation } from "../../hooks/useRhScore";
import { getDefaultRhQuarterValue, getRhQuarterOptions } from "../../utils/rhScoreUi";
import { getAssignableUserLabel, getErrorMessage } from "./rhScoreShared";

export function RhScoreQuarterGenerationPanel({ canManageScore }: { canManageScore: boolean }) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedQuarter, setSelectedQuarter] = useState(getDefaultRhQuarterValue);
  const quarterOptions = useMemo(() => getRhQuarterOptions(), []);
  const assignableUsersQuery = useAssignableUsers({ enabled: canManageScore, module: "rh" });
  const generateQuarterMutation = useGenerateRhScoreQuarterMutation();

  const assignableUsers = assignableUsersQuery.data ?? [];

  async function handleGenerateQuarter() {
    if (!selectedUserId) {
      toast.warn("Selecione o colaborador para gerar o trimestre.");
      return;
    }

    if (!selectedQuarter) {
      toast.warn("Selecione o trimestre.");
      return;
    }

    try {
      await generateQuarterMutation.mutateAsync({
        target_user_id: selectedUserId,
        quarter: selectedQuarter,
      });
      toast.success("Trimestre gerado com sucesso.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível gerar o trimestre."));
    }
  }

  return (
    <aside className="h-full rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
          <FilePlus2 className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Gerar trimestre</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Gere o score trimestral para um colaborador.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Colaborador</span>
          <div className="relative">
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              disabled={assignableUsersQuery.isLoading || assignableUsersQuery.isError}
            >
              <option value="">Selecione</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {getAssignableUserLabel(user)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </label>

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Trimestre</span>
          <div className="relative">
            <select
              value={selectedQuarter}
              onChange={(event) => setSelectedQuarter(event.target.value)}
              className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              {quarterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </label>

        {assignableUsersQuery.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {getErrorMessage(
              assignableUsersQuery.error,
              "Não foi possível carregar os colaboradores disponíveis.",
            )}
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleGenerateQuarter}
          disabled={generateQuarterMutation.isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {generateQuarterMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Target className="h-4 w-4" />
          )}
          {generateQuarterMutation.isPending ? "Gerando..." : "Gerar score trimestral"}
        </button>
      </div>
    </aside>
  );
}
