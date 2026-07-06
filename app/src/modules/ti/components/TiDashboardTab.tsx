import { BarChart3, Plus } from "lucide-react";

import { TiEmptyState, TiIconAction, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiDashboardTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Resumo de Tecnologia"
        description="Visao consolidada preparada para consumir o endpoint /ti/dashboard."
        action={<TiIconAction icon={Plus} label="Novo chamado" variant="primary" disabled />}
      />
      <TiEmptyState
        icon={BarChart3}
        title="Indicadores prontos para conexao"
        description="A fundacao deixa o dashboard sem dados artificiais. O PR de robos e dashboard liga os cards, filas e alertas ao retorno real do backend."
      />
    </TiPanel>
  );
}
