import { Router } from "express"
import { isAuthenticated } from "../middlewares/isAuthenticated"
import { NoteController } from "../controllers/NoteController"

const router = Router()

const nc = new NoteController()

router.post('/note', isAuthenticated.bind(isAuthenticated), nc.create.bind(nc))
router.get('/notes', isAuthenticated.bind(isAuthenticated), nc.list.bind(nc))
router.put('/note', isAuthenticated.bind(isAuthenticated), nc.update.bind(nc))
router.put('/note/:id/status', isAuthenticated.bind(isAuthenticated), nc.toggleStatus.bind(nc))

export default router