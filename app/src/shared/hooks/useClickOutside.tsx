import { useEffect, useRef } from 'react';

export const useClickOutside = (callback: () => void) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                callback();
            }
        };

        // Adiciona o listener quando o componente monta
        document.addEventListener('mousedown', handleClickOutside);

        // Remove o listener quando o componente desmonta (limpeza)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [callback]);

    return ref;
};