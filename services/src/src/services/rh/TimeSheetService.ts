import prismaClient from "../../prisma";

class TimeSheetService {
    
    // 1. Criar Folha (Já existia, só garantindo)
    // Criar Folha Mensal
    async createTimeSheet(user_id: string, start_time: Date, end_time: Date) {
        // Verifica se já existe folha nesse período para evitar duplicação
        const exists = await prismaClient.timeSheets.findFirst({
            where: {
                user_id,
                start_time,
                end_time
            }
        });

        if (exists) throw new Error("Folha já gerada para este período.");

        return await prismaClient.timeSheets.create({
            data: { user_id, start_time, end_time }
        });
    }

    // 2. Listar Folhas do Usuário
    async listTimeSheets(user_id: string) {
        return await prismaClient.timeSheets.findMany({
            where: { user_id },
            orderBy: { start_time: 'desc' }
        });
    }

    // 3. Assinar Folha (Réplica do 'assinarFolha' do PHP)
    async signTimeSheet(timeSheetId: string, signature: string) {
        const sheet = await prismaClient.timeSheets.findUnique({ where: { id: timeSheetId } });
        if (!sheet) throw new Error("Folha não encontrada");
        
        if (sheet.signature) throw new Error("Folha já assinada.");

        // Atualiza a assinatura
        const updated = await prismaClient.timeSheets.update({
            where: { id: timeSheetId },
            data: { signature }
        });

        // Opcional: Lógica do PHP que aprovava horas do banco automaticamente ao assinar
        // Você pode chamar aqui o método approveRelease se necessário.

        return updated;
    }

    // Lançamento manual no Banco de Horas (TimeBankReleases)
    // Ex: Pagar hora extra em dinheiro (subtrai) ou abono (soma)
    async releaseTimeBank(data: { user_id: string, date: Date, minutes: number, reason: string, added_by: string }) {
        const release = await prismaClient.timeBankReleases.create({
            data: {
                user_id: data.user_id,
                date: data.date,
                hours: data.minutes, // schema chama de 'hours' mas salvamos minutos int
                reason: data.reason,
                is_approved: false,
                added_by_user_id: data.added_by
            }
        });
        return release;
    }

    // Aprovar Lançamento e impactar saldo global
    async approveRelease(id: string) {
        const release = await prismaClient.timeBankReleases.findUnique({ where: { id } });
        if (!release || release.is_approved) throw new Error("Lançamento inválido ou já aprovado");

        // Atualiza status
        await prismaClient.timeBankReleases.update({
            where: { id },
            data: { is_approved: true }
        });

        // Impacta o saldo global do usuário
        await prismaClient.pointsConfig.update({
            where: { user_id: release.user_id },
            data: {
                bank_balance: { increment: release.hours }
            }
        });

        return { message: "Aprovado e saldo atualizado" };
    }
}

export { TimeSheetService };