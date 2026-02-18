import { PrismaClient, Prisma } from "@prisma/client"
import { LogService } from "../LogService"
import { randomUUID } from "crypto"

const prismaClient = new PrismaClient();

export interface EconomicActivityItem {
    id?: string;
    code: string;
    description: string;
    type: 'Principal' | 'Secundária';
}

export interface PartnerItem {
    id?: string; 
    name: string;
    cpf: string;
    role?: string;
    share?: number; 
}

interface CreateGuidanceRequest {
    my_id: string;
    process_id: string;
    type?: string;
    request?: string;
    framework_obs?: string;
    legal_nature?: string;
    company_name?: string;
    trade_name?: string;
    cpf_cnpj?: string;
    share_capital?: number;
    iptu?: string;
    address?: string;
    comporate_purpose?: string;
    carryng?: string;
    regime?: string;
    legal_representative?: string;
    status: string;
    economic_activities?: EconomicActivityItem[];
    partners?: PartnerItem[];
}

interface UpdateGuidanceRequest extends Partial<Omit<CreateGuidanceRequest, 'process_id' | 'economic_activities' | 'partners'>> {
    my_id: string;
    id: string; // ID da Guidance
}

class ProceduralGuidanceService {
    async create(data: CreateGuidanceRequest) {
        const activities = data.economic_activities?.map(a => ({ ...a, id: randomUUID() })) || [];
        const partners = data.partners?.map(p => ({ ...p, id: randomUUID() })) || [];

        const create = await prismaClient.proceduralGuidance.create({
            data: {
                process_id: data.process_id,
                type: data.type,
                request: data.request,
                framework_obs: data.framework_obs,
                legal_nature: data.legal_nature,
                company_name: data.company_name,
                trade_name: data.trade_name,
                cpf_cnpj: data.cpf_cnpj,
                share_capital: data.share_capital,
                iptu: data.iptu,
                address: data.address,
                comporate_purpose: data.comporate_purpose,
                carryng: data.carryng,
                regime: data.regime,
                legal_representative: data.legal_representative,
                status: data.status,
                economic_activities: activities as unknown as Prisma.JsonArray,
                partners: partners as unknown as Prisma.JsonArray,
            }
        });

        const ls = new LogService();
        await ls.createLog({
            my_id: data.my_id,
            action: "Cadastro",
            referring: "regularize.guidance",
            referring_id: create.id,
            changes: "{}",
            dep: "regularize"
        });

        return create;
    }

    async update(data: UpdateGuidanceRequest) {
        const exists = await prismaClient.proceduralGuidance.findUnique({ where: { id: data.id } });
        if (!exists) throw new Error("Orientação não encontrada");

        // Remove my_id e id do objeto data para passar pro Prisma
        const { my_id, id, ...updateData } = data;

        const updated = await prismaClient.proceduralGuidance.update({
            where: { id: data.id },
            data: updateData
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id: data.my_id,
            action: "Atualização",
            referring: "regularize.guidance",
            referring_id: data.id,
            oldData: exists,
            updatedData: updated,
            dep: "regularize"
        });

        return updated;
    }

    async listByProcess(process_id: string) {
        const list = await prismaClient.proceduralGuidance.findMany({
            where: { process_id }
        });
        return list;
    }

    async detail(id: string) {
        const detail = await prismaClient.proceduralGuidance.findUnique({ where: { id } });
        return detail;
    }

    async addEconomicActivity(my_id: string, guidance_id: string, item: EconomicActivityItem) {
        const guidance = await prismaClient.proceduralGuidance.findUnique({ where: { id: guidance_id } });
        if (!guidance) throw new Error("Orientação não encontrada");

        const currentList = (guidance.economic_activities as unknown as EconomicActivityItem[]) || [];
        
        const newItem = { ...item, id: randomUUID() };
        currentList.push(newItem);

        const updated = await prismaClient.proceduralGuidance.update({
            where: { id: guidance_id },
            data: { economic_activities: currentList as unknown as Prisma.JsonArray }
        });

        const ls = new LogService();
        await ls.createLog({
            my_id, action: "Adicionar Atividade", referring: "regularize.guidance", referring_id: guidance_id, changes: JSON.stringify(newItem), dep: "regularize"
        });

        return updated;
    }

    async removeEconomicActivity(my_id: string, guidance_id: string, item_id: string) {
        const guidance = await prismaClient.proceduralGuidance.findUnique({ where: { id: guidance_id } });
        if (!guidance) throw new Error("Orientação não encontrada");

        const currentList = (guidance.economic_activities as unknown as EconomicActivityItem[]) || [];
        
        const newList = currentList.filter(i => i.id !== item_id);

        const updated = await prismaClient.proceduralGuidance.update({
            where: { id: guidance_id },
            data: { economic_activities: newList as unknown as Prisma.JsonArray }
        });

        const ls = new LogService();
        await ls.createLog({
            my_id, action: "Remover Atividade", referring: "regularize.guidance", referring_id: guidance_id, changes: `{removed_id: ${item_id}}`, dep: "regularize"
        });

        return updated;
    }

    async addPartner(my_id: string, guidance_id: string, item: PartnerItem) {
        const guidance = await prismaClient.proceduralGuidance.findUnique({ where: { id: guidance_id } });
        if (!guidance) throw new Error("Orientação não encontrada");

        const currentList = (guidance.partners as unknown as PartnerItem[]) || [];
        
        const newItem = { ...item, id: randomUUID() };
        currentList.push(newItem);

        const updated = await prismaClient.proceduralGuidance.update({
            where: { id: guidance_id },
            data: { partners: currentList as unknown as Prisma.JsonArray }
        });

        const ls = new LogService();
        await ls.createLog({
            my_id, action: "Adicionar Sócio", referring: "regularize.guidance", referring_id: guidance_id, changes: JSON.stringify(newItem), dep: "regularize"
        });

        return updated;
    }

    async removePartner(my_id: string, guidance_id: string, item_id: string) {
        const guidance = await prismaClient.proceduralGuidance.findUnique({ where: { id: guidance_id } });
        if (!guidance) throw new Error("Orientação não encontrada");

        const currentList = (guidance.partners as unknown as PartnerItem[]) || [];
        
        const newList = currentList.filter(i => i.id !== item_id);

        const updated = await prismaClient.proceduralGuidance.update({
            where: { id: guidance_id },
            data: { partners: newList as unknown as Prisma.JsonArray }
        });

        const ls = new LogService();
        await ls.createLog({
            my_id, action: "Remover Sócio", referring: "regularize.guidance", referring_id: guidance_id, changes: `{removed_id: ${item_id}}`, dep: "regularize"
        });

        return updated;
    }
}

export { ProceduralGuidanceService };