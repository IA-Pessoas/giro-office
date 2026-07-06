import { Bot } from "lucide-react";

import { TiEmptyState, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiRobotsTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Robos"
        description="Acompanhe automacoes, rotinas agendadas e historico de execucao."
      />
      <TiEmptyState
        icon={Bot}
        title="Nenhum robo cadastrado"
        description="As automacoes do time de Tecnologia aparecem aqui com seus ultimos resultados."
      />
    </TiPanel>
  );
}
