import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

import whatsappRoutes from './routes/whatsappRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import campaignRoutes from './routes/campaignRoutes.js';
import templateRoutes from './routes/templateRoutes.js';
import { waService } from './services/whatsappService.js';
import { getHistory } from './utils/logger.js';
import { getContacts } from './utils/contacts.js';
import { getCampaigns } from './utils/campaigns.js';

app.use(cors());
app.use(express.json({ limit: '5mb' }));

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/templates', templateRoutes);

// Serve Static Frontend (Vite Build)
const clientBuildPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuildPath));

app.get('/api/stats', (_req, res) => {
    const history = getHistory();
    const contacts = getContacts();
    const campaigns = getCampaigns();

    const sentCount = history.filter(h => h.status === 'SENT').length;
    const failedCount = history.filter(h => h.status === 'FAILED').length;
    const connectedDevices = waService.getConnectedSessionCount();
    const totalCampaigns = campaigns.length;
    const activeCampaigns = campaigns.filter(c => c.status === 'PROCESSING' || c.status === 'QUEUED').length;
    const totalContacts = contacts.length;

    // Last 10 messages for recent activity
    const recentMessages = history.slice(-10).reverse();

    res.json({
        sentCount,
        failedCount,
        connectedDevices,
        totalCampaigns,
        activeCampaigns,
        totalContacts,
        recentMessages,
    });
});

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// SPA Fallback: Must be the LAST route to catch everything else
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(path.join(clientBuildPath, 'index.html'));
    } else {
        next();
    }
});

const server = app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    // Initialize WhatsApp Sessions
    await waService.init();
});

const gracefulShutdown = async () => {
    console.log('SIGTERM/SIGINT received. Shutting down gracefully...');
    await waService.disconnectAll();
    server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
    });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
