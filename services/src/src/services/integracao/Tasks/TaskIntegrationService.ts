import prismaClient from "../../../prisma";
import { LogService } from "../../LogService";

interface CreateLinkRequest {
    my_id: string;
    task_model_id: string;
    referring: 'processo' | 'alvara'; // Limitamos as strings para padronizar
    referring_type: string; // Ex: "Abertura", "Renovação", "Alteração"
}

class TaskIntegrationService {

    // 1. Criar o Vínculo
    async createLink({ my_id, task_model_id, referring, referring_type }: CreateLinkRequest) {
        
        // Verifica se o TaskModel existe
        const taskModel = await prismaClient.taskModel.findUnique({
            where: { id: task_model_id },
            select: { name: true }
        });

        if (!taskModel) {
            throw new Error("Modelo de Tarefa não encontrado.");
        }

        // Verifica se já existe essa configuração para evitar duplicidade
        // Ex: Já existe um vínculo de "Abertura" com este "TaskModel"
        const alreadyExists = await prismaClient.tasksIntegrationRegularize.findFirst({
            where: {
                task_model_id,
                referring,
                referring_type
            }
        });

        if (alreadyExists) {
            throw new Error("Este tipo de serviço já está vinculado a este modelo de tarefa.");
        }

        const integration = await prismaClient.tasksIntegrationRegularize.create({
            data: {
                task_model_id,
                referring,
                referring_type
            }
        });

        // Log
        const ls = new LogService();
        await ls.createLog({
            my_id,
            action: "Vincular Tarefa",
            referring: "integracao.tasks",
            referring_id: integration.id,
            changes: `Vinculou ${referring} - ${referring_type} ao modelo ${taskModel.name}`,
            dep: "configuracoes"
        });

        return integration;
    }

    // 2. Remover o Vínculo
    async removeLink(my_id: string, integration_id: string) {
        const exists = await prismaClient.tasksIntegrationRegularize.findUnique({
            where: { id: integration_id }
        });

        if (!exists) {
            throw new Error("Vínculo não encontrado.");
        }

        await prismaClient.tasksIntegrationRegularize.delete({
            where: { id: integration_id }
        });

        // Log
        const ls = new LogService();
        await ls.createLog({
            my_id,
            action: "Desvincular Tarefa",
            referring: "integracao.tasks",
            referring_id: integration_id,
            changes: "{}",
            dep: "configuracoes"
        });

        return { message: "Vínculo removido com sucesso." };
    }

    // 3. Listar Configurações (Geral ou por TaskModel)
    async list(task_model_id?: string) {
        // Se passar o ID do modelo, filtra. Se não, traz tudo.
        const where = task_model_id ? { task_model_id } : {};

        const list = await prismaClient.tasksIntegrationRegularize.findMany({
            where,
            include: {
                task_model: {
                    select: { name: true } // Traz o nome da tarefa para facilitar a leitura
                }
            },
            orderBy: {
                referring: 'asc'
            }
        });

        return list;
    }

    // 4. (Bônus) Buscar TaskModel pelo Tipo (Para usar na automação futura)
    // Ex: "Quais tarefas devo criar para um Processo de Abertura?"
    async findTaskModelByContext(referring: string, referring_type: string) {
        const configs = await prismaClient.tasksIntegrationRegularize.findMany({
            where: {
                referring,
                referring_type
            },
            include: {
                task_model: true // Traz o modelo completo para você poder clonar/criar a tarefa
            }
        });
        return configs;
    }
}

export { TaskIntegrationService };