import { Router } from "express"
import { isAuthenticated } from "../../middlewares/isAuthenticated"
import { NcmController } from "../../controllers/fiscal/NcmController"

const router = Router()

const controller = new NcmController();

router.post('/fiscal/ncm', isAuthenticated.bind(isAuthenticated), controller.createNCM.bind(controller))
router.put('/fiscal/ncm', isAuthenticated.bind(isAuthenticated), controller.updateNCM.bind(controller))
router.get('/fiscal/ncm', isAuthenticated.bind(isAuthenticated), controller.detailNCM.bind(controller))
router.get('/fiscal/ncms', isAuthenticated.bind(isAuthenticated), controller.listNCM.bind(controller))

router.post('/fiscal/icms', isAuthenticated.bind(isAuthenticated), controller.createICMS.bind(controller))
router.put('/fiscal/icms', isAuthenticated.bind(isAuthenticated), controller.updateICMS.bind(controller))
router.get('/fiscal/icms', isAuthenticated.bind(isAuthenticated), controller.detailICMS.bind(controller))
router.get('/fiscal/icmss', isAuthenticated.bind(isAuthenticated), controller.listICMS.bind(controller))

router.post('/fiscal/ipi', isAuthenticated.bind(isAuthenticated), controller.createIPI.bind(controller))
router.put('/fiscal/ipi', isAuthenticated.bind(isAuthenticated), controller.updateIPI.bind(controller))
router.get('/fiscal/ipi', isAuthenticated.bind(isAuthenticated), controller.detailIPI.bind(controller))
router.get('/fiscal/ipis', isAuthenticated.bind(isAuthenticated), controller.listIPI.bind(controller))

router.get('/fiscal/ncm-search', isAuthenticated.bind(isAuthenticated), controller.seachNCM.bind(controller))

export default router;