import prismaClient from "../../prisma";
import { LogService } from "../LogService";

interface GenerateQuarterDTO {
    my_id: string;
    target_user_id: string;
    quarter: string;
}

interface SubmitEvaluationDTO {
    my_id: string;
    evaluation_id: string;
    answers: { question_id: string; answer: number; obs?: string }[];
}

interface UpdateNitroDTO {
    my_id: string;
    score_id: string;
    type: 'projects' | 'hours' | 'errors' | 'folders';
    value: number;
}

// --- CONSTANTES DE PERMISSÃO (Para facilitar manutenção) ---
const PERMISSION_LEADER = 1;      // Líder
const PERMISSION_COLLABORATOR = 0; // Colaborador Comum

class ScoreService {

    async generateQuarterlyScore(data: GenerateQuarterDTO) {
        // 1. Verificações Iniciais
        const exists = await prismaClient.scoreQuarter.findUnique({
            where: {
                user_id_quarter: { user_id: data.target_user_id, quarter: data.quarter }
            }
        });
        if (exists) throw new Error("Score já gerado para este trimestre.");

        // 2. Busca dados do Colaborador Alvo
        const targetUser = await prismaClient.user.findUnique({
            where: { id: data.target_user_id },
            include: {
                permissions: true, // Atenção: Verifique se no seu schema é 'permission' ou 'permissions'
                colaborator: true
            }
        });

        if (!targetUser || !targetUser.permissions || targetUser.permissions.length === 0 || !targetUser.colaborator) {
            throw new Error("Usuário alvo sem permissões ou dados cadastrais configurados.");
        }

        // --- CORREÇÃO 1: Ajuste na verificação de quem é o alvo ---
        const userPermission = targetUser.permissions[0]; // Pega a primeira permissão
        const isLeader = userPermission.rh === PERMISSION_LEADER; 
        
        // Assumindo que o department_id está na tabela User. Se estiver em Colaborator, mude para targetUser.colaborator.department_id
        const userDept = targetUser.department_id; 

        if (!userDept) {
            console.warn(`Aviso: Usuário ${targetUser.name} não tem departamento vinculado. Líder não será encontrado.`);
        }

        // 3. Cria o Score Pai
        const score = await prismaClient.scoreQuarter.create({
            data: {
                user_id: data.target_user_id,
                quarter: data.quarter,
                nitro: { create: {} }
            }
        });

        // 4. Busca Perguntas Ativas
        const allQuestions = await prismaClient.scoreQuestion.findMany({ where: { active: true } });

        // --- HELPER: Criar Avaliação ---
        const createEval = async (type: string, role: string, specificEvaluatorId: string | null = null) => {
            const typeQuestions = allQuestions.filter(q => q.type === type);
            if (typeQuestions.length === 0) return;

            const initialAnswers = typeQuestions.map(q => ({
                question_id: q.id,
                question_text: q.question,
                answer: 0,
                obs: ""
            }));

            await prismaClient.scoreEvaluation.create({
                data: {
                    score_id: score.id,
                    type: type,
                    evaluator_role: role,
                    evaluator_id: specificEvaluatorId,
                    status: 'Pendente',
                    answers: initialAnswers
                }
            });
        };

        // ==========================================
        // MATRIZ DE AVALIAÇÃO
        // ==========================================

        // --- 1. COMPORTAMENTAL ---
        await createEval('behavioral', 'SELF', data.target_user_id);
        await createEval('behavioral', 'RH', null);

        if (isLeader) {
            // Se o alvo É LÍDER (Nível 1), quem avalia é a DIRETORIA
            await createEval('behavioral', 'DIRECTOR', null); 
        } else {
            // Se o alvo É COLABORADOR (Nível 0), buscamos o Líder (Nível 1)
            const leaderUser = await this.findDepartmentLeader(userDept, data.target_user_id);
            console.log("Líder encontrado:", leaderUser);
            if (leaderUser) {
                await createEval('behavioral', 'LEADER', leaderUser.id);
            } else {
                console.log("Líder não encontrado para avaliação comportamental.");
            }
        }

        // --- 2. TÉCNICO ---
        await createEval('technical', 'SELF', data.target_user_id);

        if (isLeader) {
            await createEval('technical', 'DIRECTOR', null);
        } else {
            const leaderUser = await this.findDepartmentLeader(userDept, data.target_user_id);
            if (leaderUser) {
                await createEval('technical', 'LEADER', leaderUser.id);
            }
        }

        // --- 3. TECH (TI) ---
        await createEval('tech', 'SELF', data.target_user_id);
        await createEval('tech', 'TI', null);

        // --- 4. LIDERANÇA (Apenas se o alvo for Líder) ---
        if (isLeader) {
            await createEval('leadership', 'SELF', data.target_user_id);

            // Busca os liderados (Nível 0) do mesmo departamento
            const subordinates = await this.findSubordinates(userDept, data.target_user_id);
            
            for (const sub of subordinates) {
                await createEval('leadership', 'SUBORDINATE', sub.id);
            }
        }

        // Log
        const ls = new LogService();
        await ls.createLog({
            my_id: data.my_id,
            action: "Gerar Score 360",
            referring: "rh.score",
            referring_id: score.id,
            changes: `Trimestre ${data.quarter}`,
            dep: "rh"
        });

        return score;
    }

