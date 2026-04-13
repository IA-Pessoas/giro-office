import cron from "node-cron"
import prismaClient from "../../prisma"
import { LogService } from '../LogService'

interface CreateRequest {
    my_id: string
    name: string
    cnpj: string
    base_date?: Date
}
interface UpdateRequest extends CreateRequest {
    union_id: string
}

class UnionService {
    async create({ my_id, name, cnpj, base_date }: CreateRequest) {
        const exists = await prismaClient.unionPessoal.findFirst({
            where: { name, cnpj, base_date }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const create = await prismaClient.unionPessoal.create({
            data:{
                name,
                cnpj,
                base_date,
            },
            select:{
                id: true,
                name: true,
                cnpj: true,
                base_date: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "pessoal.union",
            referring_id: create.id,
            changes: "{}",
            dep: "pessoal"
        })

        return { create }
    }
    async update({ my_id, union_id, name, cnpj, base_date }: UpdateRequest) {
        try {
            const exists = await prismaClient.unionPessoal.findFirst({
                where: {
                    id: union_id
                }
            })
            if (!exists) {
                throw new Error("Não existe")
            }

            const updated = await prismaClient.unionPessoal.update({
                where: { id: union_id },
                data: {
                    name, 
                    cnpj,
                    base_date,
                },
                select: {
                    name: true,
                    cnpj: true,
                    base_date: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "pessoal.union",
                referring_id: union_id,
                oldData: exists,
                updatedData: updated,
                dep: "pessoal"
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async detail(union_id: string) {
        const detail = await prismaClient.unionPessoal.findFirst({
            where:{
                id: union_id
            },
            select:{
                id: true,
                name: true,
                cnpj: true,
                base_date: true,
            }
        })
        return { detail }
    }
    async list() {
        const list = await prismaClient.unionPessoal.findMany({
            select:{
                id: true,
                name: true,
                cnpj: true,
                base_date: true,
            },
            orderBy: {
                name: 'asc'
            }
        })
        return list
    }
    async dueDateNotification() {
        const runRoutine = async () => {
            console.log(`[${new Date().toISOString()}] Executando rotina de aniversário de sindicatos...`);

            try {                
                // -- 1. Filtros
                const today = new Date();
                
                // Data de "Amanhã" (DATE_ADD(CURDATE(), INTERVAL 1 DAY))
                const tomorrow = new Date(today);
                tomorrow.setDate(today.getDate() + 1);
                
                // Data de "Um mês atrás de amanhã" (lógica estranha do PHP, mas replicada)
                const oneMonthAgoFromTomorrow = new Date(tomorrow);
                oneMonthAgoFromTomorrow.setMonth(tomorrow.getMonth() - 1);

                // Pegamos o Mês e Dia (formato 1-12 para Mês, 1-31 para Dia)
                const tomorrowMonth = tomorrow.getMonth() + 1;
                const tomorrowDay = tomorrow.getDate();
                
                const monthAgoMonth = oneMonthAgoFromTomorrow.getMonth() + 1;
                const monthAgoDay = oneMonthAgoFromTomorrow.getDate();

                // --- 2. Buscar usuários do Depto Pessoal (Corrigido) ---
                const usersToNotify = await prismaClient.user.findMany({
                    where: {
                        department: { // Assumindo que o model User tem relação com Department
                            name: "Pessoal"
                        },
                        status: "Ativo"
                    },
                    select: { id: true }
                });

                if (usersToNotify.length === 0) {
                    console.log("Nenhum usuário no 'Pessoal' para notificar.");
                    return;
                }

                // --- 3. Busca 1: Aniversários de AMANHÃ ---
                // (Usamos $queryRaw para replicar MONTH() e DAY() do SQL)
                const unionsTomorrow: any[] = await prismaClient.$queryRaw`
                    SELECT id, name, base_date FROM "pessoal.union" 
                    WHERE MONTH(base_date) = ${tomorrowMonth}
                    AND DAY(base_date) = ${tomorrowDay}
                `;

                // --- 4. Busca 2: Aniversários do MÊS PASSADO (relativo a amanhã) ---
                const unionsMonthAgo: any[] = await prismaClient.$queryRaw`
                    SELECT id, name, base_date FROM "pessoal.union"
                    WHERE MONTH(base_date) = ${monthAgoMonth}
                    AND DAY(base_date) = ${monthAgoDay}
                `;

                // --- 5. Processar e Criar Notificações ---
                // Helper para evitar duplicar código
                const createNotifications = async (union: any, title: string, message: string) => {
                    for (const user of usersToNotify) {
                        // Verificamos se a *notificação* já existe
                        const notificationExists = await prismaClient.pessoalNotification.findFirst({
                            where: {
                                user_id: user.id,
                                regarding_id: union.id,
                                title: title
                            }
                        });

                        // Só cria se a notificação não existir
                        if (!notificationExists) {
                            await prismaClient.pessoalNotification.create({
                                data: {
                                    user_id: user.id,
                                    regarding: 'union',
                                    regarding_id: union.id,
                                    title: title,
                                    message: message
                                }
                            });
                        }
                    }
                };

                // Processa a lista 1
                for (const s of unionsTomorrow) {
                    await createNotifications(s, 'Sindicato prestes a vencer', 'Data base vai ser alcançada amanhã');
                }

                // Processa a lista 2
                for (const s of unionsMonthAgo) {
                    await createNotifications(s, 'Sindicato vencido', 'Data base vai ser alcançada amanhã referente ao mês passado');
                }

                console.log(`[${new Date().toISOString()}] Rotina de Sindicatos executada com sucesso!`);

            } catch (error) {
                console.error(`[${new Date().toISOString()}] Erro ao executar rotina:`, error);
            }
        };

        // Roda a rotina às 6 da manhã, fuso SP
        cron.schedule("* 6 * * *", runRoutine, {
            timezone: "America/Sao_Paulo",
        });
    }
}

export { UnionService }