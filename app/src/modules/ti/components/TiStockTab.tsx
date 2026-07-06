import { PackageSearch, Plus } from "lucide-react";

import { TiEmptyState, TiIconAction, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiStockTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Estoque"
        description="Itens de estoque filtrados pelo departamento Tecnologia, entradas, saidas, categorias e locais."
        action={<TiIconAction icon={Plus} label="Novo item" variant="primary" disabled />}
      />
      <TiEmptyState
        icon={PackageSearch}
        title="Estoque reservado para conexao"
        description="A fundacao separa itens, movimentacoes, categorias e locais para reduzir conflito entre os PRs."
      />
    </TiPanel>
  );
}
