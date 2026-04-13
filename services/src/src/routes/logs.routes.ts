import { Router } from "express"
import { isAuthenticated } from "../middlewares/isAuthenticated"
import { LogController } from "../controllers/LogController"

const router = Router()

const logController = new LogController()

router.get('/logs', isAuthenticated.bind(isAuthenticated), logController.list.bind(LogController))

export default router