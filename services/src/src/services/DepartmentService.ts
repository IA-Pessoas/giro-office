import prismaClient from "../prisma"
import { LogService } from './LogService';

interface CreateRequest {
    my_id: string
    name: string
    color: string
    solution: boolean
}
interface UpdateRequest {
    my_id: string
    dep_id: string
    name: string
    color: string
    status: string
    solution: boolean
}

class DepartmentService {
    private async find(field: string, value: string) {
        if (field === 'name') {
            const dep = await prismaClient.department.findFirst({
                where:{
                    name: value
                }
            })
            return dep
        } else if (field === 'id') {
            const dep = await prismaClient.department.findFirst({
                where:{
                    id: value
                }
            })
            return dep
        }
    }

    async create({ my_id, name, color, solution }: CreateRequest) {
        const exists = await prismaClient.department.findFirst({
            where:{
                name: name
            }
        })
        if (exists) {
            throw new Error("Departamento já cadastrado")
        }

        const dep = await prismaClient.department.create({
            data:{
                name, 
                color,
                status: 'Ativo', 
                solution, 
            },
            select:{
                id: true,
                name: true,
                color: true,
                solution: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "departments",
            referring_id: dep.id,
            changes: "{}"
        })

        return { dep }
    }
    
    async detail(dep_id: string) {

        const dep = await prismaClient.department.findFirst({
            where:{
                id: dep_id
            },
            select:{
                id: true,
                name: true,
                color: true,
                status: true,
                solution: true,
            }
        })

        return { dep }
    }

    async getName(dep_id: string) {
        const dep = await prismaClient.department.findFirst({
            where:{
                id: dep_id
            }
        })

        if (!dep) {
            throw new Error("Departamento não encontrado");
        }

        return dep.name
    }

    async update({ my_id, dep_id, name, color, status, solution }: UpdateRequest) {
        try{
            const exists = await this.find('id', dep_id)
            if (!exists) {
                throw new Error("Departamento não existe")
            }

            const updated = await prismaClient.department.update({
                where:{
                    id: dep_id
                },
                data:{
                    name,
                    color,
                    status,
                    solution,
                },
                select:{
                    name: true,
                    color: true,
                    status: true,
                    solution: true,
                }
            })

            const oldData = exists
            const updatedData = updated
            const ls = new LogService()
            const changes: Record<string, any> = {}

            if (oldData) {
                for (const key of Object.keys(updatedData)) {
                    if (updatedData[key as keyof typeof updatedData] !== oldData[key as keyof typeof oldData]) {
                        changes[key] = {
                            from: oldData[key as keyof typeof oldData],
                            to: updatedData[key as keyof typeof updatedData],
                        }
                    }
                }
            }

            // Se tiver alguma alteração
            if (Object.keys(changes).length > 0) {
                await ls.createLog({
                    my_id,
                    action: "Atualização",
                    referring: "departments",
                    referring_id: dep_id,
                    changes
                })
            }


            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }

    async list(status: string) {
        if (status !== 'Todos') {
            const deps = await prismaClient.department.findMany({
                where:{
                    status: status
                },
                select:{
                    id: true,
                    name: true,
                    color: true,
                    status: true,
                    solution: true,
                },
                orderBy: {
                    name: 'asc'
                }
            })
    
            return deps
        } else {
            const deps = await prismaClient.department.findMany({
                select:{
                    id: true,
                    name: true,
                    color: true,
                    status: true,
                    solution: true,
                },
                orderBy: {
                    name: 'asc'
                }
            })
    
            return deps
        }
    }
}

export { DepartmentService }