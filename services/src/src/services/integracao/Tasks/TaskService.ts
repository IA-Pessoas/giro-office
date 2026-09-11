import prismaClient from "../../../prisma"
import { LogService } from '../../LogService';
import { EmailService } from "../../EmailService";
import { ProjectService } from "../ProjectService";

interface CreateModelRequest {
    my_id: string
    name: string
    department_id: string
    responsible_id: string
    responsible2_id: string
    responsible3_id: string
    observations: string
    /**
    * @description Tipo de cobrança, define se é tarefa ou produto
    * @example "Não Realizar" ou "Realizar"
    * @default "Não Realizar"
    */
    billing: string
    prevision: number
    /**
     * @description Tipo de tarefa, define se é tarefa de projeto ou de distrato
     * @example "Projeto" ou "Distrato"
     */
    type: string
}
interface addDependentRequest {
    my_id: string
    task_id: string
    dependent_id: string
    wait: boolean
    observation: string
}
interface UpdateModelRequest {
    my_id: string
    task_id: string
    name: string
    department_id: string
    responsible_id: string
    responsible2_id: string
    responsible3_id: string
    observations: string
    billing: string
    prevision: number
    type: string
}
interface UpdateModelRequest {
    my_id: string
    task_id: string
    name: string
    department_id: string
    responsible_id: string
    responsible2_id: string
    responsible3_id: string
    observations: string
    billing: string
    prevision: number
    type: string
}
interface CreateRequest {
    my_id: string
    model_id: string
    project_id: string
    client_id: string
    prospecting_status: string
    observations: string
    urgency: string
}
interface UpdateRequest {
    my_id: string
    task_id: string
    name: string
    /**
     * @example "Em Andamento", "Paralisado", "Concluída", 
     * "Não Contratado", "A Realizar", "Em Espera", "Pendente",
     * "PEC" e "APEC"
     */
    status: string
    department_id: string
    observations: string
    billing: string
    urgency: string
    responsible_id: string
    responsible2_id: string
    responsible3_id: string
    prevision_date: Date
}
interface DellRequest {
    task_id: string
    my_id: string
}
interface CreateDependentRequest {
    my_id: string
    model_id: string
    status: string
    project_id: string
    client_id: string
    observations: string
}

interface UpdateChargeFinanceiroRequest {
    my_id: string
    task_id: string
}

interface ConclusionRequest {
    my_id: string
    task_id: string
    /**
     * @example "Em Andamento", "Paralisado", "Concluída"
     */
    status: string
    prevision_date: Date
    end_date: Date
    responsible_id: string
    responsible2_id: string
    responsible3_id: string
    observations: string
    justification: string
}

