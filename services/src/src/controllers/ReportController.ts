import { Request, Response } from 'express';
import { ReportService } from '../services/ReportService';

class ReportController {
  public projeto = async (req: Request, res: Response): Promise<void> => {
    try {
      const { project_id } = req.body;

      if (!project_id) {
        res.status(400).json({ error: 'ID do projeto não fornecido.' });
        return 
      }

      const reportService = new ReportService();
      const pdf = await reportService.projeto(project_id);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename=relatorio.pdf',
      });

      res.send(pdf);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      res.status(500).json({ error: 'Erro interno ao gerar o relatório.' });
      return 
    }
  }
}

export { ReportController };