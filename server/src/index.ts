import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure uploads directory exists
const uploadsPath = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadsPath);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Import routes and middleware
import whatsappRoutes from './routes/whatsappRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import campaignRoutes from './routes/campaignRoutes.js';
import templateRoutes from './routes/templateRoutes.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import { protect } from './middleware/authMiddleware.js';

// Import services and utils for stats endpoint
import { waService } from './services/whatsappService.js';
import { getHistory } from './utils/logger.js';
import { getAllContacts } from './utils/contacts.js';
import { listCampaigns } from './services/campaignService.js';

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Static files
const clientBuildPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuildPath));
app.use('/uploads', express.static(uploadsPath));

// Upload endpoint
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const protocol = req.protocol;
    const host = req.get('host');
    const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    res.json({ url: imageUrl });
});

// Public Auth routes
app.use('/api/auth', authRoutes);

// Protected API routes - require authentication
app.use('/api/whatsapp', protect, whatsappRoutes);
app.use('/api/contacts', protect, contactRoutes);
app.use('/api/groups', protect, groupRoutes);
app.use('/api/campaigns', protect, campaignRoutes);
app.use('/api/templates', protect, templateRoutes);
app.use('/api/user', protect, userRoutes); 

// Stats endpoint
app.get('/api/stats', protect, (_req, res) => {
    const history = getHistory();
    const contacts = getAllContacts();
    const campaignsResult = listCampaigns(1, 100); // Get up to 100 campaigns for stats
    const campaigns = campaignsResult.data;

    const sentCount = history.filter(h => h.status === 'SENT').length;
    const failedCount = history.filter(h => h.status === 'FAILED').length;
    const connectedDevices = waService.getConnectedSessionCount();
    const totalCampaigns = campaignsResult.meta.total;
    const activeCampaigns = campaigns.filter(c => c.status === 'PROCESSING' || c.status === 'QUEUED').length;
    const totalContacts = contacts.length;

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

// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// SPA Fallback: Must be the LAST route to catch everything else
// This serves the frontend's index.html for any non-API GET requests
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
    
    // Recover pending campaigns
    import('./services/campaignService.js').then(({ recoverCampaigns }) => {
        recoverCampaigns();
    });
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