import cron from "node-cron"

import prismaClient from "../../prisma"
import { LogService } from '../LogService'

interface CreatePJRequest {
    my_id: string
    client_castelo_status: boolean
    client_focus_status: boolean
    name: string
    cnpj: string
    responsible: string
    model: string
    legal_nature: string
    password: string
    expiration_date: Date
    notes: string
    was_paid: boolean
    payment_date: Date
    payment_amount: number
    contact_info: string
    file_path: string
    has_certificate: boolean
}
interface UpdatePJRequest {
    my_id: string
    certificate_id: string
    client_castelo_status: boolean
    client_focus_status: boolean
    name: string
    cnpj: string
    responsible: string
    model: string
    legal_nature: string
    password: string
    expiration_date: Date
    notes: string
    was_paid: boolean
    payment_date: Date
    payment_amount: number
    contact_info: string
    file_path: string
    has_certificate: boolean
}

interface CreatePFRequest {
    my_id: string
    client_castelo_status: boolean
    client_focus_status: boolean
    name: string
    cpf: string
    model: string
    password: string
    expiration_date: Date
    notes: string
    enterprise: string
    cnpj: string
    was_paid: boolean
    payment_date: Date
    payment_amount: number
    contact_info: string
    file_path: string
    has_certificate: boolean
}
interface UpdatePFRequest {
    my_id: string
    certificate_id: string
    client_castelo_status: boolean
    client_focus_status: boolean
    name: string
    cpf: string
    model: string
    password: string
    expiration_date: Date
    notes: string
    enterprise: string
    cnpj: string
    was_paid: boolean
    payment_date: Date
    payment_amount: number
    contact_info: string
    file_path: string
    has_certificate: boolean
}

class CertificateService {
    async detail(certificate_id: string, type: string) {
        if (type === "pj") {        
            const detail = await prismaClient.certificatePJ.findFirst({
                where:{
                    id: certificate_id
                },
                select:{
                    id: true,
                    client_castelo_status: true,
                    client_focus_status: true,
                    name: true,
                    cnpj: true,
                    responsible: true,
                    model: true,
                    legal_nature: true,
                    password: true,
                    expiration_date: true,
                    notes: true,
                    was_paid: true,
                    payment_date: true,
                    payment_amount: true,
                    contact_info: true,
                    file_path: true,
                    has_certificate: true,
                }
            })
            return { detail }
        } else if (type === "pf") {
            const detail = await prismaClient.certificatePF.findFirst({
                where:{
                    id: certificate_id
                },
                select:{
                    id: true,
                    client_castelo_status: true,
                    client_focus_status: true,
                    name: true,
                    cpf: true,
                    model: true,
                    password: true,
                    expiration_date: true,
                    notes: true,
                    enterprise: true,
                    cnpj: true,
                    was_paid: true,
                    payment_date: true,
                    payment_amount: true,
                    contact_info: true,
                    file_path: true,
                    has_certificate: true,
                }
            })
            return { detail }
        }
    }
    async list(status: boolean, type: string, client_status: boolean, password_access: boolean) {
        if (type === 'pj') {
            const list = await prismaClient.certificatePJ.findMany({
                where:{
                    has_certificate: status,
                    client_focus_status: client_status
                },
                select:{
                    id: true,
                    name: true,
                    cnpj: true,
                    password: password_access,
                    expiration_date: true,
                },
                orderBy: {
                    name: 'asc'
                }
            })
            return list
        } else if (type === 'pf') {
            const list = await prismaClient.certificatePF.findMany({
                where:{
                    has_certificate: status,
                    client_focus_status: client_status
                },
                select:{
                    id: true,
                    name: true,
                    cpf: true,
                    enterprise: true,
                    password: password_access,
                    expiration_date: true,
                },
                orderBy: {
                    name: 'asc'
                }
            })
            return list
        }
    }
    async dueDateNotification() {
        const runRoutine = async () => {
            console.log(`[${new Date().toISOString()}] Executando rotina...`)

            try {
                const pjs = await prismaClient.certificatePJ.findMany({
                    where: {
                        expiration_date: {
                            lte: new Date()
                        },
                        has_certificate: true,
                    },
                    select: {
                        id: true,
                        name: true,
                        expiration_date: true,
                    }
                })
                if (pjs.length > 0) {
                    for (const pj of pjs) {
                        const exists = await prismaClient.certificatePJ.findFirst({
                            where: { id: pj.id }
                        })
                        if (!exists) {
                            await prismaClient.certificateNotification.create({
                                data:{
                                    certificate_id: pj.id,
                                    client_name: pj.name,
                                    type: 'PJ',
                                    date: pj.expiration_date
                                }
                            })
                        }
                    }
                }

                const pfs = await prismaClient.certificatePF.findMany({
                    where: {
                        expiration_date: {
                            lte: new Date()
                        },
                        has_certificate: true,
                    },
                    select: {
                        id: true,
                        name: true,
                        expiration_date: true,
                    }
                })
                if (pfs.length > 0) {
                    for (const pf of pfs) {
                        const exists = await prismaClient.certificatePF.findFirst({
                            where: { id: pf.id }
                        })
                        if (!exists) {
                            await prismaClient.certificateNotification.create({
                                data:{
                                    certificate_id: pf.id,
                                    client_name: pf.name,
                                    type: 'PF',
                                    date: pf.expiration_date
                                }
                            })
                        }
                    }
                }

                console.log(`[${new Date().toISOString()}] Rotina Certificados executada com sucesso!`)
            } catch (error) {
                console.error(`[${new Date().toISOString()}] Erro ao executar rotina:`, error)
            }
        }

        cron.schedule("30 6 * * *", runRoutine, {
            timezone: "America/Sao_Paulo",
        }) // minuto | hora
    }
    async listNotification() {
        const list = await prismaClient.certificateNotification.findMany({
            select:{
                id: true,
                certificate_id: true,
                client_name: true,
                type: true,
                date: true,
            },
            orderBy: {
                date: 'asc'
            }
        })
        return list
        
    }

