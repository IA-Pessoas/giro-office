import React from 'react';
import { IoMdSearch, IoIosArrowForward } from 'react-icons/io';
import styles from './DepFilters.module.css';

interface UserFiltersProps {
  initialStatus: string;
  onFilterChange: (status: string) => void;
  onSearchChange: (term: string) => void;
  onOpenCreateModal: () => void;
}

export function DepFilters({ initialStatus, onFilterChange, onSearchChange, onOpenCreateModal }: UserFiltersProps) {
  return (
    <div className={styles.container}>
      <div className={styles.searchWrap}>
        <IoMdSearch className={styles.searchIcon} />
        <input
          type="text"
          className={styles.searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder='Buscar por nome...'
        />
      </div>
      
      <div className={styles.row}>
        <select
          className={styles.select}
          value={initialStatus}
          onChange={(e) => onFilterChange(e.target.value)}
        >
          <option value="Ativo">Filtro - Ativo</option>
          <option value="Inativo">Filtro - Inativo</option>
        </select>
        <button className={styles.createButton} onClick={onOpenCreateModal}>
          Cadastrar
        </button>
      </div>
    </div>
  );
}