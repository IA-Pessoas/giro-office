import { Prisma } from "../../generated/prisma/client.js"
import prismaClient from "../../prisma"
import { LogService } from '../LogService'

interface CreateNCMRequest {
    my_id: string
    tax_regime: string
    ncm_code: string
    federal_taxation_type: string
    description: string
    ncm_notes?: string
    cst_pis_outgoing?: string
    cst_cofins_outgoing?: string
    product_group?: string
    validity_start_date: Date
    information_source?: string
    reference_legislation?: string
    validity_end_date?: Date
}
interface UpdateNCMRequest {
    my_id: string
    ncm_id: string
    tax_regime: string
    ncm_code: string
    federal_taxation_type: string
    description: string
    ncm_notes?: string
    cst_pis_outgoing?: string
    cst_cofins_outgoing?: string
    product_group?: string
    validity_start_date: Date
    information_source?: string
    reference_legislation?: string
    validity_end_date?: Date
}

interface CreateICMSRequest {
    my_id: string
    state: string
    item_number: string
    cest_code: string
    description: string
    interstate_agreement: string
    applied_original_mva: string
    adjusted_mva: string
    original_mva: string
}
interface UpdateICMSRequest {
    my_id: string
    icms_id: string
    state: string
    item_number: string
    cest_code: string
    description: string
    interstate_agreement: string
    applied_original_mva: string
    adjusted_mva: string
    original_mva: string
}

interface CreateIPIRequest {
    my_id: string
    ncm: string
    ex: string
    description: string
    aliquot: string
}
interface UpdateIPIRequest {
    my_id: string
    ipi_id: string
    ncm: string
    ex: string
    description: string
    aliquot: string
}

