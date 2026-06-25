import React, { useCallback, useEffect, useRef, useState } from "react";
import Loader from '../../shared/components/Loader';
import styles from './Details.module.css';

interface DetailsViewProps {
  id: string | null;
  link: string;
}

export function DetailsView({ id, link }: DetailsViewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoadingTimer = useCallback(() => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearLoadingTimer();

    if (id) {
      setIsLoading(true);
    } else {
      setIsLoading(false);
    }
  }, [clearLoadingTimer, id, link]);

  useEffect(() => {
    return () => {
      clearLoadingTimer();
    };
  }, [clearLoadingTimer]);

  const handleIframeLoad = () => {
    clearLoadingTimer();

    loadingTimerRef.current = setTimeout(() => {
      setIsLoading(false);
      loadingTimerRef.current = null;
    }, 300);
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
        key={iframeSrc}
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
