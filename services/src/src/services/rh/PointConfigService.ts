import prismaClient from "../../prisma";

interface ConfigDTO {
    user_id: string;
    start_time: string;
    lunch_break: string;
    lunch_return: string;
    end_time: string;
    work_days?: string;
}

class PointConfigService {
    
    // Cria ou Atualiza a configuração
    async upsert(data: ConfigDTO) {
        const config = await prismaClient.pointsConfig.upsert({
            where: { user_id: data.user_id },
            update: {
                start_time: data.start_time,
                lunch_break: data.lunch_break,
                lunch_return: data.lunch_return,
                end_time: data.end_time,
                work_days: data.work_days
            },
            create: {
                user_id: data.user_id,
                start_time: data.start_time,
                lunch_break: data.lunch_break,
                lunch_return: data.lunch_return,
                end_time: data.end_time,
                work_days: data.work_days || "1,2,3,4,5"
            }
        });
        return config;
    }

    // Busca configuração
    async getByUserId(user_id: string) {
        return await prismaClient.pointsConfig.findUnique({ where: { user_id } });
    }
}

export { PointConfigService };