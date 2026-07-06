import { BarChart3 } from "lucide-react";

import { TiEmptyState, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiDashboardTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Resumo de Tecnologia"
        description="Acompanhe chamados, ativos, estoque critico e execucoes recentes."
      />
      <TiEmptyState
        icon={BarChart3}
        title="Nenhum indicador carregado"
        description="Quando houver dados de Tecnologia, os principais sinais operacionais aparecem aqui."
      />
    </TiPanel>
  );
}
