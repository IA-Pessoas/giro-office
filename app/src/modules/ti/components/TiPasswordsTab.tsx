import { KeyRound } from "lucide-react";

import { TiEmptyState, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiPasswordsTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Senhas"
        description="Organize credenciais administradas pelo time de Tecnologia."
      />
      <TiEmptyState
        icon={KeyRound}
        title="Nenhuma senha cadastrada"
        description="As credenciais autorizadas para seu perfil aparecem nesta area."
      />
    </TiPanel>
  );
}
