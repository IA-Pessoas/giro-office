import prismaClient from "../../prisma"
import { LogService } from '../LogService';

interface CreateRequest {
    my_id: string
    name: string
    client_id: string
    start_date: Date
    objective: string
    sponsor_id: string
}
interface UpdateRequest {
    my_id: string
    project_id: string
    name: string
    start_date: Date
    end_date: Date
    objective: string
    sponsor_id: string
}
interface DellRequest {
    project_id: string
    my_id: string
}

class ProjectService {
    async create({ 
        my_id,
        name,
        client_id,
        start_date,
        objective,
        sponsor_id,
    }: CreateRequest) {
        const exists = await prismaClient.project.findFirst({
            where:{ name, client_id }
        })
        if (exists !== null)
            throw new Error("Um objetivo com esse nome nesse cliente já foi cadastrada")

        const create = await prismaClient.project.create({
            data:{
                name,
                client_id,
                status: 'Em andamento',
                start_date,
                objective,
                sponsor_id: sponsor_id || null,
                porcentage: 0,
            },
            select:{
                id: true,
                name: true,
                client_id: true,
                status: true,
                start_date: true,
                objective: true,
                sponsor_id: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "integracao.projects",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }
    async detail(project_id: string) {
        const detail = await prismaClient.project.findFirst({
            where:{
                id: project_id
            },
            select:{
                id: true,
                name: true,
                client_id: true,
                status: true,
                start_date: true,
                end_date: true,
                objective: true,
                sponsor_id: true,
                porcentage: true,
                client: true,
                tasks: true
            }
        })
        return { detail }
    }
    async update({ 
        my_id,
        project_id,
        name,
        start_date,
        end_date,
        objective,
        sponsor_id,
    }: UpdateRequest) {
        try {
            const exists = await prismaClient.project.findFirst({
                where: { id: project_id }
            })
            if (!exists)
                throw new Error("Projeto não existe")
    
            const updated = await prismaClient.project.update({
                where:{
                    id: project_id
                },
                data:{
                    name,
                    start_date,
                    end_date,
                    objective,
                    sponsor_id: sponsor_id || null,
                },
                select:{
                    id: true,
                    name: true,
                    client_id: true,
                    status: true,
                    start_date: true,
                    end_date: true,
                    objective: true,
                    sponsor_id: true,
                    porcentage: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "integracao.projects",
                referring_id: project_id,
                oldData: exists,
                updatedData: updated,
            })
            
            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async list(ref: string, id: string) {
        if (ref === 'client') {
            const list = await prismaClient.project.findMany({
                where: { client_id: id },
                orderBy: { start_date: 'desc' }
            })
            return list
        } else if (ref === 'status') {
            const list = await prismaClient.project.findMany({
                where: { status: id },
                orderBy: { start_date: 'asc' }
            })
            return list
        } else if (ref === 'sponsor') {
            const list = await prismaClient.project.findMany({
                where :{ sponsor_id: id },
                orderBy: { start_date: 'asc' }
            })
            return list
        }
    }
    async delete({ project_id, my_id }: DellRequest) {
        const exists = await prismaClient.project.findFirst({
            where: { id: project_id }
        })
        if (!exists)
            throw new Error("Projeto não existe")

        const user = await prismaClient.user.findFirst({ where:{ id: my_id } })
        if (!user)
            throw new Error("Usuário não encontrado")
        if (user.permission !== 2) 
            throw new Error("Usuário não tem permissão")

        const response = await prismaClient.project.delete({
            where: { id: project_id }
        })
        if (!response)
            throw new Error("Erro ao deletar projeto")
        
        return { response };
    }

    async listDepTasks() {
        const deps = await prismaClient.department.findMany({
            where:{
                status: 'Ativo',
                tasksModel: {
                some: {} // verifica se tem ao menos cadastro 
            }
            },
            select:{
                id: true,
                name: true,
                color: true,
                solution: true,
                tasksModel: true
            },
            orderBy: {
                name: 'asc'
            }
        })

        return deps
    }

    async calculateAndUpdateProjectPercentage(project_id: string) {
        const exists = await prismaClient.project.findFirst({
            where: { id: project_id }
        })
        if (!exists)
            throw new Error("Projeto não existe")
        
        const relevantStatuses = [
            'Em Andamento',
            'A Realizar',
            'Em Espera',
            'Concluída',
        ]

        // Usa o `groupBy` do Prisma para contar as tarefas por status.
        const statusCounts = await prismaClient.task.groupBy({
            by: ['status'], // Agrupa os resultados pelo campo 'status'
            where: {
                project_id,
                status: {
                    in: relevantStatuses,
                },
            },
            _count: {
                status: true, // Pede a contagem para o campo 'status'
            },
        })

        if (!statusCounts || statusCounts.length === 0) {
            // Caso não hajam tarefas relevantes, a porcentagem é 0.
            await prismaClient.project.update({
                where: { id: project_id },
                data: { porcentage: 0 },
            })
            return { percentage: 0 }
        }

        // Processa os resultados para calcular o total e as concluídas.
        let totalTasks = 0
        let completedTasks = 0
        for (const group of statusCounts) {
            const count = group._count.status
            totalTasks += count

            if (group.status === 'Concluída') {
                completedTasks = count
            }
        }

        // Calcula a porcentagem (e trata a divisão por zero).
        const percentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
        // Vamos arredondar para o inteiro mais próximo.
        const roundedPercentage = Math.round(percentage * 100) / 100

        const status = (roundedPercentage === 100) ? 'Concluído' : 'Em andamento'

        const updatedProject = await prismaClient.project.update({
            where: {
                id: project_id,
            },
            data: {
                status,
                porcentage: roundedPercentage,
            },
        })

        if (roundedPercentage === 100) {
            const client = await prismaClient.client.findFirst({
                where: { id: exists.client_id }
            })
            if (!client)
                throw new Error("Cliente não existe")

            if (client.service_unique === true) {
                const updatedClient = await prismaClient.client.update({
                    where: { id: client.id },
                    data: { status: 'Inativo' },
                })
            }
        }

        return updatedProject
    }
}

export { ProjectService }