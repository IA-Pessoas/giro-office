import React from 'react';
import { UserProfile } from './UserProfile'; // Importe o componente que criamos

interface UserDetailsViewProps {
  userId: string | null;
  me: any;        // Adicionado
  departments: any[]; // Adicionado
}

export function UserDetailsView({ userId, me, departments }: UserDetailsViewProps) {
  
  if (!userId) {
    return (
      <div className="u-flex h-[90vh] w-full items-center justify-center">
        <div className="u-stack items-center" aria-live="polite">
          <p className="text-lg text-[var(--colors-blue-500)]">Selecione um usuário na lista para ver os detalhes.</p>
        </div>
      </div>
    );
  }

  return (
    <section className="users-detail-panel relative ml-2 h-[90vh] w-full overflow-y-auto">
      {/* Renderização Nativa em vez de Iframe */}
      <UserProfile 
        key={userId} // A key força o componente a recarregar quando muda o ID
        userId={userId} 
        me={me}
        departments={departments}
      />
    </section>
  );
}