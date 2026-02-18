import prismaClient from "../../prisma";
import { LogService } from "../LogService";
import { CONTABIL_FIELDS, FISCAL_FIELDS, TriageStatus } from "../../types/TriageTypes";
import { Prisma } from "@prisma/client";

interface UpsertConfigDTO {
    my_id: string;
    client_id: string;
    type: 'CONTABIL' | 'FISCAL';
    active_items: string[]; // Lista de campos que o cliente TEM
}

interface GetOrCreateMonthlyDTO {
    my_id: string;
    client_id: string;
    competence: string;
    type: 'CONTABIL' | 'FISCAL';
}

interface UpdateItemDTO {
    my_id: string;
    triage_id: string;
    field: string;
    value: TriageStatus | string | Date | boolean; // Pode ser status, data, valor ou bool
}

class TriageService {

    // --- CONFIGURAÇÃO (PADRÃO DO CLIENTE) ---
    
    async upsertConfig(data: UpsertConfigDTO) {
        // Valida se os campos enviados existem na lista permitida
        const allowed = data.type === 'CONTABIL' ? CONTABIL_FIELDS : FISCAL_FIELDS;
        const validItems = data.active_items.filter(item => allowed.includes(item));

        const config = await prismaClient.triageConfig.upsert({
            where: {
                client_id_type: {
                    client_id: data.client_id,
                    type: data.type
                }
            },
            update: { active_items: validItems },
            create: {
                client_id: data.client_id,
                type: data.type,
                active_items: validItems
            }
        });

        const ls = new LogService();
        await ls.createLog({
            my_id: data.my_id,
            action: `Configurar Padrão ${data.type}`,
            referring: "triagem.config",
            referring_id: config.id,
            changes: JSON.stringify(validItems),
            dep: "triagem"
        });

        return config;
    }

    // --- MOVIMENTO MENSAL ---

    /**
     * Busca o registro do mês. Se não existir, CRIA baseado na Configuração Padrão.
     */
    async getOrCreateMonthly(data: GetOrCreateMonthlyDTO) {
        // 1. Tenta achar existente
        const existing = await prismaClient.triageMonthly.findUnique({
            where: {
                client_id_competence_type: {
                    client_id: data.client_id,
                    competence: data.competence,
                    type: data.type
                }
            },
            include: { responsible: { select: { name: true } } }
        });

        if (existing) return existing;

        // 2. Se não existe, busca a configuração padrão do cliente
        const config = await prismaClient.triageConfig.findUnique({
            where: {
                client_id_type: {
                    client_id: data.client_id,
                    type: data.type
                }
            }
        });

        // 3. Monta o JSON inicial
        // Se estiver na config (active_items), status inicial é "" (Padrão).
        // Se NÃO estiver na config, status inicial é "nao possui".
        const initialChecklist: Record<string, string> = {};
        const allFields = data.type === 'CONTABIL' ? CONTABIL_FIELDS : FISCAL_FIELDS;
        
        // Converte JsonArray para string[] de forma segura
        const activeItems = (config?.active_items as string[]) || [];

        allFields.forEach(field => {
            if (activeItems.includes(field)) {
                initialChecklist[field] = ""; // Pendente/Padrão
            }
        });

        // 4. Cria o registro
        const newRecord = await prismaClient.triageMonthly.create({
            data: {
                client_id: data.client_id,
                competence: data.competence,
                type: data.type,
                checklist: initialChecklist,
                // Define valores padrão para campos extras
                triad_moviment: false
            }
        });

        return newRecord;
    }

    /**
     * Atualiza um ÚNICO campo (seja do checklist JSON ou coluna específica)
     */
    async updateField(data: UpdateItemDTO) {
        const record = await prismaClient.triageMonthly.findUnique({ where: { id: data.triage_id } });
        if (!record) throw new Error("Registro de triagem não encontrado");

        let updateData: any = {};
        const specialFields = ['download_date', 'settlement_date', 'billing_amount', 'triad_moviment', 'responsible_id', 'notes', 'justification'];

        // CENÁRIO A: Campo Especial (Coluna na tabela)
        if (specialFields.includes(data.field)) {
            // Tratamento de datas
            if (data.field.includes('date') && typeof data.value === 'string') {
                updateData[data.field] = new Date(data.value);
            } else {
                updateData[data.field] = data.value;
            }
        } 
        // CENÁRIO B: Item do Checklist (Dentro do JSON)
        else {
            const currentChecklist = record.checklist as Prisma.JsonObject;
            
            // Atualiza apenas a chave específica
            updateData.checklist = {
                ...currentChecklist,
                [data.field]: data.value
            };
        }

        const updated = await prismaClient.triageMonthly.update({
            where: { id: data.triage_id },
            data: updateData
        });

        // Log simplificado
        const ls = new LogService();
        await ls.createLog({
            my_id: data.my_id,
            action: "Atualizar Triagem",
            referring: "triagem.monthly",
            referring_id: data.triage_id,
            changes: `Campo: ${data.field} -> ${data.value}`,
            dep: "triagem"
        });

        return updated;
    }

    async listByCompetence(type: 'CONTABIL' | 'FISCAL', competence: string) {
        return await prismaClient.triageMonthly.findMany({
            where: { type, competence },
            include: { client: { select: { name: true } } }
        });
    }
}

export { TriageService };