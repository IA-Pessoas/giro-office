import prismaClient from "../../../prisma"
import { LogService } from "../../LogService"
import { TaskService } from "./TaskService"

interface CreateRequest {
    my_id: string
    name: string
    color: string
}
interface UpdateRequest {
    my_id: string
    id: string
    name: string
    color: string
}
interface addTaskRequest {
    plan_id: string 
    task_id: string
    my_id: string
}
interface ReorderTaskRequest {
    plan_id: string
    plan_task_id: string
    direction: 'up' | 'down'
    my_id: string
}
interface DeleteTaskRequest {
    plan_id: string
    plan_task_id: string
    my_id: string
}
interface hirePlanRequest {
    my_id: string
    project_id: string
    plan_id: string, 
}


class PlanService {
    async create({ my_id, name, color }: CreateRequest) {
        if (!name || !color) {
            throw new Error("Name and color are required")
        }

        const create = await prismaClient.projectPlan.create({
            data: {
                name,
                color,
            },
        })

        await new LogService().createLog({
            my_id,
            action: "Cadastro",
            referring: "integracao.projectPlan",
            referring_id: create.id,
            changes: "{}"
        })

        return create
    }
    async update({ my_id, id, name, color }: UpdateRequest) {
        const exists = await prismaClient.projectPlan.findUnique({
            where: { id }
        })
        if (!exists)
            throw new Error("Plan not found")

        const updated = await prismaClient.projectPlan.update({
            where: { id },
            data: {
                name,
                color,
            },
        })

        await new LogService().logUpdateIfChanged({
            my_id,
            action: "Atualização",
            referring: "integracao.projectPlan",
            referring_id: id,
            oldData: exists,
            updatedData: updated,
        })

        return updated
    }
    async detail(id: string) {
        const detail = await prismaClient.projectPlan.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                color: true,
                tasks: {
                    select: {
                        id: true,
                        plan_id: true,
                        task_id: true,
                        order: true,
                        tasks: true
                    },
                    orderBy: {
                        order: 'asc'
                    }
                }
            }
        })

        return detail
    }
    async list() {
        const list = await prismaClient.projectPlan.findMany({
            select: {
                id: true,
                name: true,
                color: true,
            },
            orderBy: {
                name: 'asc'
            }
        })

        return list
    }
    async delete(id: string, my_id: string) {
        const exists = await prismaClient.projectPlan.findUnique({
            where: { id }
        })
        if (!exists)
            throw new Error("Plan not found")

        const user = await prismaClient.user.findFirst({ where:{ id: my_id } })
        if (!user)
            throw new Error("Usuário não encontrado")
        if (user.permission !== 2) 
            throw new Error("Usuário não tem permissão")

        const tasks = await this.listTasks(id)
        for (const task of tasks) {
            await prismaClient.projectPlanTasks.delete({
                where: { id: task.id }
            })
        }

        // funcao para reordenar tarefas do plano

        const response = await prismaClient.projectPlan.delete({
            where: { id }
        })
        if (!response)
            throw new Error("Error deleting plan")

        return { response }
    }

    async addTask({ plan_id, task_id, my_id }: addTaskRequest) {
        if (!plan_id || !task_id)
            throw new Error("Plan ID and Task ID are required");

        const lastTaskInPlan = await prismaClient.projectPlanTasks.findFirst({
            where: {
                plan_id: plan_id,
            },
            orderBy: {
                order: 'desc', 
            },
            select: {
                order: true
            }
        });

        const finalOrder = lastTaskInPlan ? lastTaskInPlan.order + 1 : 1;
        
        const add = await prismaClient.projectPlanTasks.create({
            data: {
                plan_id,
                task_id,
                order: finalOrder,
            },
        });

        await new LogService().createLog({
            my_id,
            action: "Cadastro",
            referring: "integracao.projectPlan",
            referring_id: add.id,
            changes: "{}"
        })

        return add
    }
    async listTasks(plan_id: string) {
        const list = await prismaClient.projectPlanTasks.findMany({
            where: { plan_id },
            select: {
                id: true,
                plan_id: true,
                task_id: true,
                order: true,
                tasks: true
            },
            orderBy: {
                order: 'asc'
            }
        })

        return list
    }
    async reorderTask({ plan_id, plan_task_id, direction, my_id }: ReorderTaskRequest) {
        const taskA = await prismaClient.projectPlanTasks.findUnique({
            where: { id: plan_task_id }
        });
        if (!taskA || taskA.plan_id !== plan_id)
            throw new Error("Tarefa não encontrada neste plano.")

        if (direction === 'up' && taskA.order === 1)
            return { message: "A tarefa já está no topo." }

        const targetOrder = direction === 'up' ? taskA.order - 1 : taskA.order + 1;
        const taskB = await prismaClient.projectPlanTasks.findFirst({
            where: {
                plan_id: plan_id,
                order: targetOrder,
            }
        });
        if (!taskB)
            return { message: "Não é possível mover a tarefa nesta direção." };

        const updateTaskA = prismaClient.projectPlanTasks.update({
            where: { id: taskA.id },
            data: { order: taskB.order }
        });

        const updateTaskB = prismaClient.projectPlanTasks.update({
            where: { id: taskB.id },
            data: { order: taskA.order }
        });

        // Usamos $transaction para garantir que ambas as atualizações ocorram ou nenhuma ocorra
        const [updatedTaskA, updatedTaskB] = await prismaClient.$transaction([
            updateTaskA,
            updateTaskB
        ]);

        return { updatedTaskA, updatedTaskB };
    }
    async deleteTask({ plan_id, plan_task_id, my_id }: DeleteTaskRequest) {
        // Usamos uma transação interativa para garantir que tudo aconteça ou nada aconteça.
        // O 'tx' é um cliente Prisma que só opera dentro desta transação.
        const deletedTask = await prismaClient.$transaction(async (tx) => {
            const taskToDelete = await tx.projectPlanTasks.findUnique({
                where: {
                    id: plan_task_id,
                    plan_id: plan_id 
                }
            })
            if (!taskToDelete)
                throw new Error("Tarefa não encontrada neste plano.")

            const deletedOrder = taskToDelete.order;

            await tx.projectPlanTasks.delete({
                where: {
                    id: plan_task_id
                }
            })

            // Reordenar as tarefas restantes.
            // Atualiza em massa todas as tarefas do mesmo plano cuja ordem era
            // maior que a da tarefa que acabamos de deletar.
            await tx.projectPlanTasks.updateMany({
                where: {
                    plan_id: plan_id,
                    order: {
                        gt: deletedOrder // 'gt' significa "greater than" (maior que)
                    }
                },
                data: {
                    order: {
                        decrement: 1 // Decrementa 1 do valor atual da ordem
                    }
                }
            });

            // Retornamos a tarefa que foi deletada para o log
            return taskToDelete
        })

        return deletedTask
    }

    async hirePlan({ my_id, project_id, plan_id }: hirePlanRequest) {
        const list = await prismaClient.projectPlanTasks.findMany({
            where: { plan_id },
            select: {
                id: true,
                plan_id: true,
                task_id: true,
                order: true,
                tasks: true
            },
            orderBy: {
                order: 'asc'
            }
        })
        const project = await prismaClient.project.findFirst({ where: { id: project_id } })
        if (!project) 
            throw new Error("Projeto não encontrado")
        const client = await prismaClient.client.findFirst({ where: { id: project.client_id } })
        if (!client) 
            throw new Error("Cliente não encontrado")

        const taskService = new TaskService()
        for (const task of list) {
            await taskService.create({ 
                my_id,
                model_id: task.task_id,
                project_id,
                client_id: project.client_id,
                prospecting_status: client.prospecting_status,
                observations: "",
                urgency: "",
            })
        }

        return list
    }
}

export { PlanService }