import { Request, Response } from "express";
import { ScoreService } from "../../services/rh/ScoreService";
import prismaClient from "../../prisma";

class ScoreController {

    // Admin ou Sistema gera o trimestre
    public generate = async (req: Request, res: Response) => {
        const rawLeader = req.body.is_leader;

        const { target_user_id, quarter } = req.body;
        
        const service = new ScoreService();
        
        const result = await service.generateQuarterlyScore({
            my_id: req.user_id,
            target_user_id,
            quarter,
        });
        return res.json(result);
    }

    // Usuário preenche a avaliação
    public submitEvaluation = async (req: Request, res: Response) => {
        const { evaluation_id, answers } = req.body;
        const service = new ScoreService();

        const result = await service.submitEvaluation({
            my_id: req.user_id,
            evaluation_id,
            answers
        });
        return res.json(result);
    }

    public listPendingEvaluations = async (req: Request, res: Response) => {
        const my_id = req.user_id;
        
        // 1. Descobrir quem sou eu (meus cargos)
        const me = await prismaClient.user.findUnique({
            where: { id: my_id },
            include: { permissions: true }
        });

        const myRoles = ['SELF']; // Eu sempre posso responder as minhas
        
        // Mapeia permissões para Roles do Score
        if (me?.permissions[0].rh === 2) myRoles.push('RH'); // Admin RH
        if (me?.permission === 1) myRoles.push('TI'); // Admin Sistema = TI
        if (me?.permission === 2) myRoles.push('DIRECTOR'); // Admin Sistema = Diretoria
        
        // 2. Buscar Avaliações
        const evaluations = await prismaClient.scoreEvaluation.findMany({
            where: {
                status: 'Pendente',
                OR: [
                    // Caso A: Avaliação destinada especificamente a mim (Self, Lider específico, Subordinado específico)
                    { evaluator_id: my_id },
                    
                    // Caso B: Avaliação genérica para um dos meus cargos (RH, TI, Diretoria)
                    { 
                        evaluator_id: null,
                        evaluator_role: { in: myRoles }
                    }
                ]
            },
            include: {
                scoreQuarter: {
                    include: {
                        user: { select: { name: true } } // Nome do avaliado
                    }
                }
            }
        });

        return res.json(evaluations);
    }

    // Atualizar Nitro (RH ou Sistema)
    public updateNitroMetric = async (req: Request, res: Response) => {
        const { score_id, type, value } = req.body;
        
        const service = new ScoreService();
        
        // O value vem do body. Pode ser float.
        const result = await service.updateNitro({
            my_id: req.user_id,
            score_id,
            type,
            value: Number(value)
        });

        return res.json(result);
    }

    // Dashboard do Usuário
    public listMyScores = async (req: Request, res: Response) => {
        const service = new ScoreService();
        const result = await service.listScores(req.user_id);
        return res.json(result);
    }

    public getDetail = async (req: Request, res: Response) => {
        const { id } = req.query;
        const service = new ScoreService();
        const result = await service.getScoreDetail(id as string);
        return res.json(result);
    }
}

export { ScoreController };