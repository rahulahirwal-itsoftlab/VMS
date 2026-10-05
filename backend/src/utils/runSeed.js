import 'dotenv/config';
import { seedRealisticData } from './seedRealisticData.js';

seedRealisticData()
  .then(() => {
    console.log('[SEED] Script execution finished successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[SEED] Script execution failed:', err);
    process.exit(1);
  });