    // --- CORREÇÃO 2: Helpers de Busca ajustados para os níveis corretos ---

    // Encontra o Líder do departamento (RH = 1)
    private async findDepartmentLeader(departmentId: string, excludeId: string) {
        if (!departmentId) return null;

        const leader = await prismaClient.user.findFirst({
            where: {
                id: { not: excludeId },
                department_id: departmentId, 
                permissions: {
                    some: { 
                        rh: PERMISSION_LEADER // Busca quem tem nível 1
                    }
                }
            }
        });
        return leader;
    }

    // Encontra os Liderados do departamento (RH = 0)
    private async findSubordinates(departmentId: string, leaderId: string) {
        if (!departmentId) return [];

        const subs = await prismaClient.user.findMany({
            where: {
                id: { not: leaderId },
                department_id: departmentId,
                permissions: {
                    some: { 
                        rh: PERMISSION_COLLABORATOR // Busca quem tem nível 0
                    }
                }
            }
        });
        return subs;
    }

    // ... (recalculateFinalScore, submitEvaluation, etc... continuam iguais)
    
    // Vou reimprimir o recalculate apenas para garantir que não perdeu nada
    private async recalculateFinalScore(score_id: string) {
        const score = await prismaClient.scoreQuarter.findUnique({
            where: { id: score_id },
            include: { evaluations: true, nitro: true }
        });

        if (!score || !score.nitro) return;

        const sums = { behavioral: 0, technical: 0, leadership: 0, tech: 0 };
        const counts = { behavioral: 0, technical: 0, leadership: 0, tech: 0 };

        score.evaluations.forEach(ev => {
            if (ev.status === 'Concluido') {
                const type = ev.type as keyof typeof sums;
                if (sums[type] !== undefined) {
                    sums[type] += ev.average_score;
                    counts[type]++;
                }
            }
        });

        const finalBehavioral = counts.behavioral > 0 ? sums.behavioral / counts.behavioral : 0;
        const finalTechnical = counts.technical > 0 ? sums.technical / counts.technical : 0;
        const finalTech = counts.tech > 0 ? sums.tech / counts.tech : 0;
        const finalLeadership = counts.leadership > 0 ? sums.leadership / counts.leadership : 0;

        await prismaClient.scoreQuarter.update({
            where: { id: score_id },
            data: {
                behavioral: finalBehavioral,
                technical: finalTechnical,
                technology: finalTech,
                leadership: finalLeadership
            }
        });

        let sumBase = 0;
        let validBase = 0;

        if (counts.behavioral > 0) { sumBase += finalBehavioral; validBase++; }
        if (counts.technical > 0) { sumBase += finalTechnical; validBase++; }
        if (counts.tech > 0) { sumBase += finalTech; validBase++; }
        if (counts.leadership > 0) { sumBase += finalLeadership; validBase++; }

        let baseScore = validBase > 0 ? sumBase / validBase : 0;

        let finalScore = baseScore + score.nitro.projects_score + score.nitro.hours_score - score.nitro.errors_score + score.nitro.folders_score;

        if (finalScore > 10) finalScore = 10;
        if (finalScore < 0) finalScore = 0;

        await prismaClient.scoreQuarter.update({
            where: { id: score_id },
            data: { final_score: finalScore }
        });
    }

