import prismaClient from "../../prisma"
import { LogService } from '../LogService'

interface CreateRequest {
    my_id: string
    client_id: string
    year: number
    tff_is_applicable: boolean 
    tff_amount: number
    tff_notes?: string
    tff_analysis_is_done: boolean 
    tff_analysis_notes?: string
    tff_sent_date?: Date
    tff_due_date?: Date
    tlp_is_applicable: boolean 
    tlp_amount: number
    tlp_notes?: string
    tlp_is_sent: string
    tlp_sent_date?: Date
    tlp_due_date?: Date
    tlp_not_email: boolean
    tll_is_applicable: boolean
    tll_amount: number
    tll_notes?: string
    tll_is_sent: string
    tll_sent_date?: Date
    tll_due_date?: Date
    tll_analysis_is_done: boolean 
    tll_analysis_notes?: string
}
interface UpdateRequest extends CreateRequest {
    id: string
}

class MunicipalTaxesService {
    async create({ 
        my_id,
        client_id,
        year,
        tff_is_applicable,
        tff_amount,
        tff_notes,
        tff_analysis_is_done,
        tff_analysis_notes,
        tff_sent_date,
        tff_due_date,
        tlp_is_applicable,
        tlp_amount,
        tlp_notes,
        tlp_is_sent,
        tlp_sent_date,
        tlp_due_date,
        tlp_not_email,
        tll_is_applicable,
        tll_amount,
        tll_notes,
        tll_is_sent,
        tll_sent_date,
        tll_due_date,
        tll_analysis_is_done,
        tll_analysis_notes,
    }: CreateRequest) {
        const exists = await prismaClient.municipalTaxes.findFirst({
            where: { client_id, year }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const create = await prismaClient.municipalTaxes.create({
            data:{
                client_id,
                year,
                tff_is_applicable,
                tff_amount,
                tff_notes,
                tff_analysis_is_done,
                tff_analysis_notes,
                tff_sent_date,
                tff_due_date,
                tlp_is_applicable,
                tlp_amount,
                tlp_notes,
                tlp_is_sent,
                tlp_sent_date,
                tlp_due_date,
                tlp_not_email,
                tll_is_applicable,
                tll_amount,
                tll_notes,
                tll_is_sent,
                tll_sent_date,
                tll_due_date,
                tll_analysis_is_done,
                tll_analysis_notes,
            },
            select:{
                id: true,
                client_id: true,
                year: true,
                tff_is_applicable: true,
                tff_amount: true,
                tff_notes: true,
                tff_analysis_is_done: true,
                tff_analysis_notes: true,
                tff_sent_date: true,
                tff_due_date: true,
                tlp_is_applicable: true,
                tlp_amount: true,
                tlp_notes: true,
                tlp_is_sent: true,
                tlp_sent_date: true,
                tlp_due_date: true,
                tlp_not_email: true,
                tll_is_applicable: true,
                tll_amount: true,
                tll_notes: true,
                tll_is_sent: true,
                tll_sent_date: true,
                tll_due_date: true,
                tll_analysis_is_done: true,
                tll_analysis_notes: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "regularize.municipalTaxes",
            referring_id: create.id,
            changes: "{}",
            dep: "regularize"
        })

        return { create }
    }
    async update({ 
        my_id, 
        id, 
        tff_is_applicable,
        tff_amount,
        tff_notes,
        tff_analysis_is_done,
        tff_analysis_notes,
        tff_sent_date,
        tff_due_date,
        tlp_is_applicable,
        tlp_amount,
        tlp_notes,
        tlp_is_sent,
        tlp_sent_date,
        tlp_due_date,
        tlp_not_email,
        tll_is_applicable,
        tll_amount,
        tll_notes,
        tll_is_sent,
        tll_sent_date,
        tll_due_date,
        tll_analysis_is_done,
        tll_analysis_notes,
    }: UpdateRequest) {
        try {
            const exists = await prismaClient.municipalTaxes.findFirst({ where: { id } })
            if (!exists) throw new Error("Não existe")

            const updated = await prismaClient.municipalTaxes.update({
                where: { id },
                data: {
                    tff_is_applicable,
                    tff_amount,
                    tff_notes,
                    tff_analysis_is_done,
                    tff_analysis_notes,
                    tff_sent_date,
                    tff_due_date,
                    tlp_is_applicable,
                    tlp_amount,
                    tlp_notes,
                    tlp_is_sent,
                    tlp_sent_date,
                    tlp_due_date,
                    tlp_not_email,
                    tll_is_applicable,
                    tll_amount,
                    tll_notes,
                    tll_is_sent,
                    tll_sent_date,
                    tll_due_date,
                    tll_analysis_is_done,
                    tll_analysis_notes,
                },
                select: {
                    id: true,
                    client_id: true,
                    year: true,
                    tff_is_applicable: true,
                    tff_amount: true,
                    tff_notes: true,
                    tff_analysis_is_done: true,
                    tff_analysis_notes: true,
                    tff_sent_date: true,
                    tff_due_date: true,
                    tlp_is_applicable: true,
                    tlp_amount: true,
                    tlp_notes: true,
                    tlp_is_sent: true,
                    tlp_sent_date: true,
                    tlp_due_date: true,
                    tlp_not_email: true,
                    tll_is_applicable: true,
                    tll_amount: true,
                    tll_notes: true,
                    tll_is_sent: true,
                    tll_sent_date: true,
                    tll_due_date: true,
                    tll_analysis_is_done: true,
                    tll_analysis_notes: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "regularize.municipalTaxes",
                referring_id: exists.id,
                oldData: exists,
                updatedData: updated,
                dep: "regularize"
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async detail(id: string) {
        const detail = await prismaClient.municipalTaxes.findFirst({
            where:{ id },
            select:{
                id: true,
                client_id: true,
                year: true,
                tff_is_applicable: true,
                tff_amount: true,
                tff_notes: true,
                tff_analysis_is_done: true,
                tff_analysis_notes: true,
                tff_sent_date: true,
                tff_due_date: true,
                tlp_is_applicable: true,
                tlp_amount: true,
                tlp_notes: true,
                tlp_is_sent: true,
                tlp_sent_date: true,
                tlp_due_date: true,
                tlp_not_email: true,
                tll_is_applicable: true,
                tll_amount: true,
                tll_notes: true,
                tll_is_sent: true,
                tll_sent_date: true,
                tll_due_date: true,
                tll_analysis_is_done: true,
                tll_analysis_notes: true,
            }
        })
        return { detail }
    }
    public async list(year: number) {
        const list = await prismaClient.client.findMany({
            where: { status: 'Ativo' },
            select: {
                id: true,
                dominio_code: true,
                name: true, 
                cpf_cnpj: true, 
                city: true, 
                municipalTaxes: {
                    where: { year },
                    select: { id: true },
                },
            },
            orderBy: {
                name: 'asc',
            },
        });
        return list;
    }
}

export { MunicipalTaxesService }