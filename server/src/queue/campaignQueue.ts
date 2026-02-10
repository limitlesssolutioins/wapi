import { waService } from '../services/whatsappService.js';
import { getCampaignById, updateCampaignStatus, updateRecipientStatus, Campaign, CampaignRecipient } from '../utils/campaigns.js';
import { getTemplateById, MessageTemplate } from '../utils/templates.js';

class CampaignQueue {
    private queue: string[] = [];
    private processing = false;

    enqueue(campaignId: string): void {
        this.queue.push(campaignId);
        if (!this.processing) {
            this.processNext();
        }
    }

    private async processNext(): Promise<void> {
        if (this.queue.length === 0) {
            this.processing = false;
            return;
        }

        this.processing = true;
        const campaignId = this.queue.shift()!;
        await this.processCampaign(campaignId);
        this.processNext();
    }

    private async processCampaign(campaignId: string): Promise<void> {
        console.log(`[Campaign ${campaignId}] Processing started...`);
        const campaign = getCampaignById(campaignId);
        if (!campaign) {
            console.error(`[Campaign ${campaignId}] Error: Campaign not found in database.`);
            return;
        }
        
        const template = getTemplateById(campaign.templateId);
        if (!template) {
            console.error(`[Campaign ${campaignId}] Error: Template ${campaign.templateId} not found.`);
            updateCampaignStatus(campaignId, 'FAILED');
            return;
        }

        // Ensure recipients are loaded and the campaign is in a processable state
        if (!campaign.recipients || campaign.recipients.length === 0) {
            console.log(`[Campaign ${campaignId}] No recipients found. Completing.`);
            updateCampaignStatus(campaignId, 'COMPLETED');
            return;
        }

        if (campaign.status !== 'QUEUED' && campaign.status !== 'PROCESSING') {
            console.log(`[Campaign ${campaignId}] Skipping: Invalid status (${campaign.status}).`);
            return;
        }

        // If campaign is QUEUED, mark as PROCESSING now
        if (campaign.status === 'QUEUED') {
            updateCampaignStatus(campaignId, 'PROCESSING');
            campaign.status = 'PROCESSING';
        }

        const sessionIds = campaign.sessionIds;
            
        if (!sessionIds || sessionIds.length === 0) {
            console.error(`[Campaign ${campaignId}] Error: No sessions assigned.`);
            updateCampaignStatus(campaignId, 'FAILED');
            return;
        }

        let currentSessionIndex = 0;
        let messagesSentOnCurrentSession = 0;
        const ROTATION_LIMIT = 15; // Rotar cada 15 mensajes para mayor seguridad

        console.log(`[Campaign ${campaignId}] Running: ${campaign.recipients.length} recipients using sessions: [${sessionIds.join(', ')}]`);

        for (let i = 0; i < campaign.recipients.length; i++) {
            const recipient = campaign.recipients[i];
            
            // Re-fetch campaign state occasionally to check if it was PAUSED or CANCELLED
            if (i % 5 === 0) {
                const currentStatus = getCampaignById(campaignId)?.status;
                if (currentStatus === 'PAUSED' || currentStatus === 'FAILED') {
                    console.log(`[Campaign ${campaignId}] Stopping: Status changed to ${currentStatus}`);
                    return;
                }
            }

            if (recipient.status !== 'PENDING') continue;

            // Session Rotation Logic
            if (messagesSentOnCurrentSession >= ROTATION_LIMIT && sessionIds.length > 1) {
                messagesSentOnCurrentSession = 0;
                currentSessionIndex = (currentSessionIndex + 1) % sessionIds.length;
                console.log(`[Campaign ${campaignId}] Rotated session to: ${sessionIds[currentSessionIndex]}`);
            }
            
            const currentSessionId = sessionIds[currentSessionIndex];

            // Random delay 10-20s (Antiban)
            if (i > 0) {
                const delay = Math.floor(Math.random() * 10000) + 10000;
                await this.sleep(delay);
            }

            try {
                const resolvedMessage = this.resolveVariables(template.content, recipient);
                await waService.sendMessage(currentSessionId, recipient.phone, resolvedMessage, campaign.imageUrl);
                
                updateRecipientStatus(campaignId, recipient.contactId, 'SENT');
                messagesSentOnCurrentSession++;
                
                console.log(`[Campaign ${campaignId}] [${i + 1}/${campaign.recipients.length}] Sent to ${recipient.phone}`);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                updateRecipientStatus(campaignId, recipient.contactId, 'FAILED', errorMsg);
                console.error(`[Campaign ${campaignId}] [${i + 1}/${campaign.recipients.length}] Failed for ${recipient.phone}: ${errorMsg}`);
                
                // Si la sesión se desconectó, intentar rotar inmediatamente si hay más sesiones
                if (errorMsg.includes('disconnected') && sessionIds.length > 1) {
                    currentSessionIndex = (currentSessionIndex + 1) % sessionIds.length;
                    console.log(`[Campaign ${campaignId}] Session error, rotating to: ${sessionIds[currentSessionIndex]}`);
                }
            }
        }

        console.log(`[Campaign ${campaignId}] Finished.`);
    }

    private resolveVariables(templateContent: string, recipient: { name: string; phone: string }): string {
        return templateContent
            .replace(/\{\{name\}\}/g, recipient.name)
            .replace(/\{\{phone\}\}/g, recipient.phone);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const campaignQueue = new CampaignQueue();