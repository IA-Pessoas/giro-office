import { Router } from "express"
import { isAuthenticated } from "../../middlewares/isAuthenticated"
import { SitePasswordRegularizeController } from "../../controllers/regularize/SitePasswordRegularizeController"
import { PasswordController } from "../../controllers/regularize/PasswordController"
import { ClientPFController } from "../../controllers/regularize/ClientPFController"
import { PartnersController } from "../../controllers/regularize/PartnersController"
import { MunicipalTaxesController } from "../../controllers/regularize/MunicipalTaxesController"
import { ProcessController } from "../../controllers/regularize/ProcessController"
import { ProceduralGuidanceController } from "../../controllers/regularize/ProceduralGuidanceController"
import { LicenseController } from "../../controllers/regularize/LicenseController"

import { ClientPFService } from "../../services/regularize/ClientPFService"
import { LicenseService } from "../../services/regularize/LicenseService"

const router = Router()
router.use(isAuthenticated)

const ssr = new SitePasswordRegularizeController()
const pc = new PasswordController()
const pf = new ClientPFController()
const ps = new PartnersController()
const mt = new MunicipalTaxesController()
const process = new ProcessController() 
const guidance = new ProceduralGuidanceController()
const license = new LicenseController()

// Passwords
router.post('/regularize/passwords', pc.create.bind(pc))
router.put('/regularize/passwords', pc.update.bind(pc))
router.get('/regularize/passwords', pc.list.bind(pc))
router.get('/regularize/password', pc.detail.bind(pc))

// Sites Passwords
router.post('/regularize/sites-pass', ssr.create.bind(ssr))
router.put('/regularize/sites-pass', ssr.update.bind(ssr))
router.get('/regularize/sites-pass', ssr.list.bind(ssr))
router.get('/regularize/sites-pass-detail', ssr.detail.bind(ssr))

// PF
router.post('/regularize/pf', pf.create.bind(ssr))
router.put('/regularize/pf', pf.update.bind(ssr))
router.get('/regularize/pf', pf.detail.bind(ssr))
router.get('/regularize/pfs', pf.list.bind(ssr))

// Partners
router.post('/regularize/partners', ps.create.bind(ps))
router.put('/regularize/partners', ps.update.bind(ps))
router.get('/regularize/partner', ps.detail.bind(ps))
router.get('/regularize/partners', ps.list.bind(ps))

// Municipal Taxes
router.post('/regularize/municipal-taxes', mt.create.bind(pc))
router.put('/regularize/municipal-taxes', mt.update.bind(pc))
router.get('/regularize/municipal-taxes', mt.list.bind(pc))
router.get('/regularize/municipal-taxes-detail', mt.detail.bind(pc))

// Process
router.post('/regularize/process', process.create.bind(process))
router.put('/regularize/process', process.update.bind(process))
router.get('/regularize/process', process.detail.bind(process))
router.get('/regularize/processes', process.list.bind(process))

// Procedural Guidance
router.post('/regularize/guidance', isAuthenticated, guidance.create);
router.put('/regularize/guidance', isAuthenticated, guidance.update);
router.get('/regularize/guidance/detail', isAuthenticated, guidance.detail);
router.get('/regularize/guidance/list', isAuthenticated, guidance.listByProcess);
router.post('/regularize/guidance/activity/add', isAuthenticated, guidance.addActivity);
router.post('/regularize/guidance/activity/remove', isAuthenticated, guidance.removeActivity);
router.post('/regularize/guidance/partner/add', isAuthenticated, guidance.addPartner);
router.post('/regularize/guidance/partner/remove', isAuthenticated, guidance.removePartner);

// License
router.post('/regularize/license', license.create.bind(license))
router.put('/regularize/license', license.update.bind(license))
router.get('/regularize/license', license.detail.bind(license))
router.get('/regularize/licenses', license.list.bind(license))

// Rotinas automaticas
new ClientPFService().dueDateNotification()
new ClientPFService().statusRoutine()
new LicenseService().licenseDueDateNotification()

export default router