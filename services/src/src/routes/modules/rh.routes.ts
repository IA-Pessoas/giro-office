import { Router } from "express"
import { isAuthenticated } from "../../middlewares/isAuthenticated"
import { PointController } from "../../controllers/rh/PointController"
import { RhProfileController } from "../../controllers/rh/RhProfileController"
import { HolidayController } from "../../controllers/rh/HolidayController"
import { ScoreController } from "../../controllers/rh/ScoreController"
import { ScoreQuestionController } from "../../controllers/rh/ScoreQuestionController";
import { RhRequestController } from "../../controllers/rh/RhRequestController";

const router = Router()
router.use(isAuthenticated)

const pointController = new PointController();
const profileController = new RhProfileController();
const holidayController = new HolidayController();
const scoreController = new ScoreController();
const questionController = new ScoreQuestionController();
const rhRequestController = new RhRequestController();

// --- DADOS CADASTRAIS (Colaborators) ---
// Upsert: Cria ou Atualiza
router.post('/rh/profile/colaborator', isAuthenticated, profileController.upsertColaborator);
// Detalhar: Pode passar ?user_id=... ou pega o seu
router.get('/rh/profile/colaborator', isAuthenticated, profileController.detailColaborator);
// --- CONTATOS DE EMERGÊNCIA ---
router.post('/rh/profile/contact', isAuthenticated, profileController.createContact);
router.get('/rh/profile/contact', isAuthenticated, profileController.listContacts);
router.delete('/rh/profile/contact', isAuthenticated, profileController.deleteContact);
// --- ALERGIAS ---
router.post('/rh/profile/allergy', isAuthenticated, profileController.createAllergy);
router.get('/rh/profile/allergy', isAuthenticated, profileController.listAllergies);
router.delete('/rh/profile/allergy', isAuthenticated, profileController.deleteAllergy);

// Configuração
router.post('/rh/point/config', isAuthenticated, pointController.upsertConfig);
// Bater Ponto (Ação principal)
router.post('/rh/point/register', isAuthenticated, pointController.registerPoint);
// Solicitação de Ajuste (Colaborador pedindo correção)
router.post('/rh/point/adjustment/request', isAuthenticated, pointController.requestAdjustment);
// Aprovação de Ajuste (Gestor)
router.put('/rh/point/adjustment/approve', isAuthenticated, pointController.approveAdjustment);
// Lançamento Manual Banco de Horas (Adicionar/Remover saldo)
router.post('/rh/bank/release', isAuthenticated, pointController.releaseTimeBank);
// Aprovar Lançamento Banco
router.put('/rh/bank/approve', isAuthenticated, pointController.approveRelease);

// Gerar nova folha
router.post('/rh/timesheet/create', isAuthenticated, pointController.createTimeSheet);
// Listar folhas geradas
router.get('/rh/timesheet/list', isAuthenticated, pointController.listTimeSheets);
// Assinar folha
router.put('/rh/timesheet/sign', isAuthenticated, pointController.signTimeSheet);

// --- FERIADOS ---
router.post('/rh/holidays', isAuthenticated, holidayController.create);
router.put('/rh/holidays', isAuthenticated, holidayController.update);
router.get('/rh/holidays', isAuthenticated, holidayController.list);
router.delete('/rh/holidays', isAuthenticated, holidayController.delete);

// --- Score --- 
// Admin / RH
router.post('/rh/score/generate', isAuthenticated, scoreController.generate);
router.put('/rh/score/nitro/update', isAuthenticated, scoreController.updateNitroMetric);
// Colaborador
router.get('/rh/score/list', isAuthenticated, scoreController.listMyScores);
router.get('/rh/score/detail', isAuthenticated, scoreController.getDetail);
router.post('/rh/score/evaluation/submit', isAuthenticated, scoreController.submitEvaluation);
router.get('/rh/score/pending-evaluations', isAuthenticated, scoreController.listPendingEvaluations);
// --- PERGUNTAS (Banco de Questões) ---
router.post('/rh/score/questions', isAuthenticated, questionController.create);
router.put('/rh/score/questions', isAuthenticated, questionController.update);
router.get('/rh/score/questions', isAuthenticated, questionController.list);
router.delete('/rh/score/questions', isAuthenticated, questionController.delete);
// Categorias
router.post('/rh/helpdesk/category', isAuthenticated, rhRequestController.createCategory);
router.get('/rh/helpdesk/category', isAuthenticated, rhRequestController.listCategories);
// Chamados (CRUD)
router.post('/rh/helpdesk/request', isAuthenticated, rhRequestController.create);
router.get('/rh/helpdesk/list', isAuthenticated, rhRequestController.list);
router.get('/rh/helpdesk/detail', isAuthenticated, rhRequestController.detail);
// Ações no Chamado
router.put('/rh/helpdesk/assign', isAuthenticated, rhRequestController.assign); // Assumir
router.post('/rh/helpdesk/message', isAuthenticated, rhRequestController.sendMessage); // Enviar msg

export default router