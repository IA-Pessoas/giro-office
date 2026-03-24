import React from 'react';
import { IoMdSearch, IoIosArrowForward } from 'react-icons/io';
import { CiCirclePlus } from "react-icons/ci";

import type { Perms } from '../types';

interface FiltersProps {
  initialLabel: string;
  perm: Perms;
  onFilterChange: (filters: { status: string; ref?: string; label?: string }) => void;
  onSearchChange: (term: string) => void;
  onOpenCreateModal: () => void;
}

export function ClientFilters({ initialLabel, perm, onFilterChange, onSearchChange, onOpenCreateModal }: FiltersProps) {
  const isIntegracaoAdmin = perm.integracao === 2;
  const hasDeptFilters = perm.contabil !== null || perm.fiscal !== null || perm.pessoal !== null;

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
        <details className="w-[90%] rounded-md border border-slate-200 bg-white">
          <summary className="u-flex cursor-pointer list-none items-center justify-between px-4 py-2 font-medium text-slate-700">
            <span className="truncate">Filtro: {initialLabel}</span>
            <IoIosArrowForward />
          </summary>
          <div className="max-h-[50vh] overflow-y-auto border-t border-slate-100 p-2">
            <p className="users-section-title px-2 py-1">Status</p>
            <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--colors-blue-500)] hover:text-[var(--colors-main-mainDourado)]" onClick={() => onFilterChange({ status: 'Ativo', label: 'Ativo' })}>Ativos</button>
            <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--colors-blue-500)] hover:text-[var(--colors-main-mainDourado)]" onClick={() => onFilterChange({ status: 'Inativo', label: 'Inativo' })}>Inativos</button>

            {isIntegracaoAdmin && (
              <>
                <hr className="my-2" />
                <p className="users-section-title px-2 py-1">Integração</p>
                <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--colors-blue-500)] hover:text-[var(--colors-main-mainDourado)]" onClick={() => onFilterChange({ status: 'Ativo e Prospecção', label: 'Ativos e em Prospecção' })}>Ativos e em Prospecçãos</button>
                <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--colors-blue-500)] hover:text-[var(--colors-main-mainDourado)]" onClick={() => onFilterChange({ status: 'Ativo PJ', label: 'Ativo PJ' })}>Ativos PJ</button>
                <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--colors-blue-500)] hover:text-[var(--colors-main-mainDourado)]" onClick={() => onFilterChange({ status: 'Ativo PF', label: 'Ativo PF' })}>Ativos PF</button>
                <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--colors-blue-500)] hover:text-[var(--colors-main-mainDourado)]" onClick={() => onFilterChange({ status: 'Prospecção PJ', label: 'Prospecção PJ' })}>Prospecção PJ</button>
                <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--colors-blue-500)] hover:text-[var(--colors-main-mainDourado)]" onClick={() => onFilterChange({ status: 'Prospecção PF', label: 'Prospecção PF' })}>Prospecção PF</button>
                <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--colors-blue-500)] hover:text-[var(--colors-main-mainDourado)]" onClick={() => onFilterChange({ status: 'Não Contradado e Paralisado', label: 'Não Contratados e Paralisados' })}>Não Contratados e Paralisados</button>
                <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--colors-blue-500)] hover:text-[var(--colors-main-mainDourado)]" onClick={() => onFilterChange({ status: 'Inativo PJ', label: 'Inativo PJ' })}>Inativo PJ</button>
                <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--colors-blue-500)] hover:text-[var(--colors-main-mainDourado)]" onClick={() => onFilterChange({ status: 'Inativo PF', label: 'Inativo PF' })}>Inativo PF</button>
              </>
            )}

            {hasDeptFilters && (
              <>
                <hr className="my-2" />
                <p className="users-section-title px-2 py-1">Clientes por Departamento</p>
                {perm.contabil !== null && (
                  <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--colors-blue-500)] hover:text-[var(--colors-main-mainDourado)]" onClick={() => onFilterChange({ status: 'Ativo', label: 'Dep Contábil' })}>Dep Contábil</button>
                )}
                {perm.fiscal !== null && (
                  <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--colors-blue-500)] hover:text-[var(--colors-main-mainDourado)]" onClick={() => onFilterChange({ status: 'Ativo', label: 'Dep Fiscal' })}>Dep Fiscal</button>
                )}
                {perm.pessoal !== null && (
                  <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--colors-blue-500)] hover:text-[var(--colors-main-mainDourado)]" onClick={() => onFilterChange({ status: 'Ativo', label: 'Dep Pessoal' })}>Dep Pessoal</button>
                )}
              </>
            )}
          </div>
        </details>
        <button
          type="button"
          className="u-flex w-[5%] items-center justify-center rounded-md border border-slate-200 hover:bg-[var(--colors-blue-500)] hover:text-[var(--colors-main-mainDourado)]"
          onClick={onOpenCreateModal}
          aria-label="Novo Cliente"
        >
          <CiCirclePlus size={30} />
        </button>
      </div>
    </div>
  );
}