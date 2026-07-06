import { PackageSearch } from "lucide-react";

import { TiEmptyState, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiStockTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Estoque"
        description="Controle itens, entradas, saidas, categorias, locais e niveis minimos."
      />
      <TiEmptyState
        icon={PackageSearch}
        title="Nenhum item em estoque"
        description="Itens consumiveis e movimentacoes de Tecnologia aparecem aqui quando cadastrados."
      />
    </TiPanel>
  );
}
