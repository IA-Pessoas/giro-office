import { FileCheck2, Plus } from "lucide-react";

import { TiEmptyState, TiIconAction, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiTermsTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Termos"
        description="Termos de responsabilidade, assinatura e vinculo com ativos de inventario."
        action={<TiIconAction icon={Plus} label="Gerar termo" variant="primary" disabled />}
      />
      <TiEmptyState
        icon={FileCheck2}
        title="Termos preparados para o fluxo de assinatura"
        description="Os endpoints de listagem, detalhe, atualizacao e assinatura ja estao isolados no service de termos."
      />
    </TiPanel>
  );
}
