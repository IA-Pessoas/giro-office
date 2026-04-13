import prismaClient from "../../prisma";
import { LogService } from "../LogService";

class TiTermService {
    async create(data: any) {
        return await prismaClient.termTecnologia.create({
            data: {
                user_id: data.user_id,
                date: new Date(data.date),
                user_name: data.user_name,
                user_cpf: data.user_cpf,
                department_id: data.department_id,
                address: data.address,
                reason: data.reason,
                equipament_list: data.equipament_list,
                brand: data.brand,
                asset_code: data.asset_code,
                imei: data.imei
            }
        });
    }

    async list() {
        return await prismaClient.termTecnologia.findMany({
            orderBy: { date: 'desc' }
        });
    }

    async update(my_id: string, data: any) {
        const { id, ...updateData } = data;
        const exists = await prismaClient.termTecnologia.findUnique({ where: { id } });
        if (!exists) throw new Error("Termo não encontrado");

        const updated = await prismaClient.termTecnologia.update({
            where: { id },
            data: {
                user_id: updateData.user_id,
                date: updateData.date ? new Date(updateData.date) : undefined,
                user_name: updateData.user_name,
                user_cpf: updateData.user_cpf,
                department_id: updateData.department_id,
                address: updateData.address,
                reason: updateData.reason,
                equipament_list: updateData.equipament_list,
                brand: updateData.brand,
                asset_code: updateData.asset_code,
                imei: updateData.imei
            }
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id, action: "Atualizar Termo TI", referring: "ti.terms", referring_id: id, oldData: exists, updatedData: updated, dep: "ti"
        });
        return updated;
    }

    async delete(my_id: string, id: string) {
        await prismaClient.termTecnologia.delete({ where: { id } });

        const ls = new LogService();
        await ls.createLog({ my_id, action: "Excluir Termo TI", referring: "ti.terms", referring_id: id, changes: "Excluído", dep: "ti" });
        return { message: "Termo excluído com sucesso" };
    }
}
export { TiTermService };