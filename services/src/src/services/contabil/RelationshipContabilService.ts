import prismaClient from "../../prisma";
import { LogService } from '../LogService'

interface RelationshipDTO {
    client_id: string;
    bidding: boolean;
    chart_accounts: string;
    tool: string;
    system: string;
    note: string;
}

class RelationshipContabilService {
    private prisma = prismaClient;

    // 1. Criar
    public async create(my_id: string, data: RelationshipDTO) {
        let exists = await this.prisma.relationshipContabil.findFirst({
            where: { client_id: data.client_id },
        });
        if (exists)
            throw new Error("Registro de relacionamento já existe para este cliente.");

        const relationship = await this.prisma.relationshipContabil.create({
            data,
        });

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "contabil.relationship",
            referring_id: relationship.id,
            changes: "{}"
        })

        return relationship;
    }

    // 2. Atualizar
    public async update(my_id: string, id: string, data: RelationshipDTO) {
        let exists = await this.prisma.relationshipContabil.findFirst({
            where: { id },
        });
        if (!exists)
            throw new Error("Registro de relacionamento não existe.");

        const updated = await this.prisma.relationshipContabil.update({
            where: { id },
            data,
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id,
            action: "Atualização",
            referring: "contabil.relationship",
            referring_id: id,
            oldData: exists,
            updatedData: updated,
        })

        return updated;
    }

    // 3. Buscar por ID do Cliente
    public async getByClientId(clientId: string) {
        const relationship = await this.prisma.relationshipContabil.findFirst({
            where: { client_id: clientId },
        });

        if (!relationship) {
            throw new Error("Registro de relacionamento não encontrado para este cliente.");
        }
        return relationship;
    }

    // 4. Deletar
    public async delete(id: string) {
        await this.prisma.relationshipContabil.delete({
            where: { id },
        });
        return { message: "Registro deletado com sucesso." };
    }
}

export { RelationshipContabilService };