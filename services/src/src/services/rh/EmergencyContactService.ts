import prismaClient from "../../prisma";
import { LogService } from "../LogService";

interface ContactDTO {
    my_id: string;
    target_user_id: string;
    name: string;
    reference: string;
    phone: string;
}

class EmergencyContactService {
    async create(data: ContactDTO) {
        const contact = await prismaClient.emergencyContacts.create({
            data: {
                user_id: data.target_user_id,
                name: data.name,
                reference: data.reference,
                phone: data.phone
            }
        });

        const ls = new LogService();
        await ls.createLog({
            my_id: data.my_id,
            action: "Adicionar Contato Emergência",
            referring: "rh.emergencyContacts",
            referring_id: contact.id,
            changes: `Adicionou ${data.name}`,
            dep: "rh"
        });

        return contact;
    }

    async list(user_id: string) {
        return await prismaClient.emergencyContacts.findMany({
            where: { user_id }
        });
    }

    async delete(my_id: string, id: string) {
        await prismaClient.emergencyContacts.delete({ where: { id } });
        
        const ls = new LogService();
        await ls.createLog({
            my_id,
            action: "Remover Contato Emergência",
            referring: "rh.emergencyContacts",
            referring_id: id,
            changes: "Removido",
            dep: "rh"
        });
        
        return { message: "Contato removido" };
    }
}

export { EmergencyContactService };