import prismaClient from "../../prisma"
import { LogService } from '../LogService'

interface Request {
    my_id: string
    client_id: string
    responsible_id: string
    advance: boolean
    advance_type?: string
    advance_amount?: number
    info: string
    previous: boolean
    onvio: boolean 
    group: string
    vt: boolean
    vt_value?: number
    vt_type?: string
    va: boolean
    assistance_fee: boolean
    union_id?: string
    bem_mais: boolean
    bsf: boolean
    reinf: boolean
    employees: number
    contact?: string
}

class PayrollService {
    async create({ 
        my_id,
        client_id,
        responsible_id,
        advance,
        advance_type,
        advance_amount,
        info,
        previous,
        onvio,
        group,
        vt,
        vt_value,
        vt_type,
        va,
        assistance_fee,
        union_id,
        bem_mais,
        bsf,
        reinf,
        employees,
        contact
    }: Request) {
        const exists = await prismaClient.payroll.findFirst({
            where: { client_id }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const create = await prismaClient.payroll.create({
            data:{
                client_id,
                responsible_id,
                advance,
                advance_type,
                advance_amount,
                info,
                previous,
                onvio,
                group,
                vt,
                vt_value,
                vt_type,
                va,
                assistance_fee,
                union_id,
                bem_mais,
                bsf,
                reinf,
                employees,
                contact
            },
            select:{
                id: true,
                client_id: true,
                responsible_id: true,
                advance: true,
                advance_type: true,
                advance_amount: true,
                info: true,
                previous: true,
                onvio: true,
                group: true,
                vt: true,
                vt_value: true,
                vt_type: true,
                va: true,
                assistance_fee: true,
                union_id: true,
                bem_mais: true,
                bsf: true,
                reinf: true,
                employees: true,
                contact: true
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "pessoal.payroll",
            referring_id: create.id,
            changes: "{}",
            dep: "pessoal"
        })

        return { create }
    }
    async update({ 
        my_id,
        client_id,
        responsible_id,
        advance,
        advance_type,
        advance_amount,
        info,
        previous,
        onvio,
        group,
        vt,
        vt_value,
        vt_type,
        va,
        assistance_fee,
        union_id,
        bem_mais,
        bsf,
        reinf,
        employees,
        contact
    }: Request) {
        try {
            const exists = await prismaClient.payroll.findFirst({ where: { client_id } })
            if (!exists) throw new Error("Não existe")

            const updated = await prismaClient.payroll.update({
                where: { client_id },
                data: {
                    responsible_id,
                    advance,
                    advance_type,
                    advance_amount,
                    info,
                    previous,
                    onvio,
                    group,
                    vt,
                    vt_value,
                    vt_type,
                    va,
                    assistance_fee,
                    union_id,
                    bem_mais,
                    bsf,
                    reinf,
                    employees,
                    contact
                },
                select: {
                    responsible_id: true,
                    advance: true,
                    advance_type: true,
                    advance_amount: true,
                    info: true,
                    previous: true,
                    onvio: true,
                    group: true,
                    vt: true,
                    vt_value: true,
                    vt_type: true,
                    va: true,
                    assistance_fee: true,
                    union_id: true,
                    bem_mais: true,
                    bsf: true,
                    reinf: true,
                    employees: true,
                    contact: true
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "pessoal.payroll",
                referring_id: exists.id,
                oldData: exists,
                updatedData: updated,
                dep: "pessoal"
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async detail(client_id: string) {
        const detail = await prismaClient.payroll.findFirst({
            where:{ client_id },
            select:{
                id: true,
                responsible_id: true,
                advance: true,
                advance_type: true,
                advance_amount: true,
                info: true,
                previous: true,
                onvio: true,
                group: true,
                vt: true,
                vt_value: true,
                vt_type: true,
                va: true,
                assistance_fee: true,
                union_id: true,
                bem_mais: true,
                bsf: true,
                reinf: true,
                employees: true,
                contact: true,
            }
        })
        return { detail }
    }
}

export { PayrollService }