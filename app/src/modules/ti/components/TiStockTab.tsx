import { PackageSearch } from "lucide-react";

import { TiEmptyState, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiStockTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Estoque"
        description="Controle itens, entradas, saídas, categorias, locais e níveis mínimos."
      />
      <TiEmptyState
        icon={PackageSearch}
        title="Nenhum item em estoque"
        description="Itens consumíveis e movimentações de Tecnologia aparecem aqui quando cadastrados."
      />
    </TiPanel>
  );
}
