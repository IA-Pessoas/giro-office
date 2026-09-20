import { Router } from "express"
import multer from "multer"
import { isAuthenticated } from "../middlewares/isAuthenticated"
import { ClientController } from "../controllers/ClientController"
import { ClientService } from "../services/ClientService"

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

const clientController = new ClientController()

router.post('/clients', isAuthenticated.bind(isAuthenticated), clientController.create.bind(ClientController))
router.put('/clients', isAuthenticated.bind(isAuthenticated), clientController.update.bind(ClientController))
router.get('/clients', isAuthenticated.bind(isAuthenticated), clientController.list.bind(ClientController))
router.get('/client', isAuthenticated.bind(isAuthenticated), clientController.details.bind(ClientController))
router.delete('/clients', isAuthenticated.bind(isAuthenticated), clientController.delete.bind(ClientController))
router.post('/clients-integracao', isAuthenticated.bind(isAuthenticated), clientController.createIntegracao.bind(ClientController))
router.put('/clients-integracao', isAuthenticated.bind(isAuthenticated), clientController.updateIntegracao.bind(ClientController))
router.put('/clients-distrato', isAuthenticated.bind(isAuthenticated), clientController.termination.bind(ClientController))
router.put('/clients-financeiro', isAuthenticated.bind(isAuthenticated), clientController.updateFinanceiro.bind(ClientController))
router.put('/clients-regularize', isAuthenticated.bind(isAuthenticated), clientController.updateRegularize.bind(ClientController))
router.post('/clients-historys', isAuthenticated.bind(isAuthenticated), upload.single("file"), clientController.createHistory.bind(ClientController) as any)
router.put('/clients-historys', isAuthenticated.bind(isAuthenticated), clientController.updateHistory.bind(ClientController))
router.get('/clients-historys', isAuthenticated.bind(isAuthenticated), clientController.detailsHistory.bind(ClientController))
router.get('/clients-historys-list', isAuthenticated.bind(isAuthenticated), clientController.listHistory.bind(ClientController))
router.post('/clients-historys-pending', isAuthenticated.bind(isAuthenticated), clientController.createHistoryPending.bind(ClientController))
router.get('/clients-historys-pending-list', isAuthenticated.bind(isAuthenticated), clientController.listHistoryPending.bind(ClientController))
router.delete('/clients-historys-pending', isAuthenticated.bind(isAuthenticated), clientController.deleteHistoryPending.bind(ClientController))

new ClientService().competenceOutputUpdate()

export default router
