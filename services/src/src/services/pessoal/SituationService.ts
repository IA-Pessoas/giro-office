import prismaClient from "../../prisma";
import { LogService } from '../LogService';

interface CreateRequest {
    my_id: string
    client_id: string
    title: string
    description: string
}

interface UpdateRequest {
    my_id: string
    id: string;
    status: string
    title: string
    description: string
}

class SituationService {
    public async create({ my_id, client_id, title, description }: CreateRequest) {
        const exists = await prismaClient.situationsPessoal.findFirst({
            where: {
                client_id,
                title,
                description,
                registered_by_id: my_id,
            },
        });
        if (exists)
            throw new Error("Registro já existe.");

        const create = await prismaClient.situationsPessoal.create({
            data: {
                client_id,
                status: "Em andamento",
                title,
                description,
                registered_by_id: my_id,
            },
        });

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "pessoal.situations",
            referring_id: create.id,
            changes: "{}",
            dep: "pessoal"
        })

        return create;
    }

    public async update({ my_id, id, status, title, description }: UpdateRequest) {
        const exists = await prismaClient.situationsPessoal.findFirst({
            where: { id }
        })
        if (!exists)
            throw new Error("Não existe")

        let completed_by_id = (status === "Finalizado") ? my_id : null
        let completion_date = (status === "Finalizado") ? new Date() : null

        const updated = await prismaClient.situationsPessoal.update({
            where: { id },
            data: {
                status,
                title,
                description,
                completion_date,
                completed_by_id,
            },
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id,
            action: "Atualização",
            referring: "pessoal.situations",
            referring_id: id,
            oldData: exists,
            updatedData: updated,
            dep: "pessoal"
        });

        return updated;
    }

    public async list(client_id: string) {
        const list = await prismaClient.situationsPessoal.findMany({
            where: { client_id },
            select: {
                id: true,
                client_id: true,
                status: true,
                title: true,
                description: true,
                registration_date: true,
                completion_date: true,
                registered_by_id: true,
                completed_by_id: true,
            },
            orderBy: {
                registration_date: 'desc',
            },
        });
        return list;
    }

    public async detail(id: string) {
        const detail = await prismaClient.situationsPessoal.findUnique({
            where: { id },
            include: {
                registered_by: { select: { id: true, name: true } },
                completed_by: { select: { id: true, name: true } }
            }
        });

        if (!detail) 
            throw new Error("Registro não encontrado.");

        return { detail };
    }
}

export { SituationService };