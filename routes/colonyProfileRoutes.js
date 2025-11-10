import express from 'express';
import colonyProfilesController from '../controllers/colonyProfiles.js';

const router = express.Router();

router.get('/', (req, res) => colonyProfilesController.list(req, res));
router.post('/', (req, res) => colonyProfilesController.create(req, res));
router.put('/:id', (req, res) => colonyProfilesController.update(req, res));
router.delete('/:id', (req, res) => colonyProfilesController.remove(req, res));

export default router;

