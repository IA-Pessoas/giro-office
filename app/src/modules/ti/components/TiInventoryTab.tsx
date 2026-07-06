import { Boxes } from "lucide-react";

import { TiEmptyState, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiInventoryTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Inventario"
        description="Controle ativos, categorias, locais, usuarios responsaveis e devolucoes."
      />
      <TiEmptyState
        icon={Boxes}
        title="Nenhum ativo encontrado"
        description="Os equipamentos e demais ativos de Tecnologia aparecem aqui depois do cadastro."
      />
    </TiPanel>
  );
}
