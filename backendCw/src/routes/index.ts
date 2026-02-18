import { Router } from "express"

import agendaRoutes from "./agenda.routes"
import budgetRoutes from "./budget.routes"
import clientRoutes from "./clients.routes"
import configRoutes from "./configs.routes"
import departmentRoutes from "./departments.routes"
import emailRoutes from "./emails.routes"
import groupsRoutes from "./groups.routes"
import logRoutes from "./logs.routes"
import noteRoutes from "./notes.routes"
import permissionRoutes from "./permissions.routes"
import reportRoutes from "./reports.routes"
import stockRoutes from "./stock.routes"
import userRoutes from "./users.routes"

import certificateRoutes from "./modules/certificate.routes"
import contabilRoutes from "./modules/contabil.routes"
import fiscalRoutes from "./modules/fiscal.routes"
import integracaoRoutes from "./modules/integracao.routes"
import mktRoutes from "./modules/mkt.routes"
import parcelamentoRoutes from "./modules/parcelamento.routes"
import pessoalRoutes from "./modules/pessoal.routes"
import regularizeRoutes from "./modules/regularize.routes"
import rhRoutes from "./modules/rh.routes"
import tiRoutes from "./modules/ti.routes"
import triagemRoutes from "./modules/triagem.routes"

const router = Router()

router.use(agendaRoutes)
router.use(budgetRoutes)
router.use(clientRoutes)
router.use(configRoutes)
router.use(departmentRoutes)
router.use(emailRoutes)
router.use(groupsRoutes)
router.use(logRoutes)
router.use(noteRoutes)
router.use(permissionRoutes)
router.use(reportRoutes)
router.use(stockRoutes)
router.use(userRoutes)

router.use(certificateRoutes)
router.use(contabilRoutes)
router.use(fiscalRoutes)
router.use(integracaoRoutes)
router.use(mktRoutes)
router.use(parcelamentoRoutes)
router.use(pessoalRoutes)
router.use(regularizeRoutes)
router.use(rhRoutes)
router.use(tiRoutes)
router.use(triagemRoutes)

export { router }