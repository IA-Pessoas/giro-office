import { Router } from "express"
import { isAuthenticated } from "../middlewares/isAuthenticated"
import { AgendaController } from "../controllers/agenda/AgendaController"
import { RecurringAgendaController } from "../controllers/agenda/RecurringAgendaController"
import { RecurringAgendaService } from "../services/Agenda/RecurringAgendaService"

const router = Router()

const agendaController = new AgendaController()
const ras = new RecurringAgendaController()

router.post('/agenda', isAuthenticated.bind(isAuthenticated), agendaController.create.bind(AgendaController))
router.put('/agenda', isAuthenticated.bind(isAuthenticated), agendaController.update.bind(AgendaController))
router.get('/agenda', isAuthenticated.bind(isAuthenticated), agendaController.list.bind(AgendaController))
router.get('/agenda-details', isAuthenticated.bind(isAuthenticated), agendaController.details.bind(AgendaController))
router.put('/agenda-status', isAuthenticated.bind(isAuthenticated), agendaController.updateStatus.bind(AgendaController))

router.post('/recurring-agenda', isAuthenticated.bind(isAuthenticated), ras.create.bind(AgendaController))
router.put('/recurring-agenda', isAuthenticated.bind(isAuthenticated), ras.update.bind(AgendaController))
router.get('/recurring-agenda', isAuthenticated.bind(isAuthenticated), ras.list.bind(AgendaController))
router.get('/recurring-agenda-details', isAuthenticated.bind(isAuthenticated), ras.details.bind(AgendaController))

new RecurringAgendaService().processRecurringAgendas()

export default router