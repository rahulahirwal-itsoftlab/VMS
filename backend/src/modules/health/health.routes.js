import express from 'express';
import { getHealth, getReadiness, getDatabaseHealth } from './health.controller.js';

const router = express.Router();

router.get('/', getHealth);
router.get('/ready', getReadiness);
router.get('/database', getDatabaseHealth);

export default router;
