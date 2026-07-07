import React from 'react';
import { OrganizationProfile } from './OrganizationProfile';

interface OrganizationDetailsViewProps {
  organizationId: string | null;
}

export function OrganizationDetailsView({ organizationId }: OrganizationDetailsViewProps) {
  if (!organizationId) {
    return (
      <div className="u-flex h-[90vh] w-full items-center justify-center">
        <p className="text-lg text-[var(--colors-blue-500)]">
          Selecione uma organização na lista para ver os detalhes.
        </p>
      </div>
    );
  }

  return (
    <section className="users-detail-panel relative ml-2 h-[90vh] w-full overflow-y-auto">
      <OrganizationProfile key={organizationId} organizationId={organizationId} />
    </section>
  );
}
