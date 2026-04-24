import prismaClient from "../../prisma"
import { LogService } from '../LogService'

interface CreateInstallmentRequest {
    my_id: string
    client_id: string
    type: string
    legal_nature: string
    jurisdiction: string
    is_automatic_debit: boolean
    first_installment_amount: number
    current_month_installment_amount: number
    agreed_installments_count: number
    enrollment_date: Date
}
interface UpdateInstallmentRequest {
    my_id: string
    installment_id: string
    type: string
    legal_nature: string
    jurisdiction: string
    is_automatic_debit: boolean
    consolidated_total_amount: number
    first_installment_amount: number
    current_month_installment_amount: number
    agreed_installments_count: number
    enrollment_date?: Date
    document_url: string
    situation_shutdown: string
    status: string
    completion_date?: Date
}
interface CreateInstallmentCompetenceRequest {
    my_id: string
    competence: string
    installment_id: string
    how_many_paid: number
    how_many_overdue: number
    download: boolean
    download_notes: string
    upload_file: boolean
    is_sent: boolean
    submission_type: string
    notes: string
    installment_amount: number
}
interface UpdateInstallmentCompetenceRequest {
    my_id: string    
    competence_installment_id: string
    how_many_paid: number
    how_many_overdue: number
    download: boolean
    download_notes?: string
    upload_file?: boolean
    is_sent?: boolean
    submission_type?: string
    notes?: string
    installment_amount: number
}

