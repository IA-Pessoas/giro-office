import React from 'react';

export const LoadingSpinner = () => {
  return (
    <div className="u-flex items-center justify-center p-10">
      <span
        className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-[var(--colors-main-mainDourado)] border-t-[var(--colors-main-main)]"
        aria-label="Carregando"
      />
    </div>
  );
};