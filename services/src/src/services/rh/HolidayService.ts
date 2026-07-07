import prismaClient from "../../prisma";
import { LogService } from "../LogService";

interface HolidayDTO {
    my_id: string;
    name: string;
    date: string | Date; // Aceita string ISO
}

interface UpdateHolidayDTO extends HolidayDTO {
    id: string;
}

class HolidayService {
    // 1. Criar Feriado
    async create({ my_id, name, date }: HolidayDTO) {
        const holidayDate = new Date(date);
        
        // Verifica se já existe feriado nessa data para evitar duplicação
        const startOfDay = new Date(holidayDate.setHours(0,0,0,0));
        const endOfDay = new Date(holidayDate.setHours(23,59,59,999));

        const exists = await prismaClient.holidays.findFirst({
            where: {
                date: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            }
        });

        if (exists) {
            throw new Error(`Já existe um feriado cadastrado nesta data: ${exists.name}`);
        }

        const holiday = await prismaClient.holidays.create({
            data: {
                name,
                date: new Date(date)
            }
        });

        const ls = new LogService();
        await ls.createLog({
            my_id,
            action: "Cadastro Feriado",
            referring: "rh.holidays",
            referring_id: holiday.id,
            changes: `Feriado: ${name}`,
            dep: "rh"
        });

        return holiday;
    }

    // 2. Atualizar Feriado
    async update({ my_id, id, name, date }: UpdateHolidayDTO) {
        const exists = await prismaClient.holidays.findUnique({ where: { id } });
        if (!exists) throw new Error("Feriado não encontrado");

        const updated = await prismaClient.holidays.update({
            where: { id },
            data: {
                name,
                date: new Date(date)
            }
        });

        const ls = new LogService();
        await ls.createLog({
            my_id,
            action: "Atualizar Feriado",
            referring: "rh.holidays",
            referring_id: id,
            changes: `De: ${exists.name} (${exists.date}) Para: ${name} (${date})`,
            dep: "rh"
        });

        return updated;
    }

    // 3. Listar Feriados (Ordenados por data)
    async list() {
        return await prismaClient.holidays.findMany({
            orderBy: { date: 'asc' }
        });
    }

    // 4. Deletar Feriado
    async delete(my_id: string, id: string) {
        await prismaClient.holidays.delete({ where: { id } });

        const ls = new LogService();
        await ls.createLog({
            my_id,
            action: "Excluir Feriado",
            referring: "rh.holidays",
            referring_id: id,
            changes: "Excluído",
            dep: "rh"
        });

        return { message: "Feriado removido com sucesso" };
    }
}

export { HolidayService };