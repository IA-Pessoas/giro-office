import { Request, Response } from "express";
import { TriageService } from "../../services/triagem/TriageService";

class TriageController {

    // Salvar Configuração Padrão
    public upsertConfig = async (req: Request, res: Response) => {
        const service = new TriageService();
        const { client_id, type, active_items } = req.body;
        
        const result = await service.upsertConfig({
            my_id: req.user_id,
            client_id,
            type,
            active_items
        });
        return res.json(result);
    }

    // Buscar (ou Gerar) Triagem do Mês
    public getMonthly = async (req: Request, res: Response) => {
        const service = new TriageService();
        // type e competence vêm da query string
        const { client_id, competence, type } = req.query;

        if (!client_id || !competence || !type) {
            return res.status(400).json({ error: "Dados incompletos" });
        }

        const result = await service.getOrCreateMonthly({
            my_id: req.user_id,
            client_id: String(client_id),
            competence: String(competence),
            type: String(type) as 'CONTABIL' | 'FISCAL'
        });
        return res.json(result);
    }

    // Atualizar um Campo (Checklist ou Dado)
    public updateField = async (req: Request, res: Response) => {
        const service = new TriageService();
        const { triage_id, field, value } = req.body;

        const result = await service.updateField({
            my_id: req.user_id,
            triage_id,
            field,
            value
        });
        return res.json(result);
    }

    // Listar Geral por Competência (Dashboard)
    public list = async (req: Request, res: Response) => {
        const service = new TriageService();
        const { type, competence } = req.query;
        
        const result = await service.listByCompetence(
            String(type) as 'CONTABIL' | 'FISCAL', 
            String(competence)
        );
        return res.json(result);
    }
}

export { TriageController };