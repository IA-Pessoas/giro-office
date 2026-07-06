import { KeyRound, Plus } from "lucide-react";

import { TiEmptyState, TiIconAction, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiPasswordsTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Senhas"
        description="Cofre operacional de credenciais administradas pelo time de Tecnologia."
        action={<TiIconAction icon={Plus} label="Nova senha" variant="primary" disabled />}
      />
      <TiEmptyState
        icon={KeyRound}
        title="Acesso a senhas preparado"
        description="O service cobre lista, detalhe, criacao e atualizacao. O PR de estoque e acessos define a experiencia de permissao e edicao."
      />
    </TiPanel>
  );
}
