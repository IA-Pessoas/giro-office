import prismaClient from "../../prisma"
import { LogService } from '../LogService'

interface CreateRequest {
    my_id: string
    pj_id: string
    pf_id: string
    part: number
    entry: Date
    exit?: string
}
interface UpdateRequest extends CreateRequest {
    id: string
}

class PartnersService {
    async create({
        my_id,
        pj_id,
        pf_id,
        part,
        entry,
        exit
    }: CreateRequest) {
        const exists = await prismaClient.partners.findFirst({
            where: { pj_id, pf_id }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const create = await prismaClient.partners.create({
            data:{ pj_id, pf_id, part, entry, exit },
            select: {
                id: true,
                pj_id: true, 
                pf_id: true, 
                part: true, 
                entry: true, 
                exit: true
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "regularize.partners",
            referring_id: create.id,
            changes: "{}",
            dep: "regularize"
        })

        return { create }
    }
    async update({ my_id, id, pj_id, pf_id, part, entry, exit }: UpdateRequest) {
        try {
            const exists = await prismaClient.partners.findFirst({ where: { id } })
            if (!exists) throw new Error("Não existe")

            const updated = await prismaClient.partners.update({
                where: { id },
                data: { pj_id, pf_id, part, entry, exit },
                select: {
                    id: true,
                    pj_id: true, 
                    pf_id: true, 
                    part: true, 
                    entry: true, 
                    exit: true
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "regularize.partners",
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
        const detail = await prismaClient.partners.findFirst({
            where:{ id },
            select:{
                id: true,
                pj_id: true, 
                pf_id: true, 
                part: true, 
                entry: true, 
                exit: true
            }
        })
        return { detail }
    }
    public async list(type: string, client_id: string) {
        if (type === 'pf') {
            const list = await prismaClient.partners.findMany({
                where: { pf_id: client_id },
                select: {
                    id: true,
                    pj_id: true, 
                    pf_id: true, 
                    part: true, 
                    entry: true, 
                    exit: true
                },
                orderBy: {
                    entry: 'asc',
                },
            });
            return list;
        } else if (type === 'pj') {
            const list = await prismaClient.partners.findMany({
                where: { pj_id: client_id },
                select: {
                    id: true,
                    pj_id: true, 
                    pf_id: true, 
                    part: true, 
                    entry: true, 
                    exit: true
                },
                orderBy: {
                    entry: 'asc',
                },
            });
            return list;
        }
    }
}

export { PartnersService }