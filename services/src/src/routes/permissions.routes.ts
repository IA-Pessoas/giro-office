import { Router } from "express"
import { isAuthenticated } from "../middlewares/isAuthenticated"
import { PermissionController } from "../controllers/PermissionController"

const router = Router()

const pc = new PermissionController()

router.post('/permission-integracao', isAuthenticated.bind(isAuthenticated), pc.createPermissionIntegracao.bind(PermissionController))
router.put('/permission-integracao', isAuthenticated.bind(isAuthenticated), pc.updatePermissionIntegracao.bind(PermissionController))
router.get('/permission-integracao', isAuthenticated.bind(isAuthenticated), pc.getPermissionIntegracao.bind(PermissionController))

export default router