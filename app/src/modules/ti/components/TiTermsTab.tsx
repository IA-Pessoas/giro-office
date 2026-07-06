import { FileCheck2 } from "lucide-react";

import { TiEmptyState, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiTermsTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Termos"
        description="Acompanhe termos de responsabilidade, assinatura e vinculo com ativos."
      />
      <TiEmptyState
        icon={FileCheck2}
        title="Nenhum termo gerado"
        description="Os termos assinados ou pendentes ficam disponiveis nesta area."
      />
    </TiPanel>
  );
}
