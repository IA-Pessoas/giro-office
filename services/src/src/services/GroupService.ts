import prismaClient from "../prisma"
import { LogService } from './LogService';

interface CreateRequest {
    my_id: string
    name: string
}
interface UpdateRequest {
    my_id: string
    group_id: string
    name: string
    status: boolean
}
interface AddClientRequest {
    my_id: string
    group_id: string
    client_id: string
}
interface RemoveClientRequest {
    my_id: string
    group_id: string
}

class GroupService {
    async create({ my_id, name }: CreateRequest) {
        const exists = await prismaClient.group.findFirst({
            where: {
                name: name
            }
        })
        if (exists) {
            throw new Error("Grupo já cadastrado")
        }

        const create = await prismaClient.group.create({
            data:{
                name, 
                status: true,
            },
            select:{
                id: true,
                name: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "clients.group",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }

    async detail(group_id: string) {
        const detail = await prismaClient.group.findFirst({
            where:{
                id: group_id
            },
            select:{
                id: true,
                name: true,
                status: true,
                clients: true,
            }
        })

        return { detail }
    }

    async update({ my_id, group_id, name, status }: UpdateRequest) {
        try {
            const exists = await prismaClient.group.findFirst({
                where: {
                    id: group_id
                }
            })
            if (!exists) {
                throw new Error("Grupo não existe")
            }

            const updated = await prismaClient.group.update({
                where: {
                    id: group_id
                },
                data: {
                    name,
                    status,
                },
                select: {
                    name: true,
                    status: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "clients.group",
                referring_id: group_id,
                oldData: exists,
                updatedData: updated,
            });


            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }

    async list(status: boolean) {
        const list = await prismaClient.group.findMany({
            where:{
                status
            },
            select:{
                id: true,
                name: true,
                status: true,
            },
            orderBy: {
                name: 'asc'
            }
        })

        return list
    }

    async addClient({ my_id, group_id, client_id }: AddClientRequest) {
        const exists = await prismaClient.clientsGroup.findFirst({
            where: {
                group_id: group_id,
                client_id: client_id
            }
        })
        if (exists) {
            throw new Error("Grupo já cadastrado")
        }

        const create = await prismaClient.clientsGroup.create({
            data:{
                group_id,
                client_id
            },
            select:{
                id: true,
                group_id: true,
                client_id: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "clients.clientsGroup",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }

    async removeClient({ my_id, group_id }: RemoveClientRequest) {
        const exists = await prismaClient.clientsGroup.findFirst({
            where: {
                id: group_id,
            }
        })
        if (!exists) {
            throw new Error("Grupo não está cadastrado")
        }

        const removed = await prismaClient.clientsGroup.delete({
            where:{
                id: group_id,
            }
        }) 

        return { removed }
    }
}

export { GroupService }