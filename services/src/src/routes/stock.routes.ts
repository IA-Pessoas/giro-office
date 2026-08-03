import { Router } from "express"
import { isAuthenticated } from "../middlewares/isAuthenticated"
import { StockController } from "../controllers/StockController"

const router = Router()

const sc = new StockController()

router.post('/stock', isAuthenticated.bind(isAuthenticated), sc.create.bind(sc))
router.get('/stocks', isAuthenticated.bind(isAuthenticated), sc.list.bind(sc))
router.put('/stock', isAuthenticated.bind(isAuthenticated), sc.update.bind(sc))
router.get('/stock', isAuthenticated.bind(isAuthenticated), sc.details.bind(sc))

router.post('/stock-entry', isAuthenticated.bind(isAuthenticated), sc.entry.bind(sc))
router.post('/stock-exit', isAuthenticated.bind(isAuthenticated), sc.exit.bind(sc))

router.post('/stock-location', isAuthenticated.bind(isAuthenticated), sc.createLocation.bind(sc))
router.get('/stock-locations', isAuthenticated.bind(isAuthenticated), sc.listLocation.bind(sc))
router.put('/stock-location', isAuthenticated.bind(isAuthenticated), sc.updateLocation.bind(sc))
router.get('/stock-location', isAuthenticated.bind(isAuthenticated), sc.detailsLocation.bind(sc))

router.post('/stock-category', isAuthenticated.bind(isAuthenticated), sc.createCategory.bind(sc))
router.get('/stock-categorys', isAuthenticated.bind(isAuthenticated), sc.listCategory.bind(sc))
router.put('/stock-category', isAuthenticated.bind(isAuthenticated), sc.updateCategory.bind(sc))
router.get('/stock-category', isAuthenticated.bind(isAuthenticated), sc.detailsCategory.bind(sc))

export default router