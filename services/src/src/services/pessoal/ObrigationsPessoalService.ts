import prismaClient from "../../prisma";
import { LogService } from '../LogService'

interface CreateDTO {
    my_id: string;
    clientId: string;
    competence: string;
}

interface UpdateFieldDTO {
    id: string;
    my_id: string;
    data: { [key: string]: boolean | string | null };
}

const updatableFields: Set<string> = new Set([
    'advance',
    'payroll',
    'charges',
    'assistance_fee',
    'responsavel_id',
    'bem_mais',
    'bsf',
    'va',
    'vt',
]);

class ObrigationsPessoalService {
    private prisma = prismaClient;

    public async create({ my_id, clientId, competence }: CreateDTO) {
        if (!clientId || !competence)
            throw new Error("Cliente ID e Competência são obrigatórios.");

        let control = await this.prisma.obrigationsPessoal.findFirst({
            where: { client_id: clientId, competence },
        });

        if (!control) {
            const payrollSearch = await this.prisma.payroll.findFirst({ where: { client_id: clientId } });
            if (payrollSearch) {    
                let advance = (payrollSearch?.advance === true) ? false : null
                let assistance_fee = (payrollSearch?.assistance_fee === true) ? false : null
                let responsavel_id = (payrollSearch?.responsible_id) ? payrollSearch?.responsible_id : null
                let bem_mais = (payrollSearch?.bem_mais === true) ? false : null
                let bsf = (payrollSearch?.bsf === true) ? false : null
                let va = (payrollSearch?.va === true) ? false : null
                let vt = (payrollSearch?.vt === true) ? false : null

                control = await this.prisma.obrigationsPessoal.create({
                    data: {
                        client_id: clientId,
                        competence,
                        advance,
                        payroll: false,
                        charges: false,
                        assistance_fee,
                        responsavel_id,
                        bem_mais,
                        bsf,
                        va,
                        vt,
                    }
                })
                
                const ls = new LogService()
                await ls.createLog({
                    my_id,
                    action: "Cadastro",
                    referring: "pessoal.obrigations",
                    referring_id: control.id,
                    changes: "{}",
                    dep: "pessoal"
                })
            }
        }

        return control;
    }

    public async detail(clientId: string, competence: string) {
        if (!clientId || !competence) {
            throw new Error("Cliente ID e Competência são obrigatórios.");
        }

        const control = await this.prisma.obrigationsPessoal.findFirst({
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

        const exists = await this.prisma.obrigationsPessoal.findFirst({ where:{ id } })
        if (!exists)
            throw new Error("Não esta cadastrado")

        const updated = await this.prisma.obrigationsPessoal.update({
            where: { id },
            data: {
                [field]: value,
            },
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id,
            action: "Atualização",
            referring: "pessoal.obrigations",
            referring_id: id,
            oldData: exists,
            updatedData: updated,
            dep: "pessoal"
        })

        return updated;
    }

    public async comp(my_id: string, competence: string) {
        if (!competence) {
            throw new Error("Competência é obrigatória.");
        }

        const clients = await this.prisma.client.findMany({
            where: { status: 'Ativo' },
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

export { ObrigationsPessoalService };