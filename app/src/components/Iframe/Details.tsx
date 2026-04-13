import React, { useState, useEffect } from 'react';
import Loader from '../../shared/components/Loader';
import styles from './Details.module.css';

interface DetailsViewProps {
  id: string | null;
  link: string;
}

export function DetailsView({ id, link }: DetailsViewProps) {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (id) {
      setIsLoading(true);
    }
  }, [id]);

  const handleIframeLoad = () => {
    setTimeout(() => setIsLoading(false), 300);
  };

  if (!id) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyText}>Selecione para ver os detalhes...</p>
      </div>
    );
  }

  const iframeSrc = `/${link}/${id}?view=iframe`;

  return (
    <div className={styles.wrapper}>
      {isLoading && <Loader />}

      <iframe
        key={id}
        src={iframeSrc}
        width="100%"
        height="100%"
        style={{
          border: 'none',
          borderRadius: '8px',
          display: isLoading ? 'none' : 'block',
        }}
        onLoad={handleIframeLoad}
      />
    </div>
  );
}
