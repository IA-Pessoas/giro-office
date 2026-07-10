import { Bot } from "lucide-react";

import { TiEmptyState, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiRobotsTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Robôs"
        description="Acompanhe automações, rotinas agendadas e histórico de execução."
      />
      <TiEmptyState
        icon={Bot}
        title="Nenhum robô cadastrado"
        description="As automações do time de Tecnologia aparecem aqui com seus últimos resultados."
      />
    </TiPanel>
  );
}
