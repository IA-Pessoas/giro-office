import { Request, Response } from "express";
import { PointService } from "../../services/rh/PointService";
import { PointConfigService } from "../../services/rh/PointConfigService";
import { TimeSheetService } from "../../services/rh/TimeSheetService";

class PointController {
    
    // --- CONFIG ---
    public upsertConfig = async (req: Request, res: Response) => {
        const service = new PointConfigService();
        // Se for admin setando pra outro, pega do body. Se não, pega do token.
        const user_id = req.body.target_user_id || req.user_id; 
        const result = await service.upsert({ ...req.body, user_id });
        return res.json(result);
    }

    // --- PONTO DIÁRIO ---
    public registerPoint = async (req: Request, res: Response) => {
        const service = new PointService();
        const result = await service.registerPoint(req.user_id);
        return res.json(result);
    }

    // --- AJUSTES ---
    public requestAdjustment = async (req: Request, res: Response) => {
        const service = new PointService();
        const { point_id, clock_in, lunch_out, launch_in, clock_out, justification } = req.body;
        
        // Conversão de string ISO para Date se necessário
        const result = await service.requestAdjustment({
            user_id: req.user_id,
            point_id,
            clock_in: new Date(clock_in),
            lunch_out: new Date(lunch_out),
            launch_in: new Date(launch_in),
            clock_out: new Date(clock_out),
            justification
        });
        return res.json(result);
    }

    public approveAdjustment = async (req: Request, res: Response) => {
        const service = new PointService();
        const { request_id } = req.body;
        const result = await service.approveAdjustment(request_id, req.user_id);
        return res.json(result);
    }

    // --- BANCO DE HORAS MANUAL ---
    public releaseTimeBank = async (req: Request, res: Response) => {
        const service = new TimeSheetService();
        const { target_user_id, date, minutes, reason } = req.body;
        
        const result = await service.releaseTimeBank({
            user_id: target_user_id,
            date: new Date(date),
            minutes: Number(minutes),
            reason,
            added_by: req.user_id
        });
        return res.json(result);
    }

    public approveRelease = async (req: Request, res: Response) => {
        const service = new TimeSheetService();
        const { release_id } = req.body;
        const result = await service.approveRelease(release_id);
        return res.json(result);
    }

    // Gerar Folha (Admin ou Automático)
    public createTimeSheet = async (req: Request, res: Response) => {
        const service = new TimeSheetService();
        const { target_user_id, start_date, end_date } = req.body;
        
        const result = await service.createTimeSheet(
            target_user_id, 
            new Date(start_date), 
            new Date(end_date)
        );
        return res.json(result);
    }

    // Listar Folhas (Do próprio usuário ou Admin vendo de outro)
    public listTimeSheets = async (req: Request, res: Response) => {
        const service = new TimeSheetService();
        // Se passar target_user_id, lista dele. Se não, lista do usuário logado.
        const user_id = req.query.target_user_id ? String(req.query.target_user_id) : req.user_id;

        const result = await service.listTimeSheets(user_id);
        return res.json(result);
    }

    // Assinar Folha (O Colaborador assina)
    public signTimeSheet = async (req: Request, res: Response) => {
        const service = new TimeSheetService();
        const { timesheet_id, signature } = req.body;
        
        // Aqui você poderia validar se a folha pertence mesmo ao req.user_id por segurança
        const result = await service.signTimeSheet(timesheet_id, signature);
        return res.json(result);
    }
}

export { PointController };