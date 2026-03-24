import React from 'react';

import type { ClientItem } from '../types';
import { formatCPF_CNPJ } from '@shared/utils/formatters';

interface ListProps {
  clients: ClientItem[];
  onSelect: (clientId: string) => void;
}

export function ClientList({ clients, onSelect }: ListProps) {
  const [isDesktop, setIsDesktop] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return (
    <section className={`w-full overflow-y-auto bg-white ${isDesktop ? 'h-full p-0' : 'h-[calc(100vh-220px)] p-2'}`}>
      {isDesktop && (
        <header className="sticky top-0 grid w-full grid-cols-[1fr_4fr_3fr_2fr] gap-4 border-b-2 border-[var(--colors-blue-500)] bg-white px-4 py-2">
          <p className="font-bold text-[var(--colors-blue-500)]">Código</p>
          <p className="font-bold text-[var(--colors-blue-500)]">Razão Social</p>
          <p className="font-bold text-[var(--colors-blue-500)]">Nome Fantasia</p>
          <p className="font-bold text-[var(--colors-blue-500)]">CPF / CNPJ</p>
        </header>
      )}

      {clients.length > 0 ? (
        <div className={isDesktop ? 'p-2' : ''}>
          {clients.map((client) => (
            isDesktop ? (
              <article
                key={client.id}
                className="grid w-full cursor-pointer grid-cols-[1fr_4fr_3fr_2fr] items-center gap-4 rounded-md border-b border-slate-200 px-4 py-3 transition-colors hover:bg-slate-50"
                onClick={() => onSelect(client.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(client.id);
                  }
                }}
              >
                <p className="text-sm text-slate-500">{client.dominio_code}</p>
                <p className="truncate text-md">{client.company_name}</p>
                <p className="truncate text-md">{client.fantasy_name}</p>
                <p className="text-sm text-slate-500">{formatCPF_CNPJ(client.cpf_cnpj)}</p>
              </article>
            ) : (
              <article
                key={client.id}
                className="mb-2 w-full cursor-pointer rounded-md bg-white"
                style={{ borderLeft: `4px solid ${client.status.toLowerCase() === 'ativo' ? '#4ade80' : '#facc15'}` }}
                onClick={() => onSelect(client.id)}
              >
                <div className="p-3">
                  <div className="u-flex u-justify-between u-items-center">
                    <p className="max-w-[70%] truncate text-md font-bold">{client.name}</p>
                    <p className="text-xs text-slate-500">{client.dominio_code}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{formatCPF_CNPJ(client.cpf_cnpj)}</p>
                </div>
              </article>
            )
          ))}
        </div>
      ) : (
        <p className="mt-4 w-full text-center text-slate-500">
          Nenhum cliente encontrado.
        </p>
      )}
    </section>
  );
}