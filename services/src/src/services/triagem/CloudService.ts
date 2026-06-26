import prismaClient from "../../prisma";
import { LogService } from "../LogService";

interface CreateCloudDTO {
    my_id: string;
    client_id: string;
    type: string;
    link: string;
}

interface UpdateCloudDTO {
    my_id: string;
    id: string;
    type?: string;
    link?: string;
}

class CloudService {

    // 1. Criar Nuvem
    async create(data: CreateCloudDTO) {
        // Validação básica de URL (opcional, mas recomendada)
        if (!data.link.startsWith('http')) {
            throw new Error("O link deve começar com http:// ou https://");
        }

        const cloud = await prismaClient.clientClouds.create({
            data: {
                client_id: data.client_id,
                type: data.type,
                link: data.link
            }
        });

        const ls = new LogService();
        await ls.createLog({
            my_id: data.my_id,
            action: "Cadastrar Nuvem",
            referring: "clientes.clouds",
            referring_id: cloud.id,
            changes: `Tipo: ${data.type} - Link: ${data.link}`,
            dep: "clientes"
        });

        return cloud;
    }

    // 2. Listar por Cliente
    async listByClient(client_id: string) {
        return await prismaClient.clientClouds.findMany({
            where: { client_id },
            orderBy: { created_at: 'desc' } // Mais recentes primeiro
        });
    }

    // 3. Atualizar Nuvem
    async update(data: UpdateCloudDTO) {
        const exists = await prismaClient.clientClouds.findUnique({ where: { id: data.id } });
        if (!exists) throw new Error("Registro não encontrado");

        const updated = await prismaClient.clientClouds.update({
            where: { id: data.id },
            data: {
                type: data.type,
                link: data.link
            }
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id: data.my_id,
            action: "Atualizar Nuvem",
            referring: "clientes.clouds",
            referring_id: data.id,
            oldData: exists,
            updatedData: updated,
            dep: "clientes"
        });

        return updated;
    }

    // 4. Deletar Nuvem
    async delete(my_id: string, id: string) {
        const exists = await prismaClient.clientClouds.findUnique({ where: { id } });
        if (!exists) throw new Error("Registro não encontrado");

        await prismaClient.clientClouds.delete({ where: { id } });

        const ls = new LogService();
        await ls.createLog({
            my_id: my_id,
            action: "Excluir Nuvem",
            referring: "clientes.clouds",
            referring_id: id,
            changes: `Nuvem do tipo ${exists.type} excluída`,
            dep: "clientes"
        });

        return { message: "Link/Nuvem excluído com sucesso" };
    }
}

export { CloudService };