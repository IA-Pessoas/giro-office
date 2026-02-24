import { Router } from "express"
import { isAuthenticated } from "../middlewares/isAuthenticated"
import { GroupController } from "../controllers/GroupController"

const router: Router = Router()

const gc = new GroupController()

router.post('/group', isAuthenticated.bind(isAuthenticated), gc.create.bind(GroupController))
router.get('/groups', isAuthenticated.bind(isAuthenticated), gc.list.bind(GroupController))
router.put('/group', isAuthenticated.bind(isAuthenticated), gc.update.bind(GroupController))
router.get('/group', isAuthenticated.bind(isAuthenticated), gc.details.bind(GroupController))
router.post('/group-add-client', isAuthenticated.bind(isAuthenticated), gc.addClient.bind(GroupController))
router.delete('/group-remove-client', isAuthenticated.bind(isAuthenticated), gc.removeClient.bind(GroupController))

export default router