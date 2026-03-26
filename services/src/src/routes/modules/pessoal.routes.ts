import { Router } from "express"
import { isAuthenticated } from "../../middlewares/isAuthenticated"
import { LddController } from "../../controllers/pessoal/LddController"
import { PasswordController } from "../../controllers/pessoal/PasswordController"
import { SituationController } from "../../controllers/pessoal/SituationController"
import { UnionController } from "../../controllers/pessoal/UnionController"
import { UnionService } from "../../services/pessoal/UnionService"
import { PayrollController } from "../../controllers/pessoal/PayrollController"
import { ObrigacoesPessoalController } from "../../controllers/pessoal/ObrigacoesPessoalController"

const router = Router()
router.use(isAuthenticated);

const ldd = new LddController()
const password = new PasswordController()
const situation = new SituationController()
const union = new UnionController()
const payroll = new PayrollController()
const obrigations = new ObrigacoesPessoalController()

// LDD
router.post('/pessoal/ldd', ldd.create.bind(ldd))
router.put('/pessoal/ldd', ldd.update.bind(ldd))
router.get('/pessoal/ldd', ldd.list.bind(ldd))
router.delete('/pessoal/ldd', ldd.delete.bind(ldd))

// Passwords
router.post('/pessoal/passwords', password.create.bind(ldd))
router.put('/pessoal/passwords', password.update.bind(ldd))
router.get('/pessoal/passwords/client', password.list.bind(ldd))
router.get('/pessoal/passwords', password.detail.bind(ldd))
router.delete('/pessoal/passwords', password.delete.bind(ldd))

// Situations
router.post('/pessoal/situations', situation.create.bind(situation))
router.put('/pessoal/situations', situation.update.bind(situation))
router.get('/pessoal/situations/client', situation.list.bind(situation))
router.get('/pessoal/situations', situation.detail.bind(situation))

// Union
router.post('/pessoal/union', union.create.bind(union))
router.put('/pessoal/union', union.update.bind(union))
router.get('/pessoal/union', union.detail.bind(union))
router.get('/pessoal/unions', union.list.bind(union))

// Payroll
router.post('/pessoal/payroll', payroll.create.bind(payroll))
router.put('/pessoal/payroll', payroll.update.bind(payroll))
router.get('/pessoal/payroll', payroll.detail.bind(payroll))

// Obrigations
router.post('/pessoal/obrigations', obrigations.create.bind(obrigations))
router.get('/pessoal/obrigations', obrigations.detail.bind(obrigations))
router.put('/pessoal/obrigations', obrigations.updateField.bind(obrigations))
router.post('/pessoal/obrigations/comp', obrigations.comp.bind(obrigations))

new UnionService().dueDateNotification()

export default router