import React from 'react';
import styles from './DepList.module.css';

import type { DepItem } from '../types';

interface ListProps {
  deps: DepItem[];
  onDepSelect: (depId: string) => void;
}

export function DepList({ deps, onDepSelect }: ListProps) {
  return (
    <div className={styles.container}>
      <div className={styles.list}>
        {deps.length > 0 ? (
          deps.map((dep) => (
            <button
              key={dep.id}
              onClick={() => onDepSelect(dep.id)}
              className={styles.card}
              style={{ borderLeft: `5px solid ${dep.color || '#ccc'}` }}
            >
              <div className={styles.cardBody}>
                <p className={styles.name}>{dep.name}</p>
                <p className={styles.color}>{dep.color}</p>
              </div>
            </button>
          ))
        ) : (
          <p className={styles.empty}>
            Nenhum departamento encontrado.
          </p>
        )}
      </div>
    </div>
  );
}