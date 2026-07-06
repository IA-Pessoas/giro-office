import { Phone, Plus } from "lucide-react";

import { TiEmptyState, TiIconAction, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiExtensionsTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Ramais"
        description="Cadastro e manutencao dos ramais de Tecnologia."
        action={<TiIconAction icon={Plus} label="Novo ramal" variant="primary" disabled />}
      />
      <TiEmptyState
        icon={Phone}
        title="Ramais prontos para cadastro real"
        description="A base deixa o contrato e a aba preparados para a tela funcional sem adicionar registros artificiais."
      />
    </TiPanel>
  );
}
