import prismaClient from "../../prisma";
import { TimeUtils } from "../../utils/TimeUtils";
import { LogService } from "../LogService"; // Assumindo que existe

class PointService {

    // Função principal: Bater Ponto (registrarPonto do PHP)
    async registerPoint(user_id: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        // Busca se já existe registro hoje
        let point = await prismaClient.point.findFirst({
            where: {
                user_id,
                clock_in: { gte: today, lte: endOfDay }
            }
        });

        const now = new Date();
        let action = "";

        if (!point) {
            // 1. Entrada
            point = await prismaClient.point.create({
                data: { user_id, clock_in: now }
            });
            action = "Entrada";
        } else if (!point.lunch_out) {
            // Validação de 30 min (do PHP)
            if (TimeUtils.diffMinutes(point.clock_in, now) < 30) throw new Error("Intervalo mínimo entre registros não respeitado.");
            
            // 2. Saída Almoço
            point = await prismaClient.point.update({ where: { id: point.id }, data: { lunch_out: now } });
            action = "Saída Almoço";
        } else if (!point.launch_in) {
            if (TimeUtils.diffMinutes(point.lunch_out, now) < 30) throw new Error("Intervalo mínimo entre registros não respeitado.");
            
            // 3. Volta Almoço
            point = await prismaClient.point.update({ where: { id: point.id }, data: { launch_in: now } });
            action = "Volta Almoço";
        } else if (!point.clock_out) {
            if (TimeUtils.diffMinutes(point.launch_in, now) < 30) throw new Error("Intervalo mínimo entre registros não respeitado.");
            
            // 4. Saída
            point = await prismaClient.point.update({ where: { id: point.id }, data: { clock_out: now } });
            action = "Saída";
            
            // Ao fechar o ponto, calculamos as horas do dia
            await this.calculateDailyHours(point.id);
        } else {
            throw new Error("Todos os registros do dia já foram preenchidos.");
        }

        return { message: `Ponto registrado: ${action}`, point };
    }

    // Cálculo de horas (calcHorasPonto do PHP)
    async calculateDailyHours(pointId: string) {
        const point = await prismaClient.point.findUnique({ where: { id: pointId } });
        if (!point || !point.clock_in || !point.clock_out) return; // Precisa ter fechado o dia

        const config = await prismaClient.pointsConfig.findUnique({ where: { user_id: point.user_id } });
        if (!config) return;

        // 1. Minutos trabalhados reais
        // (Nota: se lunch_out ou launch_in forem nulos, a TimeUtils deve tratar ou assumir 0 intervalo, 
        // mas idealmente o ponto deve estar completo)
        const morningMinutes = TimeUtils.diffMinutes(point.clock_in, point.lunch_out);
        const afternoonMinutes = TimeUtils.diffMinutes(point.launch_in, point.clock_out);
        const totalWorkedMinutes = morningMinutes + afternoonMinutes;


        // 2. VERIFICAÇÃO DE FERIADO
        const pointDate = new Date(point.clock_in);
        const startOfDay = new Date(pointDate.setHours(0,0,0,0));
        const endOfDay = new Date(pointDate.setHours(23,59,59,999));

        const isHoliday = await prismaClient.holidays.findFirst({
            where: {
                date: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            }
        });

        let expectedMinutes = 0;

        if (isHoliday) {
            // Se for feriado, a expectativa de trabalho é ZERO.
            // Assim, se ele não trabalhou, o saldo é 0.
            // Se ele trabalhou, tudo conta como positivo (hora extra).
            expectedMinutes = 0;
            console.log(`Cálculo para o dia ${startOfDay.toISOString()}: É FERIADO (${isHoliday.name}). Expectativa zerada.`);
        } else {
            // Se NÃO for feriado, calcula a expectativa baseada na configuração
            expectedMinutes = 
                (TimeUtils.timeStringToMinutes(config.lunch_break) - TimeUtils.timeStringToMinutes(config.start_time)) +
                (TimeUtils.timeStringToMinutes(config.end_time) - TimeUtils.timeStringToMinutes(config.lunch_return));
            
            // TODO: Aqui futuramente você pode verificar se é Fim de Semana (work_days) 
            // para também zerar a expectativa se for Sábado/Domingo não trabalhado.
        }

        // 3. Saldo do dia
        const dayBalance = totalWorkedMinutes - expectedMinutes;

        // 4. Atualiza o registro do dia
        await prismaClient.point.update({
            where: { id: pointId },
            data: {
                workload_hours: totalWorkedMinutes,
                time_bank_balance: dayBalance
            }
        });

        // 5. Atualiza o Banco de Horas Global
        await prismaClient.pointsConfig.update({
            where: { user_id: point.user_id },
            data: {
                bank_balance: { increment: dayBalance }
            }
        });
    }

    // Solicitação de Ajuste (TimeClockRequest)
    async requestAdjustment(data: { user_id: string, point_id: string, clock_in: Date, lunch_out: Date, launch_in: Date, clock_out: Date, justification: string }) {
        return await prismaClient.timeClockRequest.create({
            data: {
                ...data,
                status: 'Pendente'
            }
        });
    }

    // Aprovar Ajuste
    async approveAdjustment(requestId: string, approver_id: string) {
        const request = await prismaClient.timeClockRequest.findUnique({ where: { id: requestId } });
        if (!request) throw new Error("Solicitação não encontrada");

        // 1. Atualiza o Ponto original
        await prismaClient.point.update({
            where: { id: request.point_id },
            data: {
                clock_in: request.clock_in,
                lunch_out: request.lunch_out,
                launch_in: request.launch_in,
                clock_out: request.clock_out
            }
        });

        // 2. Recalcula horas do dia e banco
        // Nota: Isso precisa de lógica extra para desfazer o saldo anterior do banco antes de somar o novo, 
        // mas para simplificar, chamamos o recalculo.
        await this.calculateDailyHours(request.point_id); 

        // 3. Atualiza status da solicitação
        return await prismaClient.timeClockRequest.update({
            where: { id: requestId },
            data: { status: 'Aprovado', approver_id }
        });
    }
}

export { PointService };