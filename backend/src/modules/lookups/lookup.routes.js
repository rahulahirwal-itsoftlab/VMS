import express from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import lookupController from './lookup.controller.js';

const router = express.Router();

// All lookup endpoints are protected by session verification
router.use(protect);

router.get('/roles', lookupController.getRoles);
router.get('/vendors', lookupController.getVendors);
router.get('/managers', lookupController.getManagers);
router.get('/teams', lookupController.getTeams);
router.get('/branches', lookupController.getBranches);
router.get('/regions', lookupController.getRegions);
router.get('/designations', lookupController.getDesignations);
router.get('/company', lookupController.getCompanyInfo);

export default router;

