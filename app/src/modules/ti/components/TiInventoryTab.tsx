import { Boxes, Plus } from "lucide-react";

import { TiEmptyState, TiIconAction, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiInventoryTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Inventario"
        description="Ativos, categorias, locais, atribuicao de usuarios e devolucoes."
        action={<TiIconAction icon={Plus} label="Novo ativo" variant="primary" disabled />}
      />
      <TiEmptyState
        icon={Boxes}
        title="Inventario sem mock principal"
        description="A pagina ja tem a estrutura para listar ativos e seus relacionamentos. O PR de ativos conecta filtros, formularios e acoes."
      />
    </TiPanel>
  );
}
