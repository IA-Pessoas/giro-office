import { Bot, Plus } from "lucide-react";

import { TiEmptyState, TiIconAction, TiPanel, TiSectionHeader } from "./tiFormControls";

export function TiRobotsTab() {
  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Robos"
        description="Cadastro de robos e historico de execucoes do modulo de Tecnologia."
        action={<TiIconAction icon={Plus} label="Cadastrar robo" variant="primary" disabled />}
      />
      <TiEmptyState
        icon={Bot}
        title="Historico pronto para receber dados reais"
        description="A fundacao centraliza robos e execucoes em services proprios. O PR de dashboard e automacoes preenche a tabela e os detalhes."
      />
    </TiPanel>
  );
}
