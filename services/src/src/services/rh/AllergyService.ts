import prismaClient from "../../prisma";
import { LogService } from "../LogService";

interface AllergyDTO {
    my_id: string;
    target_user_id: string;
    name: string;
    fonts: string;
    action: string;
}

class AllergyService {
    async create(data: AllergyDTO) {
        const allergy = await prismaClient.allergies.create({
            data: {
                user_id: data.target_user_id,
                name: data.name,
                fonts: data.fonts,
                action: data.action
            }
        });

        const ls = new LogService();
        await ls.createLog({
            my_id: data.my_id,
            action: "Adicionar Alergia",
            referring: "rh.allergies",
            referring_id: allergy.id,
            changes: `Adicionou ${data.name}`,
            dep: "rh"
        });

        return allergy;
    }

    async list(user_id: string) {
        return await prismaClient.allergies.findMany({
            where: { user_id }
        });
    }

    async delete(my_id: string, id: string) {
        await prismaClient.allergies.delete({ where: { id } });
        
        const ls = new LogService();
        await ls.createLog({
            my_id,
            action: "Remover Alergia",
            referring: "rh.allergies",
            referring_id: id,
            changes: "Removido",
            dep: "rh"
        });
        
        return { message: "Alergia removida" };
    }
}

export { AllergyService };