class TaskService {
    // Modelo
    async createModel({ 
        my_id,
        name,
        department_id,
        responsible_id,
        responsible2_id,
        responsible3_id,
        observations,
        billing,
        prevision,
        type,
    }: CreateModelRequest) {
        const exists = await prismaClient.taskModel.findFirst({
            where:{ name, department_id }
        })
        if (exists)
            throw new Error("Tarefa com esse nome nesse departamento já foi cadastrada")

        const create = await prismaClient.taskModel.create({
            data:{
                name,
                department_id,
                responsible_id,
                responsible2_id: responsible2_id || null,
                responsible3_id: responsible3_id || null,
                observations,
                billing,
                prevision,
                type,
            },
            select:{
                id: true,
                name: true,
                department_id: true,
                responsible_id: true,
                responsible2_id: true,
                responsible3_id: true,
                observations: true,
                billing: true,
                prevision: true,
                type: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "integracao.tasksModel",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }
    async detailModel(task_id: string) {
        const detail = await prismaClient.taskModel.findFirst({
            where:{
                id: task_id
            },
            select:{
                id: true,
                name: true,
                department_id: true,
                responsible_id: true,
                responsible2_id: true,
                responsible3_id: true,
                observations: true,
                billing: true,
                prevision: true,
                type: true,
            }
        })
        return { detail }
    }
    async updateModel({ 
        my_id,
        task_id,
        name,
        department_id,
        responsible_id,
        responsible2_id,
        responsible3_id,
        observations,
        billing,
        prevision,
        type,
    }: UpdateModelRequest) {
        try {
            const exists = await prismaClient.taskModel.findFirst({
                where: { id: task_id }
            })
            if (!exists)
                throw new Error("Tarefa não existe")
    
            const updated = await prismaClient.taskModel.update({
                where:{
                    id: task_id
                },
                data:{
                    name,
                    department_id,
                    responsible_id,
                    responsible2_id: responsible2_id || null,
                    responsible3_id: responsible3_id || null,
                    observations,
                    billing,
                    prevision,
                    type,
                },
                select:{
                    id: true,
                    name: true,
                    department_id: true,
                    responsible_id: true,
                    responsible2_id: true,
                    responsible3_id: true,
                    observations: true,
                    billing: true,
                    prevision: true,
                    type: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "integracao.tasksModel",
                referring_id: task_id,
                oldData: exists,
                updatedData: updated,
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async listModel(type: string, billing: string) {
        const list = await prismaClient.taskModel.findMany({
            where:{
                type: type,
                billing: billing
            },
            select:{
                id: true,
                name: true,
                department_id: true,
            },
            orderBy: {
                name: 'asc'
            }
        })

        return list
    }
    async deleteModel({ task_id, my_id }: DellRequest) {
        const exists = await prismaClient.taskModel.findFirst({
            where: { id: task_id }
        })
        if (!exists)
            throw new Error("Tarefa não existe")

        const user = await prismaClient.user.findFirst({ where:{ id: my_id } })
        if (!user)
            throw new Error("Usuário não encontrado")
        if (user.permission !== 2) 
            throw new Error("Usuário não tem permissão")

        const response = await prismaClient.taskModel.delete({
            where: { id: task_id }
        })
        if (!response)
            throw new Error("Erro ao deletar tarefa")
        
        return { response };
    }
    async addDependent({ 
        my_id,
        task_id,
        dependent_id,
        wait,
        observation,
    }: addDependentRequest) {
        const exists = await prismaClient.taskModel.findFirst({
            where:{ id: task_id }
        })
        if (!exists)
            throw new Error("Essa tarefa não existe")

        const create = await prismaClient.taskDependent.create({
            data:{
                task_id,
                dependent_id,
                wait,
                observation,
            },
            select:{
                id: true,
                task_id: true,
                dependent_id: true,
                wait: true,
                observation: true,
            }
        }) 

        return { create }
    }
    async listDependent(task_id: string) {
        const list = await prismaClient.taskDependent.findMany({
            where:{ task_id },
            select:{
                id: true,
                task_id: true,
                dependent_id: true,
                wait: true,
                observation: true,
                task: true,
                dependent: true,
            }
        })

        return list
    }
    async deleteDependent({ task_id, my_id }: DellRequest) {
        const exists = await prismaClient.taskDependent.findFirst({
            where: { id: task_id }
        })
        if (!exists)
            throw new Error("Tarefa dependente não existe")

        const user = await prismaClient.user.findFirst({ where:{ id: my_id } })
        if (!user)
            throw new Error("Usuário não encontrado")
        if (user.permission !== 2) 
            throw new Error("Usuário não tem permissão")

        const response = await prismaClient.taskDependent.delete({
            where: { id: task_id }
        })
        if (!response)
            throw new Error("Erro ao deletar tarefa")
        
        return { response };
    }

    // Tarefa
    async create({ 
        my_id,
        model_id,
        project_id,
        client_id,
        prospecting_status,
        observations,
        urgency,
    }: CreateRequest) {
        const exists = await prismaClient.task.findFirst({
            where:{ 
                project_id, 
                model_id,
                status: { in: ["Em Andamento", "A Realizar", "Em Espera"] }
            }
        })
        if (exists)
            throw new Error("Tarefa já foi cadastrada em andamento")

        const model = await prismaClient.taskModel.findFirst({
            where:{ id: model_id }
        })
        if (!model)
            throw new Error("Tarefa modelo não existe")

        let status = "A Realizar"
        if (prospecting_status === "Fechado")
            status = "Em Andamento"
        if (model.billing === "Realizar")
            status = "A Realizar"

        let charge_comercial = (model.billing === "Não Realizar") ? false : true

        const create = await prismaClient.task.create({
            data:{
                model_id,
                project_id,
                client_id,
                name: model.name,
                status,
                department_id: model.department_id,
                observations,
                billing: model.billing,
                urgency,
                responsible_id: model.responsible_id,
                responsible2_id: model.responsible2_id,
                responsible3_id: model.responsible3_id,
                start_date: (status === "Em Andamento") ? new Date() : null,
                pending_approval: false,
                charge_comercial,
                charge_financeiro: false,
            },
            select:{
                id: true,
                model_id: true,
                project_id: true,
                client_id: true,
                name: true,
                status: true,
                department_id: true,
                observations: true,
                billing: true,
                urgency: true,
                responsible_id: true,
                responsible2_id: true,
                responsible3_id: true,
                start_date: true,
                charge_comercial: true,
                charge_financeiro: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "integracao.tasks",
            referring_id: create.id,
            changes: "{}"
        })

        const dependents = await this.listDependent(model_id)
        dependents.forEach(dep => {
            let statusDependent = ''
            statusDependent = (prospecting_status === "Fechado") ? "Em Andamento" : "A Realizar"
            statusDependent = (dep.wait === false) ? statusDependent : "Em Espera"

            this.createDependent({
                my_id,
                model_id: dep.dependent_id,
                status: statusDependent,
                project_id,
                client_id,
                observations: dep.observation
            })
        })

        const ps = new ProjectService()
        await ps.calculateAndUpdateProjectPercentage(project_id)

        return { create }
    }
    async detail(task_id: string) {
        const detail = await prismaClient.task.findFirst({
            where:{
                id: task_id
            },
            select:{
                id: true,
                model_id: true,
                project_id: true,
                client_id: true,
                name: true,
                status: true,
                department_id: true,
                observations: true,
                billing: true,
                urgency: true,
                responsible_id: true,
                responsible2_id: true,
                responsible3_id: true,
                start_date: true,
                prevision_date: true,
                end_date: true,
                date_created: true,
                date_updated: true,
            }
        })
        return { detail }
    }
    async update({
        my_id,
        task_id,
        name,
        status,
        department_id,
        observations,
        billing,
        urgency,
        responsible_id,
        responsible2_id,
        responsible3_id,
        prevision_date,
    }: UpdateRequest) {
        try {
            const exists = await prismaClient.task.findFirst({
                where: { id: task_id }
            })
            if (!exists)
                throw new Error("Tarefa não existe")
    
            const updated = await prismaClient.task.update({
                where:{
                    id: task_id
                },
                data:{
                    name,
                    status,
                    department_id,
                    observations,
                    billing,
                    urgency,
                    responsible_id,
                    responsible2_id: responsible2_id || null,
                    responsible3_id: responsible3_id || null,
                    prevision_date,
                },
                select:{
                    name: true,
                    status: true,
                    department_id: true,
                    observations: true,
                    billing: true,
                    urgency: true,
                    responsible_id: true,
                    responsible2_id: true,
                    responsible3_id: true,
                    prevision_date: true,
                }
            })

            if (status === 'Paralisado' && exists.billing === 'Realizar' && exists.status !== 'Paralisado') {
                const es = new EmailService()
                await es.sendTaskStalled(task_id)
            }

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "integracao.tasks",
                referring_id: task_id,
                oldData: exists,
                updatedData: updated,
            });

            if (exists.status !== status) {
                const ps = new ProjectService()
                await ps.calculateAndUpdateProjectPercentage(exists.project_id)
            }

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async list(status: string, ref: string, ref_id: string, search: string = '', page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit;

        const baseSelect = {
            id: true,
            name: true,
            status: true,
            billing: true,
            charge_comercial: true,
            hiring_status: true,
            payment: true,
            billing_description: true,
            charge_financeiro: true,
        };

        const where: any = {};

        // Filtro de status
        if (status !== 'Todos') {
            where.status = status;
        }

        if (ref === 'CobrançaComercial') {
            where.charge_comercial = true;
        } else if (ref === 'CobrançaFinanceiro') {
            where.charge_financeiro = true;
        }

        // Filtro de busca
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } }
            ];
        }

        // Consulta paginada + total
        const [list, total] = await Promise.all([
            prismaClient.task.findMany({
                where,
                select: baseSelect,
                skip,
                take: limit,
                orderBy: {
                    name: 'asc'
                }
            }),
            prismaClient.task.count({ where }),
        ]);

        const hasMore = page * limit < total;

        return { data: list, hasMore };
    }
    async delete({ task_id, my_id }: DellRequest) {
        const exists = await prismaClient.task.findFirst({
            where: { id: task_id }
        })
        if (!exists)
            throw new Error("Tarefa não existe")

        const user = await prismaClient.user.findFirst({ where:{ id: my_id } })
        if (!user)
            throw new Error("Usuário não encontrado")
        if (user.permission !== 2) 
            throw new Error("Usuário não tem permissão")

        const response = await prismaClient.task.delete({
            where: { id: task_id }
        })
        if (!response)
            throw new Error("Erro ao deletar tarefa")
        
        return { response };
    }
    async conclusion({ 
        my_id,
        task_id,
        status,
        prevision_date,
        end_date,
        responsible_id,
        responsible2_id,
        responsible3_id,
        observations,
        justification,
    }: ConclusionRequest) {
        try {
            const exists = await prismaClient.task.findFirst({
                where: { id: task_id }
            })
            if (!exists)
                throw new Error("Tarefa não existe")

            let newStatus = status
            let newPendingApproval = exists.pending_approval

            if (status === 'Concluída') {
                const perm = await prismaClient.permissionSpecific.findFirst({
                    where: { user_id: my_id }
                })
                if (!perm || perm.task_completion === false)
                    newStatus = 'Em andamento'
                    newPendingApproval = true 
            }
    
            const updated = await prismaClient.task.update({
                where:{
                    id: task_id
                },
                data:{
                    status: newStatus,
                    prevision_date,
                    end_date,
                    responsible_id,
                    responsible2_id: responsible2_id || null,
                    responsible3_id: responsible3_id || null,
                    observations,
                    justification,
                    pending_approval: newPendingApproval,
                },
                select:{
                    id: true,
                    status: true,
                    prevision_date: true,
                    end_date: true,
                    responsible_id: true,
                    responsible2_id: true,
                    responsible3_id: true,
                    observations: true,
                    justification: true,
                    pending_approval: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Conclusão",
                referring: "integracao.tasks",
                referring_id: task_id,
                oldData: exists,
                updatedData: updated,
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async completeRequest(my_id: string, task_id: string) {
        try {
            const exists = await prismaClient.task.findFirst({
                where: { id: task_id }
            })
            if (!exists)
                throw new Error("Tarefa não existe")
            
            const perm = await prismaClient.permission.findFirst({
                where: { user_id: my_id }
            })
            if (!perm || perm.integracao !== 2)
                throw new Error("Sem cargo para completar")
            
            const permConclusion = await prismaClient.permissionSpecific.findFirst({
                where: { user_id: my_id }
            })
            if (!permConclusion || permConclusion.task_completion === false) 
                throw new Error("Sem permissão para completar")

            
            const updated = await prismaClient.task.update({
                where:{
                    id: task_id
                },
                data:{
                    status: 'Concluída',
                    pending_approval: false,
                },
                select:{
                    id: true,
                    status: true,
                    pending_approval: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Aprovação de Conclusão",
                referring: "integracao.tasks",
                referring_id: task_id,
                oldData: exists,
                updatedData: updated,
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async createDependent({ 
        my_id,
        model_id,
        status,
        project_id,
        client_id,
        observations,
    }: CreateDependentRequest) {
        const exists = await prismaClient.task.findFirst({
            where:{ 
                project_id, 
                model_id,
                status: { in: ["Em Andamento", "A Realizar", "Em Espera"] }
            }
        })
        if (exists)
            throw new Error("Tarefa já foi cadastrada")

        const model = await prismaClient.taskModel.findFirst({
            where:{ id: model_id }
        })
        if (!model)
            throw new Error("Tarefa modelo não existe")

        let charge_comercial = (model.billing === "Não Realizar") ? false : true
        let charge_financeiro = (model.billing === "Não Realizar") ? false : true
        
        charge_comercial = (status === "Em Espera") ? false : charge_comercial 
        charge_financeiro = (status === "Em Espera") ? false : charge_financeiro 

        const create = await prismaClient.task.create({
            data:{
                model_id,
                project_id,
                client_id,
                name: model.name,
                status,
                department_id: model.department_id,
                observations,
                billing: model.billing,
                urgency: "",
                responsible_id: model.responsible_id,
                responsible2_id: model.responsible2_id,
                responsible3_id: model.responsible3_id,
                start_date: (status === "Em Andamento") ? new Date() : null,
                pending_approval: false,
                charge_comercial,
                charge_financeiro,
            },
            select:{
                id: true,
                model_id: true,
                project_id: true,
                client_id: true,
                name: true,
                status: true,
                department_id: true,
                observations: true,
                billing: true,
                urgency: true,
                responsible_id: true,
                responsible2_id: true,
                responsible3_id: true,
                start_date: true,
                charge_comercial: true,
                charge_financeiro: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "integracao.tasks",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }

    async updateChargeFinanciero({ 
        my_id,
        task_id,
    }: UpdateChargeFinanceiroRequest) {
        try {
            const exists = await prismaClient.task.findFirst({
                where: { id: task_id }
            })
            if (!exists)
                throw new Error("Tarefa não existe")

            const updated = await prismaClient.task.update({
                where:{
                    id: task_id
                },
                data:{
                    charge_financeiro: false,
                },
                select:{
                    charge_financeiro: true
                }
            })
            
            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização de Cobrança Financeira",
                referring: "integracao.tasks",
                referring_id: task_id,
                oldData: exists,
                updatedData: updated,
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
}

export { TaskService }
