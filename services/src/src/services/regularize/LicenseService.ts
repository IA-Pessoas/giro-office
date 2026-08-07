import cron from "node-cron"

import prismaClient from "../../prisma";
import { LogService } from '../LogService';

interface CreateLicenseRequest {
    my_id: string;
    client_id?: string;
    has: boolean;
    type_license: string;
    entry_date: Date | string;
    protocol: string;
    responsible_id?: string;
    status: string;
    date_last_consultation?: Date | string;
    current_situation: string;
    contact: string;
    observation?: string;
    urgency: string;
    type: string;
    due_date?: Date | string;
    task_id?: string;
}

interface UpdateLicenseRequest extends CreateLicenseRequest {
    id: string;
}

class LicenseService {    
    async create({
        my_id,
        client_id,
        has,
        type_license,
        entry_date,
        protocol,
        responsible_id,
        status,
        date_last_consultation,
        current_situation,
        contact,
        observation,
        urgency,
        type,
        due_date,
        task_id
    }: CreateLicenseRequest) {
        
        // Verificação simples: Se já existe um alvará com este protocolo para este cliente
        const exists = await prismaClient.license.findFirst({
            where: { 
                protocol: protocol,
                client_id: client_id // Opcional: remover se o protocolo for único globalmente
            }
        });

        if (exists) {
            throw new Error("Alvará com este protocolo já cadastrado");
        }

        const create = await prismaClient.license.create({
            data: {
                client_id,
                has,
                type_license,
                entry_date: new Date(entry_date), // Garante conversão
                protocol,
                responsible_id,
                status,
                date_last_consultation: date_last_consultation ? new Date(date_last_consultation) : null,
                current_situation,
                contact,
                observation,
                urgency,
                type,
                due_date: due_date ? new Date(due_date) : null,
                task_id
            }
        });

        const ls = new LogService();
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "regularize.license",
            referring_id: create.id,
            changes: "{}",
            dep: "regularize"
        });

        return create;
    }

    async update({
        my_id,
        id,
        client_id,
        has,
        type_license,
        entry_date,
        protocol,
        responsible_id,
        status,
        date_last_consultation,
        current_situation,
        contact,
        observation,
        urgency,
        type,
        due_date,
        task_id
    }: UpdateLicenseRequest) {
        try {
            const exists = await prismaClient.license.findUnique({ where: { id } });
            if (!exists) throw new Error("Alvará não encontrado");

            const updated = await prismaClient.license.update({
                where: { id },
                data: {
                    client_id,
                    has,
                    type_license,
                    entry_date: new Date(entry_date),
                    protocol,
                    responsible_id,
                    status,
                    date_last_consultation: date_last_consultation ? new Date(date_last_consultation) : null,
                    current_situation,
                    contact,
                    observation,
                    urgency,
                    type,
                    due_date: due_date ? new Date(due_date) : null,
                    task_id
                }
            });

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "regularize.license",
                referring_id: id,
                oldData: exists,
                updatedData: updated,
                dep: "regularize"
            });

            return updated;

        } catch (error) {
            console.log(error);
            throw new Error("Erro ao atualizar Alvará");
        }
    }

    async detail(id: string) {
        const detail = await prismaClient.license.findUnique({
            where: { id },
            include: {
                client: { select: { name: true } }, // Inclui nome do cliente se necessário
                responsible: { select: { name: true } } // Inclui nome do responsável
            }
        });
        return detail;
    }

    async list(status: string) {
        const list = await prismaClient.license.findMany({
            where: { status },
            orderBy: { entry_date: 'desc' }
        });
        return list;
    }

    async licenseDueDateNotification() {
        const runRoutine = async () => {
            console.log(`[${new Date().toISOString()}] Executando rotina de Alvarás (Vencidos e A Vencer)...`);

            try {
                // 1. Usuários do 'Regularize'
                const usersToNotify = await prismaClient.permission.findMany({
                    where: {
                        regularize: 2, 
                        user: { status: 'Ativo' }
                    },
                    select: { user_id: true }
                });

                if (usersToNotify.length === 0) return;

                // 2. Configurar Datas
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Hoje zerado

                const thirtyDaysFromNow = new Date(today);
                thirtyDaysFromNow.setDate(today.getDate() + 30); // Hoje + 30 dias

                // 3. Busca 1: JÁ VENCIDOS (Anterior a hoje)
                const expiredLicenses = await prismaClient.license.findMany({
                    where: {
                        due_date: { lt: today }, // Menor que hoje
                        client: { status: 'Ativo' }
                    },
                    include: { client: { select: { name: true } } }
                });

                // 4. Busca 2: A VENCER (Entre hoje e 30 dias)
                const upcomingLicenses = await prismaClient.license.findMany({
                    where: {
                        due_date: {
                            gte: today,             // Maior ou igual a hoje
                            lte: thirtyDaysFromNow  // Menor ou igual a 30 dias
                        },
                        client: { status: 'Ativo' }
                    },
                    include: { client: { select: { name: true } } }
                });

                // 5. Helper de Notificação
                const createNotifications = async (license: any, title: string, message: string) => {
                    for (const permission of usersToNotify) {
                        // Evita duplicidade (mesmo título/usuário/alvará)
                        const exists = await prismaClient.regularizeNotification.findFirst({
                            where: {
                                user_id: permission.user_id,
                                regarding_id: license.id,
                                title: title // Importante: O título diferencia "Vencido" de "A Vencer"
                            }
                        });

                        if (!exists) {
                            await prismaClient.regularizeNotification.create({
                                data: {
                                    user_id: permission.user_id,
                                    regarding: 'regularize.license',
                                    regarding_id: license.id,
                                    title: title,
                                    message: message
                                }
                            });
                        }
                    }
                };

                // 6. Processar VENCIDOS
                for (const license of expiredLicenses) {
                    if (license.due_date && license.client) {
                        const title = `ALVARÁ VENCIDO: ${license.type_license}`;
                        const dateStr = new Date(license.due_date).toLocaleDateString('pt-BR');
                        const msg = `O alvará do cliente ${license.client.name} VENCEU em ${dateStr}.`;
                        
                        await createNotifications(license, title, msg);
                    }
                }

                // 7. Processar A VENCER (Próximos 30 dias)
                for (const license of upcomingLicenses) {
                    if (license.due_date && license.client) {
                        const title = `ALVARÁ A VENCER: ${license.type_license}`;
                        const dateStr = new Date(license.due_date).toLocaleDateString('pt-BR');
                        
                        // Calcula quantos dias faltam (opcional, para deixar a mensagem bonita)
                        const diffTime = new Date(license.due_date).getTime() - today.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

                        const msg = `O alvará do cliente ${license.client.name} vence em ${diffDays} dias (${dateStr}).`;
                        
                        await createNotifications(license, title, msg);
                    }
                }

                console.log(`[${new Date().toISOString()}] Rotina de Alvarás finalizada.`);

            } catch (error) {
                console.error(`Erro na rotina de Alvarás:`, error);
            }
        };

        // Roda todo dia às 04:30
        cron.schedule("30 4 * * *", runRoutine, {
            timezone: "America/Sao_Paulo",
        });
    }
}

export { LicenseService };