import { Router } from "express";
import { isAuthenticated } from "../../middlewares/isAuthenticated";
import { TriageController } from "../../controllers/triagem/TriageController";
import { CloudController } from "../../controllers/triagem/CloudController";
import { TriageResponsibleController } from "../../controllers/triagem/TriageResponsibleController";

const router = Router();
const controller = new TriageController();
const cloud = new CloudController();
const responsible = new TriageResponsibleController();

// Configuração Padrão
router.post('/triagem/config', isAuthenticated, controller.upsertConfig);
// Obter/Gerar Triagem do Mês
router.get('/triagem/monthly', isAuthenticated, controller.getMonthly);
// Atualizar Item (Checklist ou Dado)
router.patch('/triagem/monthly/update', isAuthenticated, controller.updateField);
// Listar (Dashboard)
router.get('/triagem/list', isAuthenticated, controller.list);

// --- CLIENTES: NUVENS/LINKS ---
router.post('/triagem/cloud', isAuthenticated, cloud.create);
router.get('/triagem/cloud/list', isAuthenticated, cloud.list);
router.put('/triagem/cloud', isAuthenticated, cloud.update);
router.delete('/triagem/cloud', isAuthenticated, cloud.delete);

// --- RESPONSÁVEIS PELA TRIAGEM ---
router.post('/triagem/responsible', isAuthenticated, responsible.create);
router.get('/triagem/responsible/list', isAuthenticated, responsible.list);
router.put('/triagem/responsible', isAuthenticated, responsible.update);
router.delete('/triagem/responsible', isAuthenticated, responsible.delete);

export default router;