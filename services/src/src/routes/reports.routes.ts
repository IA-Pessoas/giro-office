import { Router } from "express"
import { isAuthenticated } from "../middlewares/isAuthenticated"
import { ReportController } from "../controllers/ReportController"

const router = Router()

const reportController = new ReportController()

router.post('/report-projeto', isAuthenticated.bind(isAuthenticated), reportController.projeto.bind(ReportController))

export default router