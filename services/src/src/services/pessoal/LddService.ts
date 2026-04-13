import prismaClient from "../../prisma"
import { LogService } from '../LogService'

interface CreateRequest {
    my_id: string
    client_id: string
    type: string
    period?: string
    due_date?: Date
    balance_amount?: number
    registration_status?: string
    status?: string
}
interface UpdateRequest {
    my_id: string
    ldd_id: string
    type: string
    period?: string
    due_date?: Date
    balance_amount?: number
    registration_status?: string
    status?: string
}
interface DeleteRequest {
    my_id: string
    ldd_id: string
}

class LddService {
    async create({ 
        my_id, 
        client_id,
        type,
        period,
        due_date,
        balance_amount,
        registration_status,
        status
    }: CreateRequest) {
        const exists = await prismaClient.lddPessoal.findFirst({
            where: { 
                client_id,
                type,
                period,
                due_date,
                balance_amount,
                registration_status,
                status
            }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const create = await prismaClient.lddPessoal.create({
            data:{
                client_id,
                type,
                period,
                due_date,
                balance_amount,
                registration_status,
                status
            },
            select:{
                id: true,
                client_id: true,
                type: true,
                period: true,
                due_date: true,
                balance_amount: true,
                registration_status: true,
                status: true
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "pessoal.ldd",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }

    async update({ 
        my_id, 
        ldd_id,
        ...data
    }: UpdateRequest) {
        try {
            const exists = await prismaClient.lddPessoal.findFirst({
                where: {
                    id: ldd_id
                }
            })
            if (!exists) {
                throw new Error("Não existe")
            }

            const updated = await prismaClient.lddPessoal.update({
                where: {
                    id: ldd_id
                },
                data:{
                    type: data.type,
                    period: data.period,
                    due_date: data.due_date,
                    balance_amount: data.balance_amount,
                    registration_status: data.registration_status,
                    status: data.status
                },
                select:{
                    id: true,
                    client_id: true,
                    type: true,
                    period: true,
                    due_date: true,
                    balance_amount: true,
                    registration_status: true,
                    status: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "pessoal.ldd",
                referring_id: ldd_id,
                oldData: exists,
                updatedData: updated,
            });

            return updated

        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }

    async list(client_id: string) {
        const list = await prismaClient.lddPessoal.findMany({
            where:{ client_id },
            select:{
                id: true,
                client_id: true,
                type: true,
                period: true,
                due_date: true,
                balance_amount: true,
                registration_status: true,
                status: true,
            },
            orderBy: {
                due_date: 'asc'
            }
        })
        return list
    }

    async delete({ my_id, ldd_id }: DeleteRequest) {
        try {
            const exists = await prismaClient.lddPessoal.findUnique({
                where: {
                    id: ldd_id
                }
            })
            if (!exists) {
                throw new Error("LDD não encontrado")
            }

            await prismaClient.lddPessoal.delete({
                where: {
                    id: ldd_id
                }
            })

            const ls = new LogService()
            await ls.createLog({
                my_id,
                action: "Exclusão", 
                referring: "pessoal.ldd",
                referring_id: exists.id,
                changes: exists
            })

            return exists
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao deletar")
        }
    }
}

export { LddService }