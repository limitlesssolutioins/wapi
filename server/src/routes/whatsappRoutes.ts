import { Router } from 'express';
import { 
    getStatus, 
    initSession, 
    logoutSession, 
    renameSession, 
    sendMessage, 
    getMessageHistory, 
    getSessions, 
    getChats, 
    getConversation, 
    deleteChat 
} from '../controllers/whatsappController.js';

const router = Router();

router.get('/status', getStatus);
router.get('/sessions', getSessions);
router.post('/init', initSession);
router.post('/logout', logoutSession);
router.post('/rename', renameSession);
router.post('/send', sendMessage);
router.get('/history', getMessageHistory);
router.get('/chats', getChats);
router.get('/chats/:phone', getConversation);
router.delete('/chats/:phone', deleteChat);

export default router;