import { Router } from 'express';
import {
    cancelCampaignController,
    createCampaignController,
    createGatewayController,
    deleteGatewayController,
    getCampaignController,
    listCampaignsController,
    listGateways,
    updateGatewayController,
} from '../controllers/smsController.js';

const router = Router();

router.get('/gateways', listGateways);
router.post('/gateways', createGatewayController);
router.put('/gateways/:id', updateGatewayController);
router.delete('/gateways/:id', deleteGatewayController);

router.post('/campaigns', createCampaignController);
router.get('/campaigns', listCampaignsController);
router.get('/campaigns/:id', getCampaignController);
router.post('/campaigns/:id/cancel', cancelCampaignController);

export default router;
