import prismaClient from "../../prisma";
import { LogService } from "../LogService";

interface CreateResponsibleDTO {
    my_id: string;
    client_id: string;
    user_id: string; // ID do Responsável
    type: 'CONTABIL' | 'FISCAL'; // O campo "obs"
}

interface UpdateResponsibleDTO {
    my_id: string;
    id: string;
    user_id?: string;
    type?: 'CONTABIL' | 'FISCAL';
}

class TriageResponsibleService {

    // 1. Criar Responsável
    async create(data: CreateResponsibleDTO) {
        // Validação do tipo
        const upperType = data.type.toUpperCase();
        if (upperType !== 'CONTABIL' && upperType !== 'FISCAL') {
            throw new Error("O tipo (obs) deve ser 'CONTABIL' ou 'FISCAL'.");
        }

        // Verifica se já existe responsável para este cliente neste departamento
        const exists = await prismaClient.triageResponsible.findFirst({
            where: {
                client_id: data.client_id,
                type: upperType
            }
        });

        if (exists) {
            throw new Error(`Já existe um responsável ${upperType} para este cliente.`);
        }

        const responsible = await prismaClient.triageResponsible.create({
            data: {
                client_id: data.client_id,
                user_id: data.user_id,
                type: upperType
            }
        });

        const ls = new LogService();
        await ls.createLog({
            my_id: data.my_id,
            action: "Definir Responsável Triagem",
            referring: "triagem.responsibles",
            referring_id: responsible.id,
            changes: `Tipo: ${upperType}`,
            dep: "triagem"
        });

        return responsible;
    }

    // 2. Listar (Pode filtrar por Cliente ou por Tipo)
    async list(client_id?: string, type?: string) {
        const where: any = {};
        if (client_id) where.client_id = client_id;
        if (type) where.type = type.toUpperCase();

        return await prismaClient.triageResponsible.findMany({
            where,
            include: {
                client: { select: { name: true } },
                user: { select: { name: true } } // Nome do responsável
            },
            orderBy: { client: { name: 'asc' } }
        });
    }

    // 3. Atualizar Responsável
    async update(data: UpdateResponsibleDTO) {
        const exists = await prismaClient.triageResponsible.findUnique({ where: { id: data.id } });
        if (!exists) throw new Error("Registro não encontrado");

        const upperType = data.type ? data.type.toUpperCase() : undefined;

        const updated = await prismaClient.triageResponsible.update({
            where: { id: data.id },
            data: {
                user_id: data.user_id,
                type: upperType
            }
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id: data.my_id,
            action: "Atualizar Responsável Triagem",
            referring: "triagem.responsibles",
            referring_id: data.id,
            oldData: exists,
            updatedData: updated,
            dep: "triagem"
        });

        return updated;
    }

    // 4. Deletar
    async delete(my_id: string, id: string) {
        const exists = await prismaClient.triageResponsible.findUnique({ where: { id } });
        if (!exists) throw new Error("Registro não encontrado");

        await prismaClient.triageResponsible.delete({ where: { id } });

        const ls = new LogService();
        await ls.createLog({
            my_id: my_id,
            action: "Remover Responsável Triagem",
            referring: "triagem.responsibles",
            referring_id: id,
            changes: `Removido responsável ${exists.type}`,
            dep: "triagem"
        });

        return { message: "Responsável removido com sucesso" };
    }
}

export { TriageResponsibleService };