// src/components/departments/DepDetailsView.tsx
import React from 'react';
import { DepartmentProfile } from './DepartmentProfile'; // Importe o novo componente
import styles from './DepDetailsView.module.css';

interface DetailsViewProps {
  depId: string | null;
}

export function DepDetailsView({ depId }: DetailsViewProps) {
  if (!depId) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyText}>Selecione um departamento na lista para ver os detalhes.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Renderização nativa */}
      <DepartmentProfile key={depId} depId={depId} />
    </div>
  );
}