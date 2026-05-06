import prismaClient from "../../prisma";
import { LogService } from "../LogService";

interface CreateRequestDTO {
    my_id: string;
    title: string;
    description: string;
    category_id: string;
    urgency: '1' | '2' | '3';
}

interface SendMessageDTO {
    my_id: string;
    request_id: string;
    message: string;
    type: string;
    attachment?: string;
}

class TiHelpdeskService {    
    // --- CATEGORIAS ---
    async createCategory(name: string) {
        return await prismaClient.tICategoryRequest.create({ data: { name } });
    }
    async listCategories() {
        return await prismaClient.tICategoryRequest.findMany({ where: { active: true } });
    }

    // --- CHAMADOS ---
    async createRequest(data: CreateRequestDTO) {
        const urgencyMap = { '1': 'Baixa', '2': 'Media', '3': 'Alta' };
        const request = await prismaClient.tIRequest.create({
            data: {
                title: data.title,
                description: data.description,
                category_id: data.category_id,
                requester_id: data.my_id,
                urgency: urgencyMap[data.urgency],
                status: 'Novo'
            }
        });
        
        const ls = new LogService();
        await ls.createLog({ my_id: data.my_id, action: "Abrir Chamado TI", referring: "ti.requests", referring_id: request.id, changes: data.title, dep: "ti" });
        return request;
    }

    async listRequests(filters: { status?: string, requester_id?: string, assigned_to_id?: string }) {
        // ... Lógica idêntica ao RH, apenas mudando para prismaClient.tIRequest
        const where: any = {};
        if (filters.status) where.status = filters.status;
        if (filters.requester_id) where.requester_id = filters.requester_id;
        if (filters.assigned_to_id) where.assigned_to_id = filters.assigned_to_id;

        return await prismaClient.tIRequest.findMany({
            where,
            include: { category: true, requester: { select: { name: true } }, assigned_to: { select: { name: true } } },
            orderBy: { updated_at: 'desc' }
        });
    }

    async detailRequest(id: string) {
        return await prismaClient.tIRequest.findUnique({
            where: { id },
            include: {
                category: true, requester: true, assigned_to: true,
                messages: { include: { sender: { select: { name: true } } }, orderBy: { created_at: 'asc' } }
            }
        });
    }

    async assignRequest(my_id: string, request_id: string) {
        return await prismaClient.tIRequest.update({
            where: { id: request_id },
            data: { assigned_to_id: my_id, status: 'Andamento' }
        });
    }

    async sendMessage(data: SendMessageDTO) {
        await prismaClient.tIMessage.create({
            data: {
                request_id: data.request_id,
                sender_id: data.my_id,
                message: data.message,
                type: data.type,
                attachment: data.attachment
            }
        });

        let newStatus = '';
        if (data.type === 'Solution') newStatus = 'Solucionado';
        else if (data.type === 'Rejection') newStatus = 'Andamento';
        else if (data.type === 'Acceptance') newStatus = 'Finalizado';

        if (newStatus) {
            await prismaClient.tIRequest.update({ where: { id: data.request_id }, data: { status: newStatus } });
        }
        return { message: "Enviada" };
    }
}
export { TiHelpdeskService };