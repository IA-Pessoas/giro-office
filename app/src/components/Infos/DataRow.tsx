import React from 'react';
import styles from './DataRow.module.css';

interface DataRowProps {
  label: string;
  children: React.ReactNode;
}

export const DataRow = ({ label, children }: DataRowProps) => {
  return (
    <div className={styles.row}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{children}</div>
    </div>
  );
};