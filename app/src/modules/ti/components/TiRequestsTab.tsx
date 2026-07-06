import { Plus, Ticket } from "lucide-react";

import { TiEmptyState, TiIconAction, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiRequestsTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Chamados"
        description="Fila de atendimento, mensagens, responsaveis e categorias de chamados de TI."
        action={<TiIconAction icon={Plus} label="Criar chamado" variant="primary" disabled />}
      />
      <TiEmptyState
        icon={Ticket}
        title="Fluxo de chamados reservado"
        description="Os hooks e services ja expõem lista, detalhe, atribuicao, status e mensagens. A implementacao funcional fica concentrada no PR de suporte."
      />
    </TiPanel>
  );
}
