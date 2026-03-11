import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { integracaoService } from '../services/integracaoService';
import type { TaskModel, CreateTaskModelData, UpdateTaskModelData } from '../types';

export const useTaskModels = () => {
    const [models, setModels] = useState<TaskModel[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchModels = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await integracaoService.taskModels.list();
            setModels(data);
        } catch (error) {
            console.error(error);
            toast.error("Erro ao buscar modelos.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    const createModel = async (data: CreateTaskModelData) => {
        try {
            await integracaoService.taskModels.create(data);
            toast.success("Modelo criado com sucesso!");
            fetchModels();
            return true;
        } catch (error) {
            toast.error("Erro ao criar modelo.");
            return false;
        }
    };

    const updateModel = async (data: UpdateTaskModelData) => {
        try {
            await integracaoService.taskModels.update(data);
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
            await integracaoService.taskModels.delete(id);
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

export type { TaskModel } from '../types';