    async createPJ({ 
        my_id, 
        client_castelo_status, 
        client_focus_status, 
        name, 
        cnpj,
        responsible, 
        model, 
        legal_nature, 
        password, 
        expiration_date, 
        notes, 
        was_paid, 
        payment_date, 
        payment_amount, 
        contact_info, 
        file_path, 
        has_certificate 
    }: CreatePJRequest) {
        const exists = await prismaClient.certificatePJ.findFirst({
            where: { name, cnpj, model }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const create = await prismaClient.certificatePJ.create({
            data:{
                client_castelo_status,
                client_focus_status,
                name,
                cnpj,
                responsible,
                model,
                legal_nature,
                password,
                expiration_date,
                notes,
                was_paid,
                payment_date,
                payment_amount,
                contact_info,
                file_path,
                has_certificate,
            },
            select:{
                id: true,
                client_castelo_status: true,
                client_focus_status: true,
                name: true,
                cnpj: true,
                responsible: true,
                model: true,
                legal_nature: true,
                password: true,
                expiration_date: true,
                notes: true,
                was_paid: true,
                payment_date: true,
                payment_amount: true,
                contact_info: true,
                file_path: true,
                has_certificate: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "certificate.pj",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }
    async updatePJ({ 
        my_id, 
        certificate_id,
        client_castelo_status, 
        client_focus_status, 
        name, 
        cnpj,
        responsible, 
        model, 
        legal_nature, 
        password, 
        expiration_date, 
        notes, 
        was_paid, 
        payment_date, 
        payment_amount, 
        contact_info, 
        file_path, 
        has_certificate 
    }: UpdatePJRequest) {
        try {
            const exists = await prismaClient.certificatePJ.findFirst({
                where: {
                    id: certificate_id
                }
            })
            if (!exists) {
                throw new Error("Não existe")
            }

            const updated = await prismaClient.certificatePJ.update({
                where: {
                    id: certificate_id
                },
                data: {
                    client_castelo_status, 
                    client_focus_status, 
                    name, 
                    cnpj,
                    responsible, 
                    model, 
                    legal_nature, 
                    password, 
                    expiration_date, 
                    notes, 
                    was_paid, 
                    payment_date, 
                    payment_amount, 
                    contact_info, 
                    file_path, 
                    has_certificate,
                },
                select: {
                    client_castelo_status: true,
                    client_focus_status: true,
                    name: true,
                    cnpj: true,
                    responsible: true,
                    model: true,
                    legal_nature: true,
                    password: true,
                    expiration_date: true,
                    notes: true,
                    was_paid: true,
                    payment_date: true,
                    payment_amount: true,
                    contact_info: true,
                    file_path: true,
                    has_certificate: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "certificate.pj",
                referring_id: certificate_id,
                oldData: exists,
                updatedData: updated,
            });

            if (expiration_date !== exists.expiration_date) {
                await prismaClient.certificateNotification.deleteMany({
                    where: { certificate_id: certificate_id, type: "PJ" }
                })
            }

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }

    async createPF({ 
        my_id, 
        client_castelo_status,
        client_focus_status,
        name,
        cpf,
        model,
        password,
        expiration_date,
        notes,
        enterprise,
        cnpj,
        was_paid,
        payment_date,
        payment_amount,
        contact_info,
        file_path,
        has_certificate,
    }: CreatePFRequest) {
        const exists = await prismaClient.certificatePF.findFirst({
            where: { name, cpf, model }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const create = await prismaClient.certificatePF.create({
            data:{
                client_castelo_status,
                client_focus_status,
                name,
                cpf,
                model,
                password,
                expiration_date,
                notes,
                enterprise,
                cnpj,
                was_paid,
                payment_date,
                payment_amount,
                contact_info,
                file_path,
                has_certificate,
            },
            select:{
                id: true,
                client_castelo_status: true,
                client_focus_status: true,
                name: true,
                cpf: true,
                model: true,
                password: true,
                expiration_date: true,
                notes: true,
                enterprise: true,
                cnpj: true,
                was_paid: true,
                payment_date: true,
                payment_amount: true,
                contact_info: true,
                file_path: true,
                has_certificate: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "certificate.pf",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }
    async updatePF({ 
        my_id, 
        certificate_id,
        client_castelo_status,
        client_focus_status,
        name,
        cpf,
        model,
        password,
        expiration_date,
        notes,
        enterprise,
        cnpj,
        was_paid,
        payment_date,
        payment_amount,
        contact_info,
        file_path,
        has_certificate,
    }: UpdatePFRequest) {
        try {
            const exists = await prismaClient.certificatePF.findFirst({
                where: {
                    id: certificate_id
                }
            })
            if (!exists) {
                throw new Error("Não existe")
            }

            const updated = await prismaClient.certificatePF.update({
                where: {
                    id: certificate_id
                },
                data: {
                    client_castelo_status,
                    client_focus_status,
                    name,
                    cpf,
                    model,
                    password,
                    expiration_date,
                    notes,
                    enterprise,
                    cnpj,
                    was_paid,
                    payment_date,
                    payment_amount,
                    contact_info,
                    file_path,
                    has_certificate,
                },
                select: {
                    client_castelo_status: true,
                    client_focus_status: true,
                    name: true,
                    cpf: true,
                    model: true,
                    password: true,
                    expiration_date: true,
                    notes: true,
                    enterprise: true,
                    cnpj: true,
                    was_paid: true,
                    payment_date: true,
                    payment_amount: true,
                    contact_info: true,
                    file_path: true,
                    has_certificate: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "certificate.pf",
                referring_id: certificate_id,
                oldData: exists,
                updatedData: updated,
            });

            if (expiration_date !== exists.expiration_date) {
                await prismaClient.certificateNotification.deleteMany({
                    where: { certificate_id: certificate_id, type: "PF" }
                })
            }

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
}

export { CertificateService }