import prismaClient from "../../prisma";
import { LogService } from "../LogService";

interface CreateQuestionDTO {
    my_id: string;
    question: string;
    type: 'behavioral' | 'technical' | 'tech' | 'leadership'; // Tipos fixos do sistema
}

interface UpdateQuestionDTO extends CreateQuestionDTO {
    id: string;
    active?: boolean;
}

class ScoreQuestionService {

    // 1. Criar Nova Pergunta
    async create({ my_id, question, type }: CreateQuestionDTO) {
        const newQuestion = await prismaClient.scoreQuestion.create({
            data: {
                question,
                type,
                active: true
            }
        });

        // const ls = new LogService();
        // await ls.createLog({
        //     my_id,
        //     action: "Criar Pergunta Score",
        //     referring: "rh.score_questions",
        //     referring_id: newQuestion.id,
        //     changes: `Tipo: ${type} - Texto: ${question}`,
        //     dep: "rh"
        // });

        return newQuestion;
    }

    // 2. Atualizar Pergunta
    async update({ my_id, id, question, type, active }: UpdateQuestionDTO) {
        const exists = await prismaClient.scoreQuestion.findUnique({ where: { id } });
        if (!exists) throw new Error("Pergunta não encontrada.");

        const updated = await prismaClient.scoreQuestion.update({
            where: { id },
            data: {
                question,
                type,
                active // Permite ativar/inativar
            }
        });

        const ls = new LogService();
        await ls.createLog({
            my_id,
            action: "Editar Pergunta Score",
            referring: "rh.score_questions",
            referring_id: id,
            changes: `De: ${exists.question} (${exists.type}) Para: ${question} (${type})`,
            dep: "rh"
        });

        return updated;
    }

    // 3. Listar Perguntas (Com filtro opcional por tipo)
    async list(type?: string, showInactive: boolean = false) {
        // Monta o filtro
        const where: any = {};
        
        if (type && type !== 'Todos') {
            where.type = type;
        }

        if (!showInactive) {
            where.active = true; // Por padrão traz só as ativas
        }

        return await prismaClient.scoreQuestion.findMany({
            where,
            orderBy: { type: 'asc' }
        });
    }

    // 4. "Deletar" (Na verdade, inativar é mais seguro)
    async delete(my_id: string, id: string) {
        // Vamos apenas inativar para não quebrar relatórios antigos
        const updated = await prismaClient.scoreQuestion.update({
            where: { id },
            data: { active: false }
        });

        const ls = new LogService();
        await ls.createLog({
            my_id,
            action: "Inativar Pergunta Score",
            referring: "rh.score_questions",
            referring_id: id,
            changes: "Pergunta inativada",
            dep: "rh"
        });

        return { message: "Pergunta inativada com sucesso" };
    }
}

export { ScoreQuestionService };