import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import { setupAPIClient } from '@shared/services/api';

interface ClientItem {
    id: string;
    name: string;
    company_name: string;
    fantasy_name: string;
    cnpj: string;
    status: string;
}

interface Filters {
    status: string;
    ref: string;
    search: string;
}

export const useClientList = (initialFilters: Filters) => {
    const [clients, setClients] = useState<ClientItem[]>([]);
    const [filters, setFilters] = useState<Filters>(initialFilters);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const loaderRef = useRef<HTMLDivElement>(null);
    const apiClient = setupAPIClient();

    const fetchClients = useCallback(async (currentPage: number, shouldReset: boolean = false) => {
        if (isLoading) return;
        setIsLoading(true);

        try {
            const response = await apiClient.get('/clients', {
                params: {
                    ...filters,
                    page: currentPage,
                    limit: 10 // Ou o limite que preferir
                }
            });

            const { data, hasMore: newHasMore } = response.data;
            
            setClients(prev => shouldReset ? data : [...prev, ...data]);
            setHasMore(newHasMore);
            setPage(currentPage);
        } catch (error) {
            toast.error('Erro ao buscar clientes.');
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [apiClient, filters, isLoading]);

    // Efeito para refazer a busca quando os filtros mudam
    useEffect(() => {
        // Debounce para o campo de busca (evita uma requisição a cada tecla digitada)
        const timer = setTimeout(() => {
            fetchClients(1, true);
        }, 500); // Aguarda 500ms após o usuário parar de digitar

        return () => clearTimeout(timer);
    }, [filters.search, filters.status]); // Adicione outros filtros se necessário

    // Efeito para o scroll infinito
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isLoading) {
                    fetchClients(page + 1);
                }
            },
            { threshold: 0.1 }
        );

        const currentLoaderRef = loaderRef.current;
        if (currentLoaderRef) {
            observer.observe(currentLoaderRef);
        }

        return () => {
            if (currentLoaderRef) {
                observer.unobserve(currentLoaderRef);
            }
        };
    }, [hasMore, isLoading, page, fetchClients]);

    const handleFilterChange = <K extends keyof Filters>(key: K, value: Filters[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const refreshList = () => {
        fetchClients(1, true);
    }

    return {
        clients,
        isLoading,
        hasMore,
        loaderRef,
        filters,
        handleFilterChange,
        refreshList
    };
};