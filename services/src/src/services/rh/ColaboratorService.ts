import prismaClient from "../../prisma";
import { LogService } from "../LogService";

interface ColaboratorDTO {
    my_id: string; // ID de quem está fazendo a ação (Log)
    target_user_id: string; // ID do usuário alvo (Colaborador)
    full_name: string;
    gender?: string;
    birth_date?: string | Date; // Recebe string do front
    cpf?: string;
    rg?: string;
    address?: string;
    job_title?: string;
    email?: string;
    phone?: string;
    hire_date?: string;
    termination_date?: string;
}

class ColaboratorService {
    async upsert(data: ColaboratorDTO) {
        
        // Converte data de nascimento se vier string
        const birthDate = data.birth_date ? new Date(data.birth_date) : null;

        const colaborator = await prismaClient.colaborators.upsert({
            where: { user_id: data.target_user_id },
            update: {
                full_name: data.full_name,
                gender: data.gender,
                birth_date: birthDate,
                cpf: data.cpf,
                rg: data.rg,
                address: data.address,
                job_title: data.job_title,
                email: data.email,
                phone: data.phone,
                hire_date: data.hire_date,
                termination_date: data.termination_date
            },
            create: {
                user_id: data.target_user_id,
                full_name: data.full_name,
                gender: data.gender,
                birth_date: birthDate,
                cpf: data.cpf,
                rg: data.rg,
                address: data.address,
                job_title: data.job_title,
                email: data.email,
                phone: data.phone,
                hire_date: data.hire_date,
                termination_date: data.termination_date
            }
        });

        // Log
        const ls = new LogService();
        await ls.createLog({
            my_id: data.my_id,
            action: "Atualização Cadastral",
            referring: "rh.colaborators",
            referring_id: data.target_user_id,
            changes: "Dados pessoais atualizados",
            dep: "rh"
        });

        return colaborator;
    }

    async detail(user_id: string) {
        return await prismaClient.colaborators.findUnique({
            where: { user_id }
        });
    }
}

export { ColaboratorService };