// src/components/Clients/ClientDetails.tsx
import React from 'react';
import { ClientProfile } from './ClientProfile'; // Importe o novo componente

interface DetailsViewProps {
  clientId: string | null;
}

export function ClientDetailsView({ clientId }: DetailsViewProps) {
  if (!clientId) {
    return (
      <div className="u-flex h-[95vh] w-full items-center justify-center">
        <p className="text-lg text-[var(--colors-blue-500)]">Selecione um cliente na lista para ver os detalhes.</p>
      </div>
    );
  }

  return (
    <section className="users-detail-panel relative ml-2 h-[95vh] w-full overflow-y-auto">
      {/* Renderização nativa com Key para forçar remontagem ao trocar de cliente */}
      <ClientProfile key={clientId} clientId={clientId} />
    </section>
  );
}