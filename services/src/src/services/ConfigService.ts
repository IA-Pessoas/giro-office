import prismaClient from "../prisma"
import { LogService } from './LogService';

class ConfigService {
    async createCommercialProposal(my_id: string, name: string, minimum_wage: number) {
        const exists = await prismaClient.proposalConfig.findFirst({ where:{ name } })
        if (exists) 
            throw new Error("Já cadastrado")

        const create = await prismaClient.proposalConfig.create({
            data:{
                name, 
                minimum_wage
            },
            select:{
                id: true,
                name: true,
                minimum_wage: true
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "proposal.config",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }
    async detailCommercialProposal(config_id: string) {
        const detail = await prismaClient.proposalConfig.findFirst({
            where:{
                id: config_id
            },
            select:{
                id: true,
                name: true,
                minimum_wage: true
            }
        })

        return { detail }
    }

    async updateCommercialProposal(my_id: string, config_id: string, name: string, minimum_wage: number) {
        try{
            const exists = await prismaClient.proposalConfig.findFirst({ where:{ id: config_id } })
            if (!exists) 
                throw new Error("Não localizado")

            const updated = await prismaClient.proposalConfig.update({
                where:{
                    id: config_id
                },
                data:{
                    name,
                    minimum_wage
                },
                select:{
                    name: true,
                    minimum_wage: true
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "proposal.config",
                referring_id: config_id,
                oldData: exists,
                updatedData: updated,
            });


            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }

    async list() {
        const deps = await prismaClient.proposalConfig.findMany({
            select:{
                id: true,
                name: true,
            },
            orderBy: {
                name: 'asc'
            }
        })

        return deps
    }
}

export { ConfigService }