import cron from "node-cron"

import prismaClient from "../../prisma"
import { LogService } from '../LogService'

interface CreateRequest {
    my_id: string
    code: string
    name: string
    sex: string
    address: string
    city: string
    zip_code: string
    state: string
    profession: string
    father: string
    mother: string
    marital_status: string
    date_of_birth: Date
    cpf: string
    rg: string
    rg_expedition?: Date
    rg_validity?: Date
    military_certificate: string
    ctps: string
    cnh: string
    cnh_expedition?: Date
    cnh_validity?: Date
    spouse: string
    notes: string
    status: string
}
interface UpdateRequest extends CreateRequest {
    id: string
}

class ClientPFService {
    async create({ 
        my_id,
        code,
        name,
        sex,
        address,
        city,
        zip_code,
        state,
        profession,
        father,
        mother,
        marital_status,
        date_of_birth,
        cpf,
        rg,
        rg_expedition,
        rg_validity,
        military_certificate,
        ctps,
        cnh,
        cnh_expedition,
        cnh_validity,
        spouse,
        notes,
        status
    }: CreateRequest) {
        const exists = await prismaClient.clientPF.findFirst({
            where: { 
                OR: [
                    { code }, 
                    { cpf },
                    { rg }
                ]
            }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const create = await prismaClient.clientPF.create({
            data:{ 
                code,
                name,
                sex,
                address,
                city,
                zip_code,
                state,
                profession,
                father,
                mother,
                marital_status,
                date_of_birth,
                cpf,
                rg,
                rg_expedition,
                rg_validity,
                military_certificate,
                ctps,
                cnh,
                cnh_expedition,
                cnh_validity,
                spouse,
                notes,
                status
            },
            select:{
                id: true,
                code: true,
                name: true,
                sex: true,
                address: true,
                city: true,
                zip_code: true,
                state: true,
                profession: true,
                father: true,
                mother: true,
                marital_status: true,
                date_of_birth: true,
                cpf: true,
                rg: true,
                rg_expedition: true,
                rg_validity: true,
                military_certificate: true,
                ctps: true,
                cnh: true,
                cnh_expedition: true,
                cnh_validity: true,
                spouse: true,
                notes: true,
                status: true
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "regularize.pf",
            referring_id: create.id,
            changes: "{}",
            dep: "regularize"
        })

        return { create }
    }
    async update({ 
        my_id,
        id,
        code,
        name,
        sex,
        address,
        city,
        zip_code,
        state,
        profession,
        father,
        mother,
        marital_status,
        date_of_birth,
        cpf,
        rg,
        rg_expedition,
        rg_validity,
        military_certificate,
        ctps,
        cnh,
        cnh_expedition,
        cnh_validity,
        spouse,
        notes,
        status
    }: UpdateRequest) {
        try {
            const exists = await prismaClient.clientPF.findFirst({ where: { id } })
            if (!exists) throw new Error("Não existe")

            const updated = await prismaClient.clientPF.update({
                where: { id },
                data: { 
                    code,
                    name,
                    sex,
                    address,
                    city,
                    zip_code,
                    state,
                    profession,
                    father,
                    mother,
                    marital_status,
                    date_of_birth,
                    cpf,
                    rg,
                    rg_expedition,
                    rg_validity,
                    military_certificate,
                    ctps,
                    cnh,
                    cnh_expedition,
                    cnh_validity,
                    spouse,
                    notes,
                    status
                },
                select: {
                    id: true,
                    code: true,
                    name: true,
                    sex: true,
                    address: true,
                    city: true,
                    zip_code: true,
                    state: true,
                    profession: true,
                    father: true,
                    mother: true,
                    marital_status: true,
                    date_of_birth: true,
                    cpf: true,
                    rg: true,
                    rg_expedition: true,
                    rg_validity: true,
                    military_certificate: true,
                    ctps: true,
                    cnh: true,
                    cnh_expedition: true,
                    cnh_validity: true,
                    spouse: true,
                    notes: true,
                    status: true
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "regularize.clientPF",
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
        const detail = await prismaClient.clientPF.findFirst({
            where:{ id },
            select: {
                id: true,
                code: true,
                name: true,
                sex: true,
                address: true,
                city: true,
                zip_code: true,
                state: true,
                profession: true,
                father: true,
                mother: true,
                marital_status: true,
                date_of_birth: true,
                cpf: true,
                rg: true,
                rg_expedition: true,
                rg_validity: true,
                military_certificate: true,
                ctps: true,
                cnh: true,
                cnh_expedition: true,
                cnh_validity: true,
                spouse: true,
                notes: true,
                status: true
            }
        })
        return { detail }
    }
    public async list(status: string) {
        const list = await prismaClient.clientPF.findMany({
            where: { status },
            select: {
                id: true,
                code: true,
                name: true, 
                cpf: true,
            },
            orderBy: {
                name: 'asc',
            },
        });
        return list;
    }
    async dueDateNotification() {
        const runRoutine = async () => {
            console.log(`[${new Date().toISOString()}] Executando rotina de documentos PF vencidos...`);

            try {
                const usersToNotify = await prismaClient.permission.findMany({
                    where: {
                        regularize: 2,
                        AND: {
                            user: {
                                status: 'Ativo'
                            }
                        }
                    },
                    select: { id: true, user_id: true }
                });

                if (usersToNotify.length === 0) {
                    console.log("Nenhum usuário no 'Regularize' para notificar.");
                    return;
                }

                const today = new Date();
                today.setHours(0, 0, 0, 0); // Compara com a meia-noite de hoje

                const expiredRGs = await prismaClient.clientPF.findMany({
                    where: {
                        rg_validity: {
                            lt: today // 'lt' (less than) = "já venceu"
                        }
                    },
                    select: { id: true, name: true, rg_validity: true } 
                });

                const expiredCNHs = await prismaClient.clientPF.findMany({
                    where: {
                        cnh_validity: {
                            lt: today
                        }
                    },
                    select: { id: true, name: true, cnh_validity: true }
                });

                const createNotifications = async (client: any, title: string, message: string) => {
                    for (const user of usersToNotify) {
                        
                        const notificationExists = await prismaClient.pessoalNotification.findFirst({
                            where: {
                                user_id: user.id,
                                regarding_id: client.id,
                                title: title
                            }
                        });

                        if (!notificationExists) {
                            await prismaClient.regularizeNotification.create({
                                data: {
                                    user_id: user.id,
                                    regarding: 'clientPF', // Atualizado para o novo contexto
                                    regarding_id: client.id,
                                    title: title,
                                    message: message
                                }
                            });
                        }
                    }
                };

                for (const client of expiredRGs) {
                    if (client.rg_validity) {
                        const title = `RG Vencido: ${client.name}`;
                        const message = `O RG do cliente ${client.name} venceu em ${client.rg_validity.toLocaleDateString('pt-BR')}.`;
                        await createNotifications(client, title, message);
                    }
                }

                for (const client of expiredCNHs) {
                    if (client.cnh_validity) {
                        const title = `CNH Vencida: ${client.name}`;
                        const message = `A CNH do cliente ${client.name} venceu em ${client.cnh_validity.toLocaleDateString('pt-BR')}.`;
                        await createNotifications(client, title, message);
                    }
                }

                console.log(`[${new Date().toISOString()}] Rotina de Sindicatos executada com sucesso!`);

            } catch (error) {
                console.error(`[${new Date().toISOString()}] Erro ao executar rotina:`, error);
            }
        };

        // Roda a rotina às 6 da manhã, fuso SP
        cron.schedule("30 5 * * *", runRoutine, {
            timezone: "America/Sao_Paulo",
        });
    }
    async statusRoutine() {
        const runRoutine = async () => {
            console.log(`[${new Date().toISOString()}] Executando rotina de clientes pf inativos...`);

            try {
                const clients = await prismaClient.clientPF.findMany({
                    where: {
                        status: 'Ativo'
                    },
                    select: { id: true } 
                });

                for (const client of clients) {
                    const partners = await prismaClient.partners.findMany({
                        where: { pf_id: client.id, exit: null },
                        select: { id: true }
                    });

                    if (partners.length === 0) {
                        await prismaClient.clientPF.update({
                            where: { id: client.id },
                            data: { status: 'Inativo' }
                        });
                    }
                }

                console.log(`[${new Date().toISOString()}] Rotina de clientes pf inativos concluída!`);

            } catch (error) {
                console.error(`[${new Date().toISOString()}] Erro ao executar rotina:`, error);
            }
        };

        // Roda a rotina às 5 da manhã, fuso SP
        cron.schedule("* 5 * * *", runRoutine, {
            timezone: "America/Sao_Paulo",
        });
    }
}

export { ClientPFService }