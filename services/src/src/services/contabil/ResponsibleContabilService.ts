import prismaClient from "../../prisma";
import { LogService } from '../LogService'

interface ResponsibleDTO {
    client_id: string;
    person_responsible_id?: string;
    posted_by_id?: string;
    customer_with_movement?: boolean;
}

class ResponsibleContabilService {
    private prisma = prismaClient;

    public async create(my_id: string, data: ResponsibleDTO) {
        const {
            client_id,
            person_responsible_id,
            posted_by_id,
            customer_with_movement,
        } = data;

        let exists = await this.prisma.responsibleContabil.findFirst({
            where: { client_id },
        });
        if (exists)
            throw new Error("Já está cadastrado")

        const responsible = await this.prisma.responsibleContabil.create({
            data: {
                client_id,
                person_responsible_id: person_responsible_id || "",
                posted_by_id: posted_by_id || "",
                customer_with_movement: customer_with_movement || false,
            },
        });

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "contabil.responsibles",
            referring_id: responsible.id,
            changes: "{}"
        })

        return responsible;
    }

    // 2. Atualizar (clássico, via PUT)
    public async update(my_id: string, id: string, data: ResponsibleDTO) {
        const {
            client_id,
            person_responsible_id,
            posted_by_id,
            customer_with_movement,
        } = data;

        const exists = await this.prisma.responsibleContabil.findFirst({ where:{ id } })
        if (!exists)
            throw new Error("Não esta cadastrado")

        const updated = await this.prisma.responsibleContabil.update({
            where: { id },
            data: {
                client_id,
                person_responsible_id: person_responsible_id || "",
                posted_by_id: posted_by_id || "",
                customer_with_movement: customer_with_movement || false,
            },
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id,
            action: "Atualização",
            referring: "contabil.responsibles",
            referring_id: id,
            oldData: exists,
            updatedData: updated,
        })

        return updated;
    }

    // 3. Buscar por ID do Cliente
    public async getByClientId(clientId: string) {
        const responsible = await this.prisma.responsibleContabil.findFirst({
            where: { client_id: clientId },
        });
        
        if (!responsible) {
            throw new Error("Registro de responsáveis não encontrado para este cliente.");
        }
        return responsible;
    }

    // 4. Deletar
    public async delete(id: string) {
        await this.prisma.responsibleContabil.delete({
            where: { id },
        });
        return { message: "Registro deletado com sucesso." };
    }
}

export { ResponsibleContabilService };