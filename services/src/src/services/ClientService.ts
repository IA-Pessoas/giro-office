type MulterFile = Express.Multer.File
import cron from "node-cron"

import prismaClient from "../prisma"
import { LogService } from './LogService'
import { TaskService } from "./integracao/Tasks/TaskService"
import { EmailService } from "../services/EmailService"
import { bucket } from '../config/firebase'
import { cleanDocument } from "../utils/formatters"
import { stat } from "fs"

interface CreateRequest {
    my_id: string
    type: string
    dominio_code?: string
    name: string
    company_name?: string
    fantasy_name?: string
    cpf_cnpj: string
    cnae?: string
    responsible?: string
    cpf_responsible?: string
    agent?: string
    cpf_agent?: string
    number?: string
    email?: string
    address?: string
    cep?: string
    neighborhood?: string
    state?: string
    city?: string
    customer_since?: Date
    municipal_registration?: string
    state_registration?: string
    commercial_board_registration?: string
    status: string
    competence_entry?: Date
    competence_output?: Date
    opening_date?: Date
    instagram?: string
    indication?: string
    participants_meet?: string
    meet_type?: string
    type_registration: string
    regime?: string
    size?: string
    segment?: string
    contabil?: boolean
    fiscal?: boolean
    pessoal?: boolean
    infoproduto?: boolean
    consultoria?: boolean
    castelo_med?: boolean
    start_strike?: Date
    end_strike?: Date
    deletion_date?: Date
    contract?: boolean
    prospecting_status: string
    date_status?: Date
    description_prospecting?: string
    register_date_prospecting?: string
    service_unique: boolean
}
interface DellRequest {
    client_id: string
    user_id: string
}
interface UpdateRequest {
    my_id: string
    client_id: string
    type: string
    dominio_code?: string
    name: string
    company_name?: string
    fantasy_name?: string
    cpf_cnpj: string
    cnae?: string
    responsible?: string
    cpf_responsible?: string
    agent?: string
    cpf_agent?: string
    number?: string
    email?: string
    address?: string
    cep?: string
    neighborhood?: string
    state?: string
    city?: string
    customer_since?: Date
    municipal_registration?: string
    state_registration?: string
    commercial_board_registration?: string
    status: string
    competence_entry?: Date
    competence_output?: Date
    opening_date?: Date
    instagram?: string
    indication?: string
    participants_meet?: string
    meet_type?: string
    type_registration?: string
    regime?: string
    size?: string
    segment?: string
    contabil?: boolean
    fiscal?: boolean
    pessoal?: boolean
    infoproduto?: boolean
    consultoria?: boolean
    castelo_med?: boolean
    start_strike?: Date
    end_strike?: Date
    deletion_date?: Date
    contract?: boolean
    prospecting_status: string
    date_status?: Date
    description_prospecting?: string
    register_date_prospecting?: string,
    service_unique: boolean
}

interface CreateIntegracaoRequest {
    my_id: string
    /**
     * @example "PF", "PJ"
     */
    type: string
    name: string
    company_name?: string
    fantasy_name?: string
    cpf_cnpj: string
    opening_date?: Date
    responsible?: string
    cpf_responsible?: string
    number?: string
    email?: string
    agent?: string
    cpf_agent?: string
    instagram?: string
    indication?: string
    participants_meet?: string
    meet_type?: string
    /**
     * @example "Novo", "Existente"
     */
    type_registration: string
    service_unique: boolean
}
interface UpdateIntegracaoRequest {
    my_id: string
    client_id: string
    type: string
    name: string
    company_name: string
    fantasy_name: string
    cpf_cnpj: string
    responsible: string
    cpf_responsible: string
    agent: string
    cpf_agent: string
    number: string
    email: string
    address: string
    cep: string
    neighborhood: string
    state: string
    city: string
    instagram: string
    indication: string
    type_registration: string
    service_unique: boolean
}

interface UpdateComercialRequest {
    my_id: string
    client_id: string
    /**
     * @example "Análise/Agendamento", "Envio de Proposta", "Análise Financeira", 
     * "Fechado", "Paralisado" e "Recusado pelo Cliente"
     */
    prospecting_status: string
    date_status?: Date
    description_prospecting?: string
    register_date_prospecting?: string
    
}
interface DistratoRequest {
    my_id: string
    client_id: string
    reason: string 
    description: string
    competence_output: string
}

