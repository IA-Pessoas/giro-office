// src/components/users/UserFilters.tsx
import React from 'react';
import { IoMdSearch, IoIosArrowForward } from 'react-icons/io';

interface UserFiltersProps {
  initialStatus: string;
  onFilterChange: (status: string) => void;
  onSearchChange: (term: string) => void;
  onOpenCreateModal: () => void;
}

export function UserFilters({ initialStatus, onFilterChange, onSearchChange, onOpenCreateModal }: UserFiltersProps) {
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

      <div className="u-flex u-gap-3 w-full">
        <select
          className="ui-input w-1/2 cursor-pointer"
          value={initialStatus}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label="Filtro de status"
        >
          <option value="Ativo">Filtro - Ativo</option>
          <option value="Inativo">Filtro - Inativo</option>
        </select>
        <button
          type="button"
          onClick={onOpenCreateModal}
          className="ui-button-primary w-1/2"
          aria-label="Cadastrar usuário"
        >
          Cadastrar <IoIosArrowForward />
        </button>
      </div>
    </div>
  );
}