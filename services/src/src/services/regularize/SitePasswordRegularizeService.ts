import prismaClient from "../../prisma"
import { LogService } from '../LogService'

interface CreateRequest {
    my_id: string
    name: string
    sphere: string
    link: string
    user: string
    password: string
}
interface UpdateRequest extends CreateRequest {
    id: string
    status: boolean
}

class SitePasswordRegularizeService {
    async create({ my_id, name, sphere, link, user, password }: CreateRequest) {
        const exists = await prismaClient.sitePasswordsRegularize.findFirst({
            where: { name, sphere, link }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const create = await prismaClient.sitePasswordsRegularize.create({
            data:{ name, sphere, link, user, password },
            select:{
                id: true,
                name: true, 
                sphere: true, 
                link: true, 
                user: true, 
                password: true
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "regularize.passowordsSites",
            referring_id: create.id,
            changes: "{}",
            dep: "regularize"
        })

        return { create }
    }
    async update({ my_id, id, name, sphere, link, user, password, status }: UpdateRequest) {
        try {
            const exists = await prismaClient.sitePasswordsRegularize.findFirst({ where: { id } })
            if (!exists) throw new Error("Não existe")

            const updated = await prismaClient.sitePasswordsRegularize.update({
                where: { id },
                data: { name, sphere, link, user, password, status },
                select: {
                    id: true,
                    name: true, 
                    sphere: true, 
                    link: true, 
                    user: true, 
                    password: true,
                    status: true
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "regularize.sitePasswordsRegularize",
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
        const detail = await prismaClient.sitePasswordsRegularize.findFirst({
            where:{ id },
            select:{
                id: true,
                name: true, 
                sphere: true, 
                link: true, 
                user: true, 
                password: true,
                status: true
            }
        })
        return { detail }
    }
    public async list(status: boolean) {
        const list = await prismaClient.sitePasswordsRegularize.findMany({
            where: { status },
            select: {
                id: true,
                name: true, 
                sphere: true, 
                link: true, 
                user: true, 
                password: true,
            },
            orderBy: {
                name: 'asc',
            },
        });
        return list;
    }
}

export { SitePasswordRegularizeService }