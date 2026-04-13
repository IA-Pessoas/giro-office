import { Router } from "express"
import { isAuthenticated } from "../../middlewares/isAuthenticated"
import { CertificateController } from "../../controllers/certificate/CertificateController"
import { CertificateService } from "../../services/certificate/CertificateService"

const router = Router()

const cc = new CertificateController()

router.get('/certificates', isAuthenticated.bind(isAuthenticated), cc.list.bind(cc))
router.get('/certificate', isAuthenticated.bind(isAuthenticated), cc.details.bind(cc))
router.get('/certificates-notification', isAuthenticated.bind(isAuthenticated), cc.listNotification.bind(cc))

router.post('/certificate-pj', isAuthenticated.bind(isAuthenticated), cc.createPJ.bind(cc))
router.put('/certificate-pj', isAuthenticated.bind(isAuthenticated), cc.updatePJ.bind(cc))
router.post('/certificate-pf', isAuthenticated.bind(isAuthenticated), cc.createPF.bind(cc))
router.put('/certificate-pf', isAuthenticated.bind(isAuthenticated), cc.updatePF.bind(cc))

new CertificateService().dueDateNotification()

export default router