class InstallmentService {
    async create({ 
        my_id,
        client_id,
        type,
        legal_nature,
        jurisdiction,
        is_automatic_debit,
        first_installment_amount,
        current_month_installment_amount,
        agreed_installments_count,
        enrollment_date,
    }: CreateInstallmentRequest) {
        const exists = await prismaClient.installment.findFirst({
            where: { 
                client_id,
                type,
                legal_nature,
                jurisdiction,
                is_automatic_debit,
                first_installment_amount,
                current_month_installment_amount,
                agreed_installments_count,
            }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const create = await prismaClient.installment.create({
            data:{
                client_id,
                type,
                legal_nature,
                jurisdiction,
                is_automatic_debit,
                consolidated_total_amount: 0,
                first_installment_amount,
                current_month_installment_amount,
                outstanding_balance: 0,
                paid_installments_count: 0,
                agreed_installments_count,
                remaining_installments_count: agreed_installments_count,
                overdue_installments_count: 0,
                enrollment_date,
                document_url: "",
                status: "Ativo",
                down_payment_installments_count: 0,
            },
            select:{
                id: true,
                client_id: true,
                type: true,
                legal_nature: true,
                jurisdiction: true,
                is_automatic_debit: true,
                consolidated_total_amount: true,
                first_installment_amount: true,
                current_month_installment_amount: true,
                outstanding_balance: true,
                paid_installments_count: true,
                agreed_installments_count: true,
                remaining_installments_count: true,
                overdue_installments_count: true,
                enrollment_date: true,
                document_url: true,
                status: true,
                completion_date: true,
                down_payment_installments_count: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "parcelamento.installments",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }
    async update({ 
        my_id, 
        installment_id,
        type,
        legal_nature,
        jurisdiction,
        is_automatic_debit,
        consolidated_total_amount,
        first_installment_amount,
        current_month_installment_amount,
        agreed_installments_count,
        enrollment_date,
        document_url,
        situation_shutdown,
        status,
        completion_date,
    }: UpdateInstallmentRequest) {
        try {
            const exists = await prismaClient.installment.findFirst({
                where: {
                    id: installment_id
                }
            })
            if (!exists) {
                throw new Error("Não existe")
            }

            const updated = await prismaClient.installment.update({
                where: {
                    id: installment_id
                },
                data: {
                    type,
                    legal_nature,
                    jurisdiction,
                    is_automatic_debit,
                    consolidated_total_amount,
                    first_installment_amount,
                    current_month_installment_amount,
                    agreed_installments_count,
                    enrollment_date,
                    document_url,
                    situation_shutdown,
                    status,
                    completion_date,
                },
                select: {
                    type: true,
                    legal_nature: true,
                    jurisdiction: true,
                    is_automatic_debit: true,
                    consolidated_total_amount: true,
                    first_installment_amount: true,
                    current_month_installment_amount: true,
                    outstanding_balance: true,
                    paid_installments_count: true,
                    agreed_installments_count: true,
                    remaining_installments_count: true,
                    overdue_installments_count: true,
                    enrollment_date: true,
                    document_url: true,
                    situation_shutdown: true,
                    status: true,
                    completion_date: true,
                    down_payment_installments_count: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "parcelamento.installments",
                referring_id: installment_id,
                oldData: exists,
                updatedData: updated,
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async detail(installment_id: string) {
        const detail = await prismaClient.installment.findFirst({
            where:{
                id: installment_id
            },
            select:{
                id: true,
                client_id: true,
                type: true,
                legal_nature: true,
                jurisdiction: true,
                is_automatic_debit: true,
                consolidated_total_amount: true,
                first_installment_amount: true,
                current_month_installment_amount: true,
                outstanding_balance: true,
                paid_installments_count: true,
                agreed_installments_count: true,
                remaining_installments_count: true,
                overdue_installments_count: true,
                enrollment_date: true,
                document_url: true,
                status: true,
                completion_date: true,
                down_payment_installments_count: true,
            }
        })
        return { detail }
    }
    async list(client_id: string) {
        const list = await prismaClient.installment.findMany({
            where:{ client_id },
            select:{
                id: true,
                client_id: true,
                type: true,
                legal_nature: true,
                jurisdiction: true,
                is_automatic_debit: true,
                consolidated_total_amount: true,
                first_installment_amount: true,
                current_month_installment_amount: true,
                outstanding_balance: true,
                paid_installments_count: true,
                agreed_installments_count: true,
                remaining_installments_count: true,
                overdue_installments_count: true,
                enrollment_date: true,
                document_url: true,
                status: true,
                completion_date: true,
                down_payment_installments_count: true,
            }
        })
        return list
    }

    async createInstallmentCompetence({ 
        my_id,
        competence,
        installment_id,
        how_many_paid,
        how_many_overdue,
        download,
        download_notes,
        upload_file,
        is_sent,
        submission_type,
        notes,
        installment_amount,
    }: CreateInstallmentCompetenceRequest) {
        const exists = await prismaClient.installmentCompetencies.findFirst({
            where: { 
                competence,
                installment_id
            }
        })
        if (exists) {
            return { exists }
        } else {
            const create = await prismaClient.installmentCompetencies.create({
                data:{
                    installment_id,
                    competence,
                    how_many_paid,
                    how_many_overdue,
                    download,
                    download_notes,
                    upload_file,
                    is_sent,
                    submission_type,
                    notes,
                    installment_amount,
                },
                select:{
                    id: true,
                    installment_id: true,
                    competence: true,
                    how_many_paid: true,
                    how_many_overdue: true,
                    download: true,
                    download_notes: true,
                    upload_file: true,
                    is_sent: true,
                    submission_type: true,
                    notes: true,
                    installment_amount: true,
                }
            }) 

            const ls = new LogService()
            await ls.createLog({
                my_id,
                action: "Cadastro",
                referring: "parcelamento.installmentsCompetencies",
                referring_id: create.id,
                changes: "{}"
            })

            return { create }
        }
    }
    async updateInstallmentCompetence({ 
        my_id, 
        competence_installment_id,
        how_many_paid,
        how_many_overdue,
        download,
        download_notes,
        upload_file,
        is_sent,
        submission_type,
        notes,
        installment_amount,
    }: UpdateInstallmentCompetenceRequest) {
        try {
            const exists = await prismaClient.installmentCompetencies.findFirst({
                where: {
                    id: competence_installment_id
                }
            })
            if (!exists) {
                throw new Error("Não existe")
            }

            const updated = await prismaClient.installmentCompetencies.update({
                where: {
                    id: competence_installment_id
                },
                data: {
                    how_many_paid,
                    how_many_overdue,
                    download,
                    download_notes,
                    upload_file,
                    is_sent,
                    submission_type,
                    notes,
                    installment_amount,
                },
                select: {
                    how_many_paid: true,
                    how_many_overdue: true,
                    download: true,
                    download_notes: true,
                    upload_file: true,
                    is_sent: true,
                    submission_type: true,
                    notes: true,
                    installment_amount: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "parcelamento.installmentsCompetencies",
                referring_id: competence_installment_id,
                oldData: exists,
                updatedData: updated,
            });

            if (how_many_paid > 0 && how_many_paid !== exists.how_many_paid)
                this.formulas(my_id, exists.installment_id)

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }

    async formulas(my_id: string, installment_id: string) {
        const installment = await prismaClient.installment.findFirst({    
            where:{
                id: installment_id
            },
            select:{
                id: true,
                client_id: true,
                type: true,
                jurisdiction: true,
                is_automatic_debit: true,
                consolidated_total_amount: true,
                first_installment_amount: true,
                current_month_installment_amount: true,
                outstanding_balance: true,
                paid_installments_count: true,
                agreed_installments_count: true,
                remaining_installments_count: true,
                overdue_installments_count: true,
                enrollment_date: true,
                document_url: true,
                status: true,
                completion_date: true,
                down_payment_installments_count: true,
            }
        })
        if (!installment)
            throw new Error("Não existe")

        let installment_paid = installment.paid_installments_count 
        let installment_overdue = installment.overdue_installments_count 
        
        if (installment_paid >= installment_overdue)
            installment_overdue = 0
        else
            installment_overdue -= installment_paid

        let remaining_installments = installment.agreed_installments_count - installment_paid
        let outstanding_balance = installment.consolidated_total_amount * remaining_installments
        let status = installment.status
        let date = installment.completion_date

        if (installment.status == 'Ativo' && remaining_installments == 0) {
            status = 'Liquidado'
            date = new Date()
        } else if (installment.status == 'Liquidado' && remaining_installments != 0) {
            status = 'Ativo'
            date = new Date()
        }

        const updated = await prismaClient.installment.update({
            where: {
                id: installment_id
            },
            data: {
                outstanding_balance,
                paid_installments_count: installment_paid,
                remaining_installments_count: remaining_installments,
                overdue_installments_count: installment_overdue,
                status,
                completion_date: date,
            },
            select: {
                outstanding_balance: true,
                paid_installments_count: true,
                remaining_installments_count: true,
                overdue_installments_count: true,
                status: true,
                completion_date: true,
            }
        })

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id,
            action: "Atualização",
            referring: "parcelamento.installments",
            referring_id: installment_id,
            oldData: installment,
            updatedData: updated,
        });

        return updated
    }

}

export { InstallmentService }