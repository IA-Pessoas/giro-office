import prismaClient from "../../prisma"
import { LogService } from '../LogService'

interface CreateRequest {
    my_id: string
    client_pj_id?: string
    client_pf_id?: string
    cpf_cnpj: string
    process_type: string
    description: string
    entry_date?: Date
    completion_date?: Date
    expected_date?: Date
    status: string
    observation?: string
    responsible1_id?: string
    responsible2_id?: string
    responsible3_id?: string
    locking_type?: string
    urgency?: string
    task_id?: string
}
interface UpdateRequest extends CreateRequest {
    id: string
}

class ProcessService {
    async create({
        my_id,
        client_pj_id,
        client_pf_id,
        cpf_cnpj,
        process_type,
        description,
        entry_date,
        completion_date,
        expected_date,
        status,
        observation,
        responsible1_id,
        responsible2_id,
        responsible3_id,
        locking_type,
        urgency,
        task_id,
    }: CreateRequest) {
        const exists = await prismaClient.process.findFirst({
            where: { client_pf_id, cpf_cnpj, process_type, status }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const create = await prismaClient.process.create({
            data:{ 
                client_pj_id,
                client_pf_id,
                cpf_cnpj,
                process_type,
                description,
                entry_date,
                completion_date,
                expected_date,
                status,
                observation,
                responsible1_id,
                responsible2_id,
                responsible3_id,
                locking_type,
                urgency,
                task_id,
            },
            select:{
                id: true,
                client_pj_id: true,
                client_pf_id: true,
                cpf_cnpj: true,
                process_type: true,
                description: true,
                entry_date: true,
                completion_date: true,
                expected_date: true,
                status: true,
                observation: true,
                responsible1_id: true,
                responsible2_id: true,
                responsible3_id: true,
                locking_type: true,
                urgency: true,
                task_id: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "regularize.process",
            referring_id: create.id,
            changes: "{}",
            dep: "regularize"
        })

        return { create }
    }
    async update({ 
        my_id, 
        id, 
        client_pj_id,
        client_pf_id,
        cpf_cnpj,
        process_type,
        description,
        entry_date,
        completion_date,
        expected_date,
        status,
        observation,
        responsible1_id,
        responsible2_id,
        responsible3_id,
        locking_type,
        urgency,
        task_id,
    }: UpdateRequest) {
        try {
            const exists = await prismaClient.process.findFirst({ where: { id } })
            if (!exists) throw new Error("Não existe")

            const updated = await prismaClient.process.update({
                where: { id },
                data: {
                    cpf_cnpj,
                    process_type,
                    description,
                    entry_date,
                    completion_date,
                    expected_date,
                    status,
                    observation,
                    responsible1_id,
                    responsible2_id,
                    responsible3_id,
                    locking_type,
                    urgency,
                    task_id,
                },
                select:{
                    id: true,
                    client_pj_id: true,
                    client_pf_id: true,
                    cpf_cnpj: true,
                    process_type: true,
                    description: true,
                    entry_date: true,
                    completion_date: true,
                    expected_date: true,
                    status: true,
                    observation: true,
                    responsible1_id: true,
                    responsible2_id: true,
                    responsible3_id: true,
                    locking_type: true,
                    urgency: true,
                    task_id: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "regularize.process",
                referring_id: exists.id,
                oldData: exists,
                updatedData: updated,
                dep: "regularize"
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async detail(id: string) {
        const detail = await prismaClient.process.findFirst({
            where:{ id },
            select:{
                id: true,
                client_pj_id: true,
                client_pf_id: true,
                cpf_cnpj: true,
                process_type: true,
                description: true,
                entry_date: true,
                completion_date: true,
                expected_date: true,
                status: true,
                observation: true,
                responsible1_id: true,
                responsible2_id: true,
                responsible3_id: true,
                locking_type: true,
                urgency: true,
                task_id: true,
            }
        })
        return { detail }
    }
    public async list(status: string) {
        if (status === 'Todos') {
            const list = await prismaClient.process.findMany({
                select: {
                    id: true,
                    client_pj_id: true,
                    client_pf_id: true,
                    cpf_cnpj: true,
                    process_type: true,
                    status: true,
                    clientPF: {
                        select: {
                            name: true,
                            cpf: true,
                        },
                    },
                    clientPJ: {
                        select: {
                            name: true,
                            cpf_cnpj: true,
                        },
                    },
                },
                orderBy: {
                    id: 'asc',
                },
            });
            return list;
        } else {
            const list = await prismaClient.process.findMany({
                where: { status },
                select: {
                    id: true,
                    client_pj_id: true,
                    client_pf_id: true,
                    cpf_cnpj: true,
                    process_type: true,
                    status: true,
                    clientPF: {
                        select: {
                            name: true,
                            cpf: true,
                        },
                    },
                    clientPJ: {
                        select: {
                            name: true,
                            cpf_cnpj: true,
                        },
                    },
                },
                orderBy: {
                    id: 'asc',
                },
            });
            return list;
        }
    }
}

export { ProcessService }