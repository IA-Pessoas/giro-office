import prismaClient from "../../prisma";
import { LogService } from "../LogService";

interface CreateRequestDTO {
    my_id: string;
    title: string;
    description: string;
    category_id: string;
    urgency: '1' | '2' | '3'; // 1=Baixa, 2=Media, 3=Alta
}

interface SendMessageDTO {
    my_id: string;
    request_id: string;
    message: string;
    type: 'Message' | 'Solution' | 'Rejection' | 'Acceptance'; 
    attachment?: string;
}

class RhRequestService {

    // 1. Abrir Chamado
    async create(data: CreateRequestDTO) {
        const urgencyMap = { '1': 'Baixa', '2': 'Media', '3': 'Alta' };

        const request = await prismaClient.rhRequest.create({
            data: {
                title: data.title,
                description: data.description,
                category_id: data.category_id,
                requester_id: data.my_id,
                urgency: urgencyMap[data.urgency],
                status: 'Novo',
                // assigned_to começa null
            }
        });

        // Log e Notificação (implementar notificação aqui)
        const ls = new LogService();
        await ls.createLog({
            my_id: data.my_id,
            action: "Abrir Chamado RH",
            referring: "rh.requests",
            referring_id: request.id,
            changes: `Titulo: ${data.title}`,
            dep: "rh"
        });

        return request;
    }

    // 2. Listar Chamados (Com Filtros)
    async list(filters: { status?: string, requester_id?: string, assigned_to_id?: string }) {
        const where: any = {};
        if (filters.status) where.status = filters.status;
        if (filters.requester_id) where.requester_id = filters.requester_id;
        if (filters.assigned_to_id) where.assigned_to_id = filters.assigned_to_id;

        return await prismaClient.rhRequest.findMany({
            where,
            include: {
                category: { select: { name: true } },
                requester: { select: { name: true } },
                assigned_to: { select: { name: true } }
            },
            orderBy: { updated_at: 'desc' }
        });
    }

    // 3. Detalhar Chamado (Inclui mensagens)
    async detail(id: string) {
        const request = await prismaClient.rhRequest.findUnique({
            where: { id },
            include: {
                category: { select: { name: true } },
                requester: { select: { name: true } },
                assigned_to: { select: { name: true } },
                messages: {
                    include: { sender: { select: { name: true } } },
                    orderBy: { created_at: 'asc' } // Timeline cronológica
                }
            }
        });
        
        if (!request) throw new Error("Chamado não encontrado");
        return request;
    }

    // 4. Assumir Chamado (RH)
    async assignToMe(my_id: string, request_id: string) {
        const request = await prismaClient.rhRequest.findUnique({ where: { id: request_id } });
        if (!request) throw new Error("Chamado não encontrado");

        // Se estava 'Novo', muda para 'Andamento'
        const newStatus = request.status === 'Novo' ? 'Andamento' : request.status;

        const updated = await prismaClient.rhRequest.update({
            where: { id: request_id },
            data: {
                assigned_to_id: my_id,
                status: newStatus
            }
        });

        return updated;
    }

    // 5. Enviar Mensagem / Interagir
    async sendMessage(data: SendMessageDTO) {
        // Cria a mensagem
        await prismaClient.rhMessage.create({
            data: {
                request_id: data.request_id,
                sender_id: data.my_id,
                message: data.message,
                type: data.type,
                attachment: data.attachment
            }
        });

        // Atualiza status do Chamado baseado na interação (Lógica do PHP adaptada)
        let newStatus = '';

        if (data.type === 'Solution') {
            newStatus = 'Solucionado'; // RH propôs solução
        } else if (data.type === 'Rejection') {
            newStatus = 'Andamento'; // Colaborador recusou, volta pra andamento
        } else if (data.type === 'Acceptance') {
            newStatus = 'Finalizado'; // Colaborador aceitou, fim.
        } else {
            // Mensagem normal atualiza apenas o timestamp 'updated_at'
            // O Prisma faz isso automaticamente com @updatedAt
        }

        if (newStatus) {
            await prismaClient.rhRequest.update({
                where: { id: data.request_id },
                data: { status: newStatus }
            });
        }

        return { message: "Mensagem enviada" };
    }
}

export { RhRequestService };