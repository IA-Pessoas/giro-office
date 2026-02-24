import prismaClient from "../../prisma"
import { LogService } from '../LogService';

interface CreateRequest {
    my_id: string
    client_id: string
}
interface UpdateRequest {
    my_id: string
    client_id: string
    activities:	string
    tax_billing: string
    management_billing:	string
    works_bidding: boolean
    dissatisfaction: string
    registered_collabortors: number
    unregistered_collabortors: number
    esocial: boolean
    how_many_banks:	boolean
    whitch_banks: string
    responsible_departments: string
    works_system: boolean
    system_name: string
    system_usage_time: string
    system_value: string
    system_contact:	string
    system_operations: string
    cloud_storage: boolean
    which_cloud_storage: string
    rental_agreement: boolean
    assessment_regime: string
    permit:	string
    services: string
}

class PAService {
    async create({ 
        my_id,
        client_id
    }: CreateRequest) {
        const exists = await prismaClient.pA.findFirst({
            where:{ client_id }
        })
        if (exists !== null)
            throw new Error("Esse PA já foi cadastrado")

        const create = await prismaClient.pA.create({
            data:{
                client_id,
            },
            select:{
                client_id: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "clients.pa",
            referring_id: create.client_id,
            changes: "{}"
        })

        return { create }
    }
    async detail(client_id: string) {
        const detail = await prismaClient.pA.findFirst({
            where:{
                client_id
            },
            select: {
                client_id: true,
                activities: true,
                tax_billing: true,
                management_billing: true,
                works_bidding: true,
                dissatisfaction: true,
                registered_collabortors: true,
                unregistered_collabortors: true,
                esocial: true,
                how_many_banks: true,
                whitch_banks: true,
                responsible_departments: true,
                works_system: true,
                system_name: true,
                system_usage_time: true,
                system_value: true,
                system_contact: true,
                system_operations: true,
                cloud_storage: true,
                which_cloud_storage: true,
                rental_agreement: true,
                assessment_regime: true,
                permit: true,
                services: true,
                client: {
                    select: {
                        company_name: true,
                        cpf_cnpj: true,
                        responsible: true,
                        opening_date: true,
                        number: true,
                        register_date_prospecting: true,
                        participants_meet: true,
                        email: true,
                        meet_type: true,
                        indication: true,
                        instagram: true,
                        historys: true,
                        regime: true,
                        cnae: true,
                        cnae_secondary: true,
                        contabil: true,
                        fiscal: true,
                        pessoal: true,
                        infoproduto: true,
                        consultoria: true,
                        castelo_med: true,
                    }
                }
            }
        })
        return { detail }
    }
    async update({ 
        my_id,
        client_id,
        activities,
        tax_billing,
        management_billing,
        works_bidding,
        dissatisfaction,
        registered_collabortors,
        unregistered_collabortors,
        esocial,
        how_many_banks,
        whitch_banks,
        responsible_departments,
        works_system,
        system_name,
        system_usage_time,
        system_value,
        system_contact,
        system_operations,
        cloud_storage,
        which_cloud_storage,
        rental_agreement,
        assessment_regime,
        permit,
        services,
    }: UpdateRequest) {
        try {
            const exists = await prismaClient.pA.findFirst({
                where: { client_id }
            })
            if (!exists)
                throw new Error("PA não existe")
    
            const updated = await prismaClient.pA.update({
                where:{
                    client_id
                },
                data:{
                    activities,
                    tax_billing,
                    management_billing,
                    works_bidding,
                    dissatisfaction,
                    registered_collabortors,
                    unregistered_collabortors,
                    esocial,
                    how_many_banks,
                    whitch_banks,
                    responsible_departments,
                    works_system,
                    system_name,
                    system_usage_time,
                    system_value,
                    system_contact,
                    system_operations,
                    cloud_storage,
                    which_cloud_storage,
                    rental_agreement,
                    assessment_regime,
                    permit,
                    services,
                },
                select:{
                    client_id: true,
                    activities: true,
                    tax_billing: true,
                    management_billing: true,
                    works_bidding: true,
                    dissatisfaction: true,
                    registered_collabortors: true,
                    unregistered_collabortors: true,
                    esocial: true,
                    how_many_banks: true,
                    whitch_banks: true,
                    responsible_departments: true,
                    works_system: true,
                    system_name: true,
                    system_usage_time: true,
                    system_value: true,
                    system_contact: true,
                    system_operations: true,
                    cloud_storage: true,
                    which_cloud_storage: true,
                    rental_agreement: true,
                    assessment_regime: true,
                    permit: true,
                    services: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "clients.pa",
                referring_id: client_id,
                oldData: exists,
                updatedData: updated,
            })
            
            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
}

export { PAService }