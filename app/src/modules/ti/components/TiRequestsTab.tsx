import { Ticket } from "lucide-react";

import { TiEmptyState, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiRequestsTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Chamados"
        description="Gerencie solicitacoes, responsaveis, status e conversas do atendimento."
      />
      <TiEmptyState
        icon={Ticket}
        title="Nenhum chamado encontrado"
        description="A fila de atendimento aparece aqui assim que houver chamados registrados."
      />
    </TiPanel>
  );
}
