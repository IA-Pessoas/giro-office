import React from 'react';
import { IoMdSearch, IoIosArrowForward } from 'react-icons/io';

interface OrganizationFiltersProps {
  initialStatus: string;
  onFilterChange: (status: string) => void;
  onSearchChange: (term: string) => void;
  onOpenCreateModal: () => void;
}

export function OrganizationFilters({ 
  initialStatus, 
  onFilterChange, 
  onSearchChange, 
  onOpenCreateModal 
}: OrganizationFiltersProps) {
  return (
    <div className="u-stack u-gap-3 w-full p-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--colors-blue-500)]">
          <IoMdSearch />
        </span>
        <input
          type="text"
          className="ui-input pl-9"
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por nome..."
        />
      </div>

      <div className="u-flex w-full gap-3">
        <label className="u-stack w-1/2 u-gap-1">
          <span className="text-xs text-slate-500">Filtro - {initialStatus}</span>
          <select
            className="ui-input"
            value={initialStatus}
            onChange={(e) => onFilterChange(e.target.value)}
            aria-label="Filtro de organizações"
          >
            <option value="active">Ativos</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspensos</option>
            <option value="cancelled">Cancelados</option>
          </select>
        </label>
        <button type="button" onClick={onOpenCreateModal} className="ui-button-primary w-1/2">
          Cadastrar <IoIosArrowForward />
        </button>
      </div>
    </div>
  );
}
