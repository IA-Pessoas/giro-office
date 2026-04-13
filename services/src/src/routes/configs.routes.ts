import { Router } from "express"
import { isAuthenticated } from "../middlewares/isAuthenticated"
import { ConfigController } from "../controllers/ConfigController"

const router = Router()

const cc = new ConfigController()

router.post('/config-proposal', isAuthenticated.bind(isAuthenticated), cc.createCommercialProposal.bind(ConfigController))
router.put('/config-proposal', isAuthenticated.bind(isAuthenticated), cc.updateCommercialProposal.bind(ConfigController))
router.get('/config-proposal', isAuthenticated.bind(isAuthenticated), cc.detailCommercialProposal.bind(ConfigController))
router.get('/config-proposal-list', isAuthenticated.bind(isAuthenticated), cc.list.bind(ConfigController))

export default router