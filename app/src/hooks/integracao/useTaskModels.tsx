import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { setupAPIClient } from '@shared/services/api';

export interface TaskModel {
    id: string
    name: string
    department_id: string
    responsible_id: string
    responsible2_id: string
    responsible3_id: string
    observations: string
    billing: string
    prevision: number
    type: "Projeto"
    department: {
        id: string
        name: string
    }
}

export const useTaskModels = () => {
    const [models, setModels] = useState<TaskModel[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const apiClient = setupAPIClient();

    const fetchModels = useCallback(async () => {
        setIsLoading(true);
        try {
            // Ajuste a rota conforme seu backend
            const response = await apiClient.get('/integracao-tasksModel');
            setModels(response.data);
        } catch (error) {
            console.error(error);
            toast.error("Erro ao buscar modelos."); // Opcional
        } finally {
            setIsLoading(false);
        }
    }, []);

    const createModel = async (data: Omit<TaskModel, 'id'>) => {
        try {
            await apiClient.post('/integracao-tasksModel', data);
            toast.success("Modelo criado com sucesso!");
            fetchModels();
            return true;
        } catch (error) {
            toast.error("Erro ao criar modelo.");
            return false;
        }
    };

    const updateModel = async (data: TaskModel) => {
        try {
            await apiClient.put('/integracao-tasksModel', data);
            toast.success("Modelo atualizado!");
            fetchModels();
            return true;
        } catch (error) {
            toast.error("Erro ao atualizar.");
            return false;
        }
    };

    const deleteModel = async (id: string) => {
        try {
            await apiClient.delete('/integracao-taskModel', { data: { task_id: id } });
            toast.success("Removido!");
            fetchModels();
            return true;
        } catch (error) {
            toast.error("Erro ao remover.");
            return false;
        }
    };

    useEffect(() => { fetchModels(); }, [fetchModels]);

    return { models, isLoading, createModel, updateModel, deleteModel, refresh: fetchModels };
};