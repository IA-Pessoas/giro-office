import { Phone } from "lucide-react";

import { TiEmptyState, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiExtensionsTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Ramais"
        description="Consulte e mantenha a lista de telefones internos."
      />
      <TiEmptyState
        icon={Phone}
        title="Nenhum ramal cadastrado"
        description="Os ramais do time aparecem aqui depois do cadastro."
      />
    </TiPanel>
  );
}