interface UpdateRegularizeRequest {
    my_id: string
    client_id: string
    dominio_code?: string
    name: string
    company_name?: string
    fantasy_name?: string
    cpf_cnpj: string
    cnae?: string
    cnae_secondary?: string
    responsible?: string
    cpf_responsible?: string
    number?: string
    email?: string
    address?: string
    cep?: string
    neighborhood?: string
    state?: string
    city?: string
    customer_since?: Date
    municipal_registration?: string
    state_registration?: string
    commercial_board_registration?: string
    opening_date?: Date
    regime?: string
    size?: string
    segment?: string
    contabil?: boolean
    fiscal?: boolean
    pessoal?: boolean
    infoproduto?: boolean
    consultoria?: boolean
    castelo_med?: boolean
    start_strike?: Date
    end_strike?: Date
    deletion_date?: Date
}
interface UpdateFinanceiroRequest {
    my_id: string
    client_id: string
    contract?: boolean
}

class ClientService {
    private async find(field: string, value: string) {
        if (field === 'name') {
            const client = await prismaClient.client.findFirst({
                where:{
                    name: value
                }
            })
            return client
        } else if (field === 'id') {
            const client = await prismaClient.client.findFirst({
                where:{
                    id: value
                },
                select:{
                    id: true,
                    name: true,
                    company_name: true,
                    fantasy_name: true,
                    cpf_cnpj: true,
                    responsible: true,
                    cpf_responsible: true,
                    agent: true,
                    cpf_agent: true,
                    number: true,
                    email: true,
                    address: true,
                    cep: true,
                    neighborhood: true,
                    state: true,
                    city: true,
                    instagram: true,
                    indication: true,
                    participants_meet: true,
                    meet_type: true,
                    service_unique: true
                }
            })
            return client
        }
    }

