import { waService } from '../services/whatsappService.js';
import { getCampaignById, updateCampaign, updateRecipientStatus, Campaign } from '../utils/campaigns.js';

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
        const campaign = getCampaignById(campaignId);
        if (!campaign) {
            console.error(`Campaign ${campaignId} not found`);
            return;
        }

        // Setup session rotation
        const sessionIds = campaign.sessionIds && campaign.sessionIds.length > 0 
            ? campaign.sessionIds 
            : (campaign.sessionId ? [campaign.sessionId] : []);
            
        if (sessionIds.length === 0) {
            console.error(`Campaign ${campaignId} has no sessions assigned.`);
            return;
        }

        let currentSessionIndex = 0;
        let messagesSentOnCurrentSession = 0;
        const ROTATION_LIMIT = 20;

        // Mark as PROCESSING
        campaign.status = 'PROCESSING';
        updateCampaign(campaign);

        console.log(`[Campaign ${campaignId}] Starting — ${campaign.recipients.length} recipients using ${sessionIds.length} sessions: [${sessionIds.join(', ')}]`);

        for (let i = 0; i < campaign.recipients.length; i++) {
            const recipient = campaign.recipients[i];
            if (recipient.status !== 'PENDING') continue;

            // Session Rotation Logic
            if (messagesSentOnCurrentSession >= ROTATION_LIMIT) {
                messagesSentOnCurrentSession = 0;
                currentSessionIndex = (currentSessionIndex + 1) % sessionIds.length;
                console.log(`[Campaign ${campaignId}] Rotated to session: ${sessionIds[currentSessionIndex]} (Limit ${ROTATION_LIMIT} reached)`);
            }
            
            const currentSessionId = sessionIds[currentSessionIndex];

            // Random delay 8-15s (skip delay before first message)
            if (i > 0) {
                const delay = Math.floor(Math.random() * 7000) + 8000;
                console.log(`[Campaign ${campaignId}] Waiting ${delay}ms before next message...`);
                await this.sleep(delay);
            }

            try {
                const resolvedMessage = this.resolveVariables(campaign.message, recipient);
                console.log(`[Campaign ${campaignId}] Sending to ${recipient.name} via ${currentSessionId} [${i + 1}/${campaign.recipients.length}]`);
                
                await waService.sendMessage(currentSessionId, recipient.phone, resolvedMessage);
                
                updateRecipientStatus(campaignId, recipient.contactId, 'SENT');
                messagesSentOnCurrentSession++;
                
                console.log(`[Campaign ${campaignId}] Sent to ${recipient.name}`);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                updateRecipientStatus(campaignId, recipient.contactId, 'FAILED', errorMsg);
                console.error(`[Campaign ${campaignId}] Failed to send to ${recipient.name} via ${currentSessionId}: ${errorMsg}`);
            }
        }

        // Ensure campaign is marked completed
        const updated = getCampaignById(campaignId);
        if (updated && updated.status !== 'COMPLETED') {
            updated.status = 'COMPLETED';
            updated.completedAt = new Date().toISOString();
            updateCampaign(updated);
        }

        console.log(`[Campaign ${campaignId}] Completed — Sent: ${updated?.sentCount}, Failed: ${updated?.failedCount}`);
    }

    private resolveVariables(template: string, recipient: { name: string; phone: string }): string {
        return template
            .replace(/\{\{name\}\}/g, recipient.name)
            .replace(/\{\{phone\}\}/g, recipient.phone);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const campaignQueue = new CampaignQueue();
