import express from 'express';
import orgController from './org.controller.js';
import { protect } from '../../middleware/auth.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import { createOrgSchema, updateOrgSchema } from '../../zodSchema/index.js';

const router = express.Router();

router.use(protect);

router.get('/', orgController.listOrgs);
router.get('/current', orgController.getCurrentOrg);
router.get('/:id', orgController.getOrgById);
router.post('/', validate(createOrgSchema), orgController.createOrg);
router.put('/:id', validate(updateOrgSchema), orgController.updateOrg);
router.delete('/:id', orgController.deleteOrg);

export default router;