    // Geral
    async create({  
        my_id,
        type,
        dominio_code,
        name,
        company_name,
        fantasy_name,
        cpf_cnpj,
        cnae,
        responsible,
        cpf_responsible,
        agent,
        cpf_agent,
        number,
        email,
        address,
        cep,
        neighborhood,
        state,
        city,
        customer_since,
        municipal_registration,
        state_registration,
        commercial_board_registration,
        status,
        competence_entry,
        competence_output,
        opening_date,
        instagram,
        indication,
        participants_meet,
        meet_type,
        type_registration,
        regime,
        size,
        segment,
        contabil,
        fiscal,
        pessoal,
        infoproduto,
        consultoria,
        start_strike,
        end_strike,
        deletion_date,
        contract,
        prospecting_status,
        date_status,
        description_prospecting,
        register_date_prospecting,
        service_unique,
    }: CreateRequest) {
        const exists = await prismaClient.client.findFirst({
            where:{
                cpf_cnpj: cpf_cnpj
            }
        })
        if (exists) {
            throw new Error("Cliente já cadastrado")
        }

        const client = await prismaClient.client.create({
            data:{
                type,
                dominio_code,
                name,
                company_name,
                fantasy_name,
                cpf_cnpj,
                cnae,
                responsible,
                cpf_responsible,
                agent,
                cpf_agent,
                number,
                email,
                address,
                cep,
                neighborhood,
                state,
                city,
                customer_since,
                municipal_registration,
                state_registration,
                commercial_board_registration,
                status,
                competence_entry,
                competence_output,
                opening_date,
                instagram,
                indication,
                participants_meet,
                meet_type,
                regime,
                size,
                segment,
                contabil,
                fiscal,
                pessoal,
                infoproduto,
                consultoria,
                start_strike,
                end_strike,
                deletion_date,
                contract,
                prospecting_status,
                date_status,
                description_prospecting,
                register_date_prospecting,
                service_unique
            },
            select:{
                id: true,
                name: true,
                cpf_cnpj: true,
            }
        })

        if (!client) {
            throw new Error("Erro ao cadastrar cliente")
        }

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "clients",
            referring_id: client.id,
            changes: "{}"
        })

        return { client }
    }
    async update({ 
        my_id,
        client_id,
        type,
        dominio_code,
        name,
        company_name,
        fantasy_name,
        cpf_cnpj,
        cnae,
        responsible,
        cpf_responsible,
        agent,
        cpf_agent,
        number,
        email,
        address,
        cep,
        neighborhood,
        state,
        city,
        customer_since,
        municipal_registration,
        state_registration,
        commercial_board_registration,
        status,
        competence_entry,
        competence_output,
        opening_date,
        instagram,
        indication,
        participants_meet,
        meet_type,
        type_registration,
        regime,
        size,
        segment,
        contabil,
        fiscal,
        pessoal,
        infoproduto,
        consultoria,
        start_strike,
        end_strike,
        deletion_date,
        contract,
        prospecting_status,
        date_status,
        description_prospecting,
        register_date_prospecting,
        service_unique
    }: UpdateRequest) {
        try{
            const exists = this.find('id', client_id)
            if (!exists) {
                throw new Error("Cliente não existe")
            }

            const updated = await prismaClient.client.update({
                where:{
                    id: client_id
                },
                data:{
                    type,
                    dominio_code,
                    name,
                    company_name,
                    fantasy_name,
                    cpf_cnpj,
                    cnae,
                    responsible,
                    cpf_responsible,
                    agent,
                    cpf_agent,
                    number,
                    email,
                    address,
                    cep,
                    neighborhood,
                    state,
                    city,
                    customer_since,
                    municipal_registration,
                    state_registration,
                    commercial_board_registration,
                    status,
                    competence_entry,
                    competence_output,
                    opening_date,
                    instagram,
                    indication,
                    participants_meet,
                    meet_type,
                    type_registration,
                    regime,
                    size,
                    segment,
                    contabil,
                    fiscal,
                    pessoal,
                    infoproduto,
                    consultoria,
                    start_strike,
                    end_strike,
                    deletion_date,
                    contract,
                    prospecting_status,
                    date_status,
                    description_prospecting,
                    register_date_prospecting,
                    service_unique
                },
                select:{
                    id: true,
                    type: true,
                    dominio_code: true,
                    name: true,
                    company_name: true,
                    fantasy_name: true,
                    cpf_cnpj: true,
                    cnae: true,
                    responsible: true,
                    cpf_responsible: true,
                    agent: true,
                    cpf_agent: true,
                    number: true,
                    email: true,
                    address: true,
                    cep: true,
                    neighborhood: true,
                    state: true,
                    city: true,
                    customer_since: true,
                    municipal_registration: true,
                    state_registration: true,
                    commercial_board_registration: true,
                    status: true,
                    competence_entry: true,
                    competence_output: true,
                    opening_date: true,
                    instagram: true,
                    indication: true,
                    regime: true,
                    size: true,
                    segment: true,
                    contabil: true,
                    fiscal: true,
                    pessoal: true,
                    infoproduto: true,
                    consultoria: true,
                    start_strike: true,
                    end_strike: true,
                    deletion_date: true,
                    contract: true,
                    prospecting_status: true,
                    date_status: true,
                    description_prospecting: true,
                    register_date_prospecting: true,
                    participants_meet: true,
                    meet_type: true,
                    type_registration: true,
                    service_unique
                }
            })
            
            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "clients",
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
    async detail(client_id: string) {
        const client = await prismaClient.client.findFirst({
            where:{
                id: client_id
            }
        })

        return { client }
    }
    async list(status: string, ref: string, search: string = '', page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit;

        const baseSelect = {
            id: true,
            dominio_code: true,
            name: true,
            company_name: true,
            fantasy_name: true,
            cpf_cnpj: true,
            status: true,
        };

        const where: any = {};

        // Filtro de status
        if (status !== 'Todos') {
            // Filtro de integração
            if (ref === 'integracao') {
                if (status === 'Ativo' || status === 'Inativo') {
                    where.status = status
                    where.dominio_code = { not: null }
                } else if (status === 'Ativo e Prospecção') {
                    where.status = { in: ['Fechado', 'Prospecção'] }
                } else if (status === 'Ativo PJ' || status === 'Prospecção PJ' || status === 'Inativo PJ') {
                    where.status = status.split(' ')[0]
                    where.type = status.split(' ')[1]
                } else if (status === 'Ativo PF' || status === 'Prospecção PF' || status === 'Inativo PF') {
                    where.status = status.split(' ')[0]
                    where.type = status.split(' ')[1]
                } else if (status === 'Não Contradados e Paralisados') {
                    where.prospecting_status = { in: ['Paralisado', 'Recusado pelo Cliente'] }
                } else {
                    where.status = status
                }
            } else if (ref === 'deps') { 
                if (status.split(' ')[0] === 'Departamento') {
                    const fieldName = status.split(' ')[1]
                    if (fieldName) {
                        where[fieldName] = true
                    }
                    where.status = 'Ativo'
                }
            }
        }

        // Filtro de busca
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { company_name: { contains: search, mode: 'insensitive' } },
                { fantasy_name: { contains: search, mode: 'insensitive' } },
                { cpf_cnpj: { contains: search, mode: 'insensitive' } },
            ];
        }

        // Consulta paginada + total
        const [clients, total] = await Promise.all([
            prismaClient.client.findMany({
                where,
                select: baseSelect,
                skip,
                take: limit,
                orderBy: {
                    name: 'asc'
                }
            }),
            prismaClient.client.count({ where }),
        ]);

        const hasMore = page * limit < total;

        return { data: clients, hasMore };
    }
    async delete({ client_id, user_id }: DellRequest) {
        const exists = this.find('id', client_id)
        if (!exists)
            throw new Error("Cliente não existe")

        const user = await prismaClient.user.findFirst({
            where:{
                id: user_id
            }
        })
        if (!user)
            throw new Error("Usuário não encontrado")
        if (user.permission !== 2) 
            throw new Error("Usuário não tem permissão")

        const response = await prismaClient.client.delete({
            where: { 
                id: client_id
            }
        })
        if (!response)
            throw new Error("Erro ao deletar cliente")
        
        return { response };
    }

    // Integração
    async createIntegracao({ 
        my_id,
        type,
        name,
        company_name,
        fantasy_name,
        cpf_cnpj,
        opening_date,
        responsible,
        cpf_responsible,
        number,
        email,
        agent,
        cpf_agent,
        instagram,
        indication,
        participants_meet,
        meet_type,
        type_registration,
        service_unique
    }: CreateIntegracaoRequest) {
        const exists = await prismaClient.client.findFirst({
            where:{
                cpf_cnpj: cpf_cnpj
            }
        })
        if (exists) {
            throw new Error("Cliente já cadastrado")
        }

        const cleanedCpfCnpj = cleanDocument(cpf_cnpj);
        const cleanedCpfResponsible = cleanDocument(cpf_responsible);
        const cleanedCpfAgent = cleanDocument(cpf_agent);

        const client = await prismaClient.client.create({
            data:{
                type,
                name,
                company_name,
                fantasy_name,
                cpf_cnpj: cleanedCpfCnpj,
                opening_date,
                responsible,
                cpf_responsible: cleanedCpfResponsible,
                number,
                email,
                agent,
                cpf_agent: cleanedCpfAgent,
                instagram,
                indication,
                status: type_registration === 'Novo' ? 'Prospecção' : 'Ativo',
                prospecting_status: type_registration === 'Novo' ? 'Análise/Agendamento' : 'Fechado',
                participants_meet,
                meet_type,
                type_registration,
                service_unique
            },
            select:{
                id: true,
                name: true,
                cpf_cnpj: true,
            }
        })

        if (!client) {
            throw new Error("Erro ao cadastrar cliente")
        }

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "clients",
            referring_id: client.id,
            changes: "{}"
        })


        return { client }
    }
    async updateIntegracao({ 
        my_id,
        client_id,
        type,
        name,
        company_name,
        fantasy_name,
        cpf_cnpj,
        responsible,
        cpf_responsible,
        agent,
        cpf_agent,
        number,
        email,
        address,
        cep,
        neighborhood,
        state,
        city,
        instagram,
        indication,
        type_registration,
        service_unique
    }: UpdateIntegracaoRequest) {
        try{
            const exists = await prismaClient.client.findFirst({
                where:{
                    id: client_id
                },
                select:{
                    id: true,
                    type: true,
                    name: true,
                    company_name: true,
                    fantasy_name: true,
                    cpf_cnpj: true,
                    responsible: true,
                    cpf_responsible: true,
                    agent: true,
                    cpf_agent: true,
                    number: true,
                    email: true,
                    address: true,
                    cep: true,
                    neighborhood: true,
                    state: true,
                    city: true,
                    instagram: true,
                    indication: true,
                    participants_meet: true,
                    meet_type: true,
                    type_registration: true,
                    service_unique: true,
                    status: true,
                    prospecting_status: true,
                }
            })
            if (!exists) {
                throw new Error("Cliente não existe")
            }

            const cleanedCpfCnpj = cleanDocument(cpf_cnpj);
            const cleanedCpfResponsible = cleanDocument(cpf_responsible);
            const cleanedCpfAgent = cleanDocument(cpf_agent);

            const updated = await prismaClient.client.update({
                where:{
                    id: client_id
                },
                data:{
                    type,
                    name,
                    company_name,
                    fantasy_name,
                    cpf_cnpj: cleanedCpfCnpj,
                    responsible,
                    cpf_responsible: cleanedCpfResponsible,
                    agent,
                    cpf_agent: cleanedCpfAgent,
                    number,
                    email,
                    address,
                    cep,
                    neighborhood,
                    state,
                    city,
                    instagram,
                    indication,
                    type_registration,
                    service_unique
                },
                select:{
                    id: true,
                    type: true,
                    name: true,
                    company_name: true,
                    fantasy_name: true,
                    cpf_cnpj: true,
                    responsible: true,
                    cpf_responsible: true,
                    agent: true,
                    cpf_agent: true,
                    number: true,
                    email: true,
                    address: true,
                    cep: true,
                    neighborhood: true,
                    state: true,
                    city: true,
                    instagram: true,
                    indication: true,
                    type_registration: true,
                    service_unique: true
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "clients",
                referring_id: client_id,
                oldData: exists,
                updatedData: updated,
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async createHistory(my_id: string, client_id: string, date: Date, history: string, file?: string, pending_id?: string) {
        const create = await prismaClient.clientHistory.create({
            data:{
                client_id,
                date,
                history,
                file,
                user_id: my_id,
            },
            select:{
                id: true,
                client_id: true,
                date: true,
                history: true,
                file: true,
                user_id: true,
            }
        })

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "clients.history",
            referring_id: create.id,
            changes: "{}"
        })

        if (pending_id !== undefined) {
            await prismaClient.clientHistoryPending.delete({
                where: { id: pending_id }
            })
        }

        return { create }
    }
    async uploadHistoryFile(file: MulterFile, client_id: string) {
        return new Promise<{ filePath: string }>((resolve, reject) => {
            try {
                const filePath = `clients/historys/${client_id}/${Date.now()}_${file.originalname}`;
                const blob = bucket.file(filePath);

                const blobStream = blob.createWriteStream({
                    metadata: {
                        contentType: file.mimetype,
                    },
                });

                blobStream.on("finish", async () => {
                    resolve({ filePath });
                });

                blobStream.on("error", (err) => {
                    reject(new Error("Erro no upload para o Firebase: " + err.message));
                });

                blobStream.end(file.buffer);
            } catch (err) {
                if (err instanceof Error) {
                    reject(new Error("Erro interno: " + err.message));
                } else {
                    reject(new Error("Erro interno desconhecido"));
                }
            }
        });
    }    
    async detailHistory(history_id: string) {
        const detail = await prismaClient.clientHistory.findFirst({
            where:{
                id: history_id
            },
            select:{
                id: true,
                client_id: true,
                date: true,
                history: true,
                file: true,
                user_id: true,
                user: {
                    select: {
                        name: true,
                        department: {
                            select: {
                                name: true
                            }
                        }
                    }
                },
                client: {
                    select: {
                        company_name: true,
                        cpf_cnpj: true
                    }
                }
            }
        })

        return { detail }
    }
    async listHistory(client_id: string) {
        const list = await prismaClient.clientHistory.findMany({
            where: {
                client_id
            },
            orderBy: {
                date: 'asc'
            },
            select:{
                id: true,
                client_id: true,
                date: true,
                history: true,
                file: true,
                user_id: true,
                user: {
                    select: {
                        name: true,
                        department: {
                            select: {
                                name: true
                            }
                        }
                    }
                },
            }
        });

        return { list };
    }
    async updateHistory(my_id: string, history_id: string, date: Date, history: string) {
        try{            
            const exists = await prismaClient.clientHistory.findFirst({
                where:{
                    id: history_id
                }
            })
            if (!exists)
                throw new Error("Histórico não existe")

            if (exists.user_id !== my_id)
                throw new Error("Usuário não tem permissão")

            const updated = await prismaClient.clientHistory.update({
                where:{
                    id: history_id
                },
                data: {
                    date,
                    history,
                },
                select: {
                    id: true,
                    date: true,
                    history: true,
                    user_id: true,
                }
            })

            if (!updated)
                throw new Error("Erro ao atualizar")

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "clients.history",
                referring_id: history_id,
                oldData: exists,
                updatedData: updated,
            })

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async createHistoryPending(client_id: string, reason: string, user_id: string) {
        const create = await prismaClient.clientHistoryPending.create({
            data:{
                user_id,
                client_id,
                reason
            },
            select:{
                id: true,
                user_id: true,
                client_id: true,
                reason: true
            }
        })

        return { create }
    }
    async listHistoryPending(user_id?: string) {
        if (user_id) {
            const list = await prismaClient.clientHistoryPending.findMany({
                where: {
                    user_id
                },
                select:{
                    id: true,
                    reason: true,
                    client_id: true,
                    client: {
                        select: {
                            company_name: true,
                            cpf_cnpj: true
                        }
                    }
                }
            });
    
            return { list };
        } else {
            const list = await prismaClient.clientHistoryPending.findMany({
                select:{
                    id: true,
                    reason: true,
                    client_id: true,
                    client: {
                        select: {
                            company_name: true,
                            cpf_cnpj: true
                        }
                    }
                }
            });
    
            return { list };
        }
    }
    async deleteHistoryPending(id: string, my_id: string) {
        const exists = await prismaClient.clientHistoryPending.findUnique({
            where: { id }
        })
        if (!exists)
            throw new Error("Not found")

        const user = await prismaClient.user.findFirst({ where:{ id: my_id } })
        if (!user)
            throw new Error("Usuário não encontrado")
        if (user.permission !== 2) 
            throw new Error("Usuário não tem permissão")

        const response = await prismaClient.clientHistoryPending.delete({
            where: { id }
        })
        if (!response)
            throw new Error("Error deleting")

        return { response }
    }
    
    // Comercial
    async updateComercial({ 
        my_id,
        client_id,
        prospecting_status,
        date_status,
        description_prospecting,
        register_date_prospecting,
    }: UpdateComercialRequest) {
        try{           
            const exists = await prismaClient.client.findFirst({
                where:{
                    id: client_id
                },
                select:{
                    id: true,
                    name: true,
                    company_name: true,
                    fantasy_name: true,
                    cpf_cnpj: true,
                    responsible: true,
                    cpf_responsible: true,
                    agent: true,
                    cpf_agent: true,
                    number: true,
                    email: true,
                    address: true,
                    cep: true,
                    neighborhood: true,
                    state: true,
                    city: true,
                    instagram: true,
                    indication: true,
                    participants_meet: true,
                    meet_type: true,
                    service_unique: true,
                    status: true,
                    prospecting_status: true,
                    type_registration: true
                }
            })
            if (!exists) {
                throw new Error("Cliente não existe")
            }
            // Atribui o status geral com o status da prospecção
            let status = exists.status
            if (prospecting_status === 'Fechado') {
                status = 'Ativo'
            } else if (prospecting_status === 'Recusado pelo Cliente' || prospecting_status === 'Paralisado') {
                status = prospecting_status
            }

            if (
                status === 'Recusado pelo Cliente' && 
                prospecting_status !== 'Recusado pelo Cliente' && 
                prospecting_status !== 'Paralisado' &&
                prospecting_status !== 'Fechado'
            ) {
                status = 'Prospecção'
            }

            // Atualiza o cliente
            const updated = await prismaClient.client.update({
                where:{
                    id: client_id
                },
                data:{
                    status,
                    prospecting_status,
                    date_status,
                    description_prospecting,
                    register_date_prospecting,
                },
                select:{
                    id: true,
                    name: true,
                    company_name: true,
                    fantasy_name: true,
                    cpf_cnpj: true,
                    prospecting_status: true,
                    date_status: true,
                    description_prospecting: true,
                    register_date_prospecting: true,
                }
            })

            // Verifica se o cliente foi atualizado
            if (!updated) {
                throw new Error("Erro ao atualizar cliente")
            }

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "clients",
                referring_id: client_id,
                oldData: exists,
                updatedData: updated,
            });

            // Controle de tarefas com base no status da prospecção
            if (prospecting_status === 'Recusado pelo Cliente' || prospecting_status === 'Paralisado') {
                const list = await prismaClient.task.findMany({
                    where:{ 
                        status: {
                            in: [
                                'A Realizar', 
                                'Em andamento', 
                                'Em Espera', 
                                'Pendente',
                            ]
                        },
                        client_id 
                    },
                    select:{
                        id: true,
                        name: true,
                        status: true,
                        department_id: true,
                        observations: true,
                        billing: true,
                        urgency: true,
                        responsible_id: true,
                        responsible2_id: true,
                        responsible3_id: true,
                        prevision_date: true
                    }
                })
                
                if (list.length > 0) {
                    const ts = new TaskService()
                    for (const task of list) {
                        await ts.update({
                            my_id,
                            task_id: task.id,
                            name: task.name,
                            status: (prospecting_status === 'Recusado pelo Cliente') ? 'Não Contratado' : 'Paralisado',
                            department_id: task.department_id,
                            observations: task.observations!,
                            billing: task.billing,
                            urgency: task.urgency,
                            responsible_id: task.responsible_id,
                            responsible2_id: task.responsible2_id!,
                            responsible3_id: task.responsible3_id!,
                            prevision_date: task.prevision_date!,
                        })
                    }
                }
            } else if (prospecting_status === 'Fechado') {
                let competence = ''
                const list = await prismaClient.task.findMany({
                    where:{ 
                        status: {
                            in: [
                                'A Realizar',
                                'Em andamento',
                            ]
                        },
                        charge_comercial: false,
                        client_id 
                    },
                    select:{
                        id: true,
                        name: true,
                        status: true,
                        department_id: true,
                        observations: true,
                        billing: true,
                        urgency: true,
                        responsible_id: true,
                        responsible2_id: true,
                        responsible3_id: true,
                        prevision_date: true
                    }
                })
                if (list.length > 0) {
                    const ts = new TaskService()
                    for (const task of list) {
                        await ts.update({
                            my_id,
                            task_id: task.id,
                            name: task.name,
                            status: (task.billing == 'Realizar') ? 'A Realizar' : 'Em andamento',
                            department_id: task.department_id,
                            observations: task.observations!,
                            billing: task.billing,
                            urgency: task.urgency,
                            responsible_id: task.responsible_id,
                            responsible2_id: task.responsible2_id!,
                            responsible3_id: task.responsible3_id!,
                            prevision_date: task.prevision_date!,
                        })

                        if (task.name === 'Definição de Competência' && task.observations !== null && exists.prospecting_status !== 'Fechado')
                            competence = task.observations
                    }
                }

                if (exists.service_unique === false && exists.type_registration !== "Existente") {
                    const es = new EmailService()
                    await es.sendNewClient(client_id, competence, my_id)
                }
            }

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async termination({ my_id, client_id, reason, description, competence_output }: DistratoRequest) {
        try{
            const exists = await this.find('id', client_id)
            if (!exists) {
                throw new Error("Cliente não existe")
            }

            // Paralisação das tarefas
            const list = await prismaClient.task.findMany({
                where:{ 
                    status: {
                        in: [
                            'A Realizar', 
                            'Em andamento', 
                            'Em Espera', 
                            'Pendente',
                        ]
                    },
                    client_id 
                },
                select:{
                    id: true,
                    name: true,
                    status: true,
                    department_id: true,
                    observations: true,
                    billing: true,
                    urgency: true,
                    responsible_id: true,
                    responsible2_id: true,
                    responsible3_id: true,
                    prevision_date: true
                }
            })
            if (list.length > 0) {
                const ts = new TaskService()
                for (const task of list) {
                    await ts.update({
                        my_id,
                        task_id: task.id,
                        name: task.name,
                        status: 'Paralisado',
                        department_id: task.department_id,
                        observations: task.observations!,
                        billing: task.billing,
                        urgency: task.urgency,
                        responsible_id: task.responsible_id,
                        responsible2_id: task.responsible2_id!,
                        responsible3_id: task.responsible3_id!,
                        prevision_date: task.prevision_date!,
                    })
                }
            }

            const updated = await prismaClient.client.update({
                where:{
                    id: client_id
                },
                data:{
                    status: 'Processo de Inativação',
                    competence_output: competence_output + "-01T00:00:00Z",
                },
                select:{
                    id: true,
                    status: true,
                    competence_output: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "clients",
                referring_id: client_id,
                oldData: exists,
                updatedData: updated,
            });

            const created = await prismaClient.clientTermination.create({
                data:{
                    client_id,
                    reason,
                    description,
                    competence: competence_output + "-01T00:00:00Z",
                    user_id: my_id
                },
                select:{
                    id: true,
                    client_id: true,
                    reason: true,
                    description: true,
                    competence: true,
                    user_id: true,
                }
            })

            return created
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async competenceOutputUpdate() {
        const runRoutine = async () => {
            console.log(`[${new Date().toISOString()}] Executando rotina...`)

            try {
                const clients = await prismaClient.client.findMany({
                    where: {
                        competence_output: {
                            lte: new Date()
                        },
                        status: 'Processo de Inativação',
                    },
                    select: {
                        id: true,
                        status: true,
                        competence_output: true,
                    }
                })
                if (clients.length > 0) {
                    for (const client of clients) {
                        await prismaClient.client.update({
                            where:{
                                id: client.id
                            },
                            data:{
                                status: 'Inativo',
                            }
                        })
                    }
                }
                console.log(`[${new Date().toISOString()}] Rotina executada com sucesso!`)
            } catch (error) {
                console.error(`[${new Date().toISOString()}] Erro ao executar rotina:`, error)
            }
        }

        cron.schedule("0 7 * * *", runRoutine, {
            timezone: "America/Sao_Paulo",
        }) // Executa as 7 da amanha
    }

    // Financeiro
    async updateFinanceiro({ my_id, client_id, contract }: UpdateFinanceiroRequest) {
        try{
            const exists = await this.find('id', client_id)
            if (!exists) {
                throw new Error("Cliente não existe")
            }

            const updated = await prismaClient.client.update({
                where:{
                    id: client_id
                },
                data:{
                    contract,
                },
                select:{
                    id: true,
                    contract: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "clients",
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
    
    // Regularize
    async updateRegularize({ 
        my_id,
        client_id,
        dominio_code,
        name,
        company_name,
        fantasy_name,
        cpf_cnpj,
        cnae,
        cnae_secondary,
        responsible,
        cpf_responsible,
        number,
        email,
        address,
        cep,
        neighborhood,
        state,
        city,
        customer_since,
        municipal_registration,
        state_registration,
        commercial_board_registration,
        opening_date,
        regime,
        size,
        segment,
        contabil,
        fiscal,
        pessoal,
        infoproduto,
        consultoria,
        start_strike,
        end_strike,
        deletion_date
    }: UpdateRegularizeRequest) {
        try{
            const exists = await this.find('id', client_id)
            if (!exists) {
                throw new Error("Cliente não existe")
            }

            const cleanedCpfCnpj = cleanDocument(cpf_cnpj);
            const cleanedCpfResponsible = cleanDocument(cpf_responsible);

            const updated = await prismaClient.client.update({
                where:{
                    id: client_id
                },
                data:{
                    dominio_code,
                    name,
                    company_name,
                    fantasy_name,
                    cpf_cnpj: cleanedCpfCnpj,
                    cnae,
                    cnae_secondary,
                    responsible,
                    cpf_responsible: cleanedCpfResponsible,
                    number,
                    email,
                    address,
                    cep,
                    neighborhood,
                    state,
                    city,
                    customer_since,
                    municipal_registration,
                    state_registration,
                    commercial_board_registration,
                    opening_date,
                    regime,
                    size,
                    segment,
                    contabil,
                    fiscal,
                    pessoal,
                    infoproduto,
                    consultoria,
                    start_strike,
                    end_strike,
                    deletion_date
                },
                select:{
                    id: true,
                    dominio_code: true,
                    name: true,
                    company_name: true,
                    fantasy_name: true,
                    cpf_cnpj: true,
                    cnae_secondary: true,
                    cnae: true,
                    responsible: true,
                    cpf_responsible: true,
                    agent: true,
                    cpf_agent: true,
                    number: true,
                    email: true,
                    address: true,
                    cep: true,
                    neighborhood: true,
                    state: true,
                    city: true,
                    customer_since: true,
                    municipal_registration: true,
                    state_registration: true,
                    commercial_board_registration: true,
                    status: true,
                    competence_entry: true,
                    competence_output: true,
                    opening_date: true,
                    regime: true,
                    size: true,
                    segment: true,
                    contabil: true,
                    fiscal: true,
                    pessoal: true,
                    infoproduto: true,
                    consultoria: true,
                    start_strike: true,
                    end_strike: true,
                    deletion_date: true,
                }
            })
            if (!updated) {
                throw new Error("Erro ao atualizar cliente")
            }

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "clients",
                referring_id: client_id,
                oldData: exists,
                updatedData: updated,
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
}

export { ClientService }