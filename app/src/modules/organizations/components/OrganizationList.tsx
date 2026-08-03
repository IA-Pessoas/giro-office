import React from 'react';
import type { OrganizationItem } from '../types';

interface OrganizationListProps {
  organizations: OrganizationItem[];
  onOrganizationSelect: (orgId: string) => void;
}

export function OrganizationList({ organizations, onOrganizationSelect }: OrganizationListProps) {
  return (
    <div className="h-[170px] w-full overflow-x-auto u-scrollbar-system overflow-y-hidden bg-white p-2 md:h-full md:overflow-x-hidden md:overflow-y-auto">
      <div className="u-sidebar-card-list">
        {organizations.length > 0 ? (
          organizations.map((org) => (
            <article
              key={org.id}
              className="mr-3 mb-0 w-[200px] min-w-[200px] cursor-pointer rounded-md bg-white shadow-sm transition-transform hover:scale-[1.01] md:mr-0 md:mb-2 md:w-full md:min-w-0"
              style={{ borderLeft: `5px solid ${org.status === 'active' ? '#10B981' : org.status === 'trial' ? '#F59E0B' : '#EF4444'}` }}
              onClick={() => onOrganizationSelect(org.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOrganizationSelect(org.id);
                }
              }}
            >
              <div className="p-4">
                <p className="truncate text-md font-bold">{org.name}</p>
                <p className="text-sm text-slate-500">{org.slug}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {org.status} • {org.subscription_plan}
                </p>
              </div>
            </article>
          ))
        ) : (
          <p className="mt-4 w-full text-center text-slate-500">
            Nenhuma organização encontrada.
          </p>
        )}
      </div>
    </div>
  );
}