    async submitEvaluation(data: SubmitEvaluationDTO) {
        const evaluation = await prismaClient.scoreEvaluation.findUnique({
            where: { id: data.evaluation_id },
            include: { scoreQuarter: true }
        });

        if (!evaluation) throw new Error("Avaliação não encontrada.");
        if (evaluation.status === 'Concluido') throw new Error("Avaliação já concluída.");

        let sum = 0;
        data.answers.forEach(a => sum += a.answer);
        const average = data.answers.length > 0 ? sum / data.answers.length : 0;

        await prismaClient.scoreEvaluation.update({
            where: { id: data.evaluation_id },
            data: {
                answers: data.answers,
                average_score: average,
                status: 'Concluido'
            }
        });

        await this.recalculateFinalScore(evaluation.score_id);

        return { message: "Avaliação enviada com sucesso" };
    }

    async updateNitro(data: UpdateNitroDTO) {
        // 1. Busca o registro Nitro vinculado ao Score
        const nitro = await prismaClient.scoreNitro.findUnique({
            where: { score_id: data.score_id }
        });

        if (!nitro) throw new Error("Registro Nitro não encontrado para este Score.");

        // 2. Mapeia o tipo para a coluna correta do banco
        let updateData = {};
        let logField = "";

        switch (data.type) {
            case 'projects':
                updateData = { projects_score: data.value };
                logField = "Projetos";
                break;
            case 'hours':
                // Aqui você pode implementar lógica extra se quiser (ex: travar max 1.0)
                updateData = { hours_score: data.value };
                logField = "Banco de Horas (CH)";
                break;
            case 'errors':
                // No banco salvamos o valor absoluto (ex: 1.5). 
                // A subtração acontece no 'recalculateFinalScore'.
                updateData = { errors_score: data.value }; 
                logField = "Erros";
                break;
            case 'folders':
                // Pode ser positivo (bônus) ou negativo (punição)
                updateData = { folders_score: data.value };
                logField = "Organização (Pastas)";
                break;
            default:
                throw new Error("Tipo de Nitro inválido.");
        }

        // 3. Atualiza o banco
        const updatedNitro = await prismaClient.scoreNitro.update({
            where: { score_id: data.score_id },
            data: updateData
        });

        // 4. IMPORTANTE: Recalcula a nota final do colaborador imediatamente
        await this.recalculateFinalScore(data.score_id);

        // 5. Log
        const ls = new LogService();
        await ls.createLog({
            my_id: data.my_id,
            action: "Atualizar Nitro",
            referring: "rh.score_nitro",
            referring_id: updatedNitro.id,
            changes: `Atualizou ${logField} para ${data.value}`,
            dep: "rh"
        });

        return updatedNitro;
    }

    async listScores(user_id: string) {
        return await prismaClient.scoreQuarter.findMany({
            where: { user_id },
            include: { nitro: true },
            orderBy: { quarter: 'desc' }
        });
    }
    
    async getScoreDetail(score_id: string) {
        return await prismaClient.scoreQuarter.findUnique({
            where: { id: score_id },
            include: {
                nitro: true,
                evaluations: {
                    include: { evaluator: { select: { name: true } } }
                }
            }
        });
    }
}

export { ScoreService };