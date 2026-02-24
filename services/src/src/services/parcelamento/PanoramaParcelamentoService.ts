import { PrismaClient } from "@prisma/client";
import { LogService } from '../LogService'

interface CreateDTO {
    my_id: string;
    clientId: string;
    competence: string;
}

interface UpdateFieldDTO {
    id: string;
    my_id: string;
    data: { [key: string]: boolean | string };
}

const updatableFields: Set<string> = new Set([
    'cnd_municipal',
    'cnd_state',
    'cnd_federal',
    'cnd_fgts',
    'cnd_labor',
    'protests',
    'state_tax_situation',
    'federal_tax_situation',
    'responsavel_id',
]);

class PanoramaParcelamentoService {
    private prisma = new PrismaClient();

    public async create({ my_id, clientId, competence }: CreateDTO) {
        if (!clientId || !competence) {
            throw new Error("Cliente ID e Competência são obrigatórios.");
        }

        let control = await this.prisma.panoramaParcelameto.findFirst({
            where: {
                client_id: clientId,
                competence,
            },
        });

        if (!control) {
            control = await this.prisma.panoramaParcelameto.create({
                data: {
                    client_id: clientId,
                    competence,
                    cnd_municipal: false,
                    cnd_state: false,
                    cnd_federal: false,
                    cnd_fgts: false,
                    cnd_labor: false,
                    protests: false,
                    state_tax_situation: false,
                    federal_tax_situation: false
                },
            });
            
            const ls = new LogService()
            await ls.createLog({
                my_id,
                action: "Cadastro",
                referring: "parcelamento.panorama",
                referring_id: control.id,
                changes: "{}"
            })
        }

        return control;
    }

    public async detail(clientId: string, competence: string) {
        if (!clientId || !competence) {
            throw new Error("Cliente ID e Competência são obrigatórios.");
        }

        const control = await this.prisma.panoramaParcelameto.findFirst({
            where: {
                client_id: clientId,
                competence: competence,
            },
        });

        return control;
    }

    public async updateField({ my_id, id, data }: UpdateFieldDTO) {
        const field = Object.keys(data)[0];
        const value = data[field];

        if (!field || !updatableFields.has(field)) {
            throw new Error(`Campo '${field}' é inválido ou não pode ser atualizado.`);
        }

        const exists = await this.prisma.panoramaParcelameto.findFirst({ where:{ id } })
        if (!exists)
            throw new Error("Não esta cadastrado")

        const updated = await this.prisma.panoramaParcelameto.update({
            where: { id },
            data: {
                [field]: value,
            },
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id,
            action: "Atualização",
            referring: "parcelamento.panorama",
            referring_id: id,
            oldData: exists,
            updatedData: updated,
        })

        return updated;
    }

    public async comp(my_id: string, competence: string) {
        if (!competence) {
            throw new Error("Competência é obrigatória.");
        }


        const clients = await this.prisma.client.findMany({
            where: {
                status: 'Ativo',
            },
            select: {
                id: true,
            },
        });

        clients.map(async (client) => {
            await this.create({ my_id, clientId: client.id, competence });
        });

        return { res: 'gerado!' };
    }
}

export { PanoramaParcelamentoService };