class NcmService {
    async createNCM({ 
        my_id, 
        tax_regime,
        ncm_code,
        federal_taxation_type,
        description,
        ncm_notes,
        cst_pis_outgoing,
        cst_cofins_outgoing,
        product_group,
        validity_start_date,
        information_source,
        reference_legislation,
        validity_end_date,
    }: CreateNCMRequest) {
        const exists = await prismaClient.ncm.findFirst({
            where: { 
                tax_regime,
                ncm_code,
                federal_taxation_type,
                description,
                ncm_notes,
                cst_pis_outgoing,
                cst_cofins_outgoing,
                product_group,
                validity_start_date,
                information_source,
                reference_legislation,
                validity_end_date,
            }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const create = await prismaClient.ncm.create({
            data:{
                tax_regime,
                ncm_code,
                federal_taxation_type,
                description,
                ncm_notes,
                cst_pis_outgoing,
                cst_cofins_outgoing,
                product_group,
                validity_start_date,
                information_source,
                reference_legislation,
                validity_end_date,
            },
            select:{
                id: true,
                tax_regime: true,
                ncm_code: true,
                federal_taxation_type: true,
                description: true,
                ncm_notes: true,
                cst_pis_outgoing: true,
                cst_cofins_outgoing: true,
                product_group: true,
                validity_start_date: true,
                information_source: true,
                reference_legislation: true,
                validity_end_date: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "fiscal.ncm",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }
    async updateNCM({ 
        my_id, 
        ncm_id,
        tax_regime,
        ncm_code,
        federal_taxation_type,
        description,
        ncm_notes,
        cst_pis_outgoing,
        cst_cofins_outgoing,
        product_group,
        validity_start_date,
        information_source,
        reference_legislation,
        validity_end_date,
    }: UpdateNCMRequest) {
        try {
            const exists = await prismaClient.ncm.findFirst({
                where: {
                    id: ncm_id,
                }
            })
            if (!exists) {
                throw new Error("Não existe")
            }

            const updated = await prismaClient.ncm.update({
                where: {
                    id: ncm_id
                },
                data: {
                    tax_regime,
                    ncm_code,
                    federal_taxation_type,
                    description,
                    ncm_notes,
                    cst_pis_outgoing,
                    cst_cofins_outgoing,
                    product_group,
                    validity_start_date,
                    information_source,
                    reference_legislation,
                    validity_end_date,
                },
                select: {
                    id:true,
                    tax_regime: true,
                    ncm_code: true,
                    federal_taxation_type: true,
                    description: true,
                    ncm_notes: true,
                    cst_pis_outgoing: true,
                    cst_cofins_outgoing: true,
                    product_group: true,
                    validity_start_date: true,
                    information_source: true,
                    reference_legislation: true,
                    validity_end_date: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "fiscal.ncm",
                referring_id: ncm_id,
                oldData: exists,
                updatedData: updated,
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async detailNCM(ncm_id: string) {
        const detail = await prismaClient.ncm.findFirst({
            where:{
                id: ncm_id
            },
            select:{
                id: true,
                tax_regime: true,
                ncm_code: true,
                federal_taxation_type: true,
                description: true,
                ncm_notes: true,
                cst_pis_outgoing: true,
                cst_cofins_outgoing: true,
                product_group: true,
                validity_start_date: true,
                information_source: true,
                reference_legislation: true,
                validity_end_date: true,
            }
        })
        return { detail }
    }
    async listNCM(ncmCodes: string []) {
        if (!ncmCodes || ncmCodes.length === 0) {
            return [];
        }

        const list = await prismaClient.ncm.findMany({
            where:{
                ncm_code: {
                    in: ncmCodes
                }
            },
            select:{
                id: true,
                tax_regime: true,
                ncm_code: true,
                federal_taxation_type: true,
                description: true,
                ncm_notes: true,
                cst_pis_outgoing: true,
                cst_cofins_outgoing: true,
                product_group: true,
                validity_start_date: true,
                information_source: true,
                reference_legislation: true,
                validity_end_date: true,
            },
            orderBy: {
                ncm_code: 'asc'
            }
        })
        return list
    }

    async createICMS({ 
        my_id, 
        state,
        item_number,
        cest_code,
        description,
        interstate_agreement,
        applied_original_mva,
        adjusted_mva,
        original_mva,
    }: CreateICMSRequest) {
        const exists = await prismaClient.icms.findFirst({
            where: { 
                state,
                item_number,
                cest_code,
                description,
                interstate_agreement,
                applied_original_mva,
                adjusted_mva,
                original_mva,
            }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const create = await prismaClient.icms.create({
            data:{
                state,
                item_number,
                cest_code,
                description,
                interstate_agreement,
                applied_original_mva,
                adjusted_mva,
                original_mva,
            },
            select:{
                id: true,
                state: true,
                item_number: true,
                cest_code: true,
                description: true,
                interstate_agreement: true,
                applied_original_mva: true,
                adjusted_mva: true,
                original_mva: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "fiscal.icms",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }
    async updateICMS({ 
        my_id, 
        icms_id,
        state,
        item_number,
        cest_code,
        description,
        interstate_agreement,
        applied_original_mva,
        adjusted_mva,
        original_mva,
    }: UpdateICMSRequest) {
        try {
            const exists = await prismaClient.icms.findFirst({
                where: {
                    id: icms_id,
                }
            })
            if (!exists) {
                throw new Error("Não existe")
            }

            const updated = await prismaClient.icms.update({
                where: {
                    id: icms_id
                },
                data: {
                    state,
                    item_number,
                    cest_code,
                    description,
                    interstate_agreement,
                    applied_original_mva,
                    adjusted_mva,
                    original_mva,
                },
                select: {
                    id:true,
                    state: true,
                    item_number: true,
                    cest_code: true,
                    description: true,
                    interstate_agreement: true,
                    applied_original_mva: true,
                    adjusted_mva: true,
                    original_mva: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "fiscal.icms",
                referring_id: icms_id,
                oldData: exists,
                updatedData: updated,
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async detailICMS(icms_id: string) {
        const detail = await prismaClient.icms.findFirst({
            where:{
                id: icms_id
            },
            select:{
                id: true,
                state: true,
                item_number: true,
                cest_code: true,
                description: true,
                interstate_agreement: true,
                applied_original_mva: true,
                adjusted_mva: true,
                original_mva: true,
            }
        })
        return { detail }
    }
    async listICMS(icmsCodes: string []) {
        if (!icmsCodes || icmsCodes.length === 0) {
            return [];
        }

        const list = await prismaClient.icms.findMany({
            where:{
                description: {
                    in: icmsCodes
                }
            },
            select:{
                id: true,
                state: true,
                item_number: true,
                cest_code: true,
                description: true,
                interstate_agreement: true,
                applied_original_mva: true,
                adjusted_mva: true,
                original_mva: true,
            },
            orderBy: {
                description: 'asc'
            }
        })
        return list
    }
    
    async createIPI({ 
        my_id, 
        ncm,
        ex,
        description,
        aliquot,
    }: CreateIPIRequest) {
        const exists = await prismaClient.ipi.findFirst({
            where: { 
                ncm,
                ex,
                description,
                aliquot,
            }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const create = await prismaClient.ipi.create({
            data:{
                ncm,
                ex,
                description,
                aliquot,
            },
            select:{
                id: true,
                ncm: true,
                ex: true,
                description: true,
                aliquot: true,
            }
        })

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "fiscal.icms",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }
    async updateIPI({ 
        my_id, 
        ipi_id,
        ncm,
        ex,
        description,
        aliquot,
    }: UpdateIPIRequest) {
        try {
            const exists = await prismaClient.ipi.findFirst({
                where: {
                    id: ipi_id,
                }
            })
            if (!exists) {
                throw new Error("Não existe")
            }

            const updated = await prismaClient.ipi.update({
                where: {
                    id: ipi_id
                },
                data: {
                    ncm,
                    ex,
                    description,
                    aliquot,
                },
                select: {
                    id:true,
                    ncm: true,
                    ex: true,
                    description: true,
                    aliquot: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "fiscal.ipi",
                referring_id: ipi_id,
                oldData: exists,
                updatedData: updated,
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async detailIPI(ipi_id: string) {
        const detail = await prismaClient.ipi.findFirst({
            where:{
                id: ipi_id
            },
            select:{
                id: true,
                ncm: true,
                ex: true,
                description: true,
                aliquot: true,
            }
        })
        return { detail }
    }
    async listIPI(ipiCodes: string []) {
        if (!ipiCodes || ipiCodes.length === 0) {
            return [];
        }

        const list = await prismaClient.ipi.findMany({
            where:{
                ncm: {
                    in: ipiCodes
                }
            },
            select:{
                id: true,
                ncm: true,
                ex: true,
                description: true,
                aliquot: true,
            },
            orderBy: {
                ncm: 'asc'
            }
        })
        return list
    }

    public async seachNCM(ncmCode: string) {
        if (!ncmCode) {
            throw new Error("O código NCM é obrigatório.");
        }
        
        const ncmPrefix = ncmCode.substring(0, 4);

        const ncmDataQuery = prismaClient.ncm.findFirst({
            where: { ncm_code: ncmCode }
        });

        const icmsDataQuery = prismaClient.icms.findMany({
            where: {
                description: {
                    contains: ncmPrefix,
                    mode: 'insensitive'
                }
            }
        });

        const ipiDataQuery = prismaClient.ipi.findMany({
            where: { ncm: ncmCode }
        });

        const [ncmResult, icmsResult, ipiResult] = await prismaClient.$transaction([
            ncmDataQuery,
            icmsDataQuery,
            ipiDataQuery
        ]);

        return {
            ncm: ncmResult,
            icms: icmsResult,
            ipi: ipiResult
        };
    }
}

export { NcmService };