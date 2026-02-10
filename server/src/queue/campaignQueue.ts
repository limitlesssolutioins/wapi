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
        const campaign = getCampaignById(campaignId);
        if (!campaign) {
            console.error(`Campaign ${campaignId} not found`);
            return;
        }
        
        const template = getTemplateById(campaign.templateId);
        if (!template) {
            console.error(`Template ${campaign.templateId} not found for campaign ${campaignId}`);
            updateCampaignStatus(campaignId, 'FAILED');
            return;
        }

        // Ensure recipients are loaded and the campaign is in a processable state
        if (!campaign.recipients || campaign.recipients.length === 0 || (campaign.status !== 'QUEUED' && campaign.status !== 'PROCESSING')) {
            console.log(`[Campaign ${campaignId}] Skipping, no recipients or invalid status (${campaign.status}).`);
            return;
        }

        // If campaign is QUEUED, mark as PROCESSING now
        if (campaign.status === 'QUEUED') {
            updateCampaignStatus(campaignId, 'PROCESSING');
            campaign.status = 'PROCESSING'; // Update local object for current run
        }

        const sessionIds = campaign.sessionIds;
            
        if (sessionIds.length === 0) {
            console.error(`Campaign ${campaignId} has no sessions assigned.`);
            updateCampaignStatus(campaignId, 'FAILED');
            return;
        }

        let currentSessionIndex = 0;
        let messagesSentOnCurrentSession = 0;
        const ROTATION_LIMIT = 20;

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
                const resolvedMessage = this.resolveVariables(template.content, recipient);
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

        // After processing all recipients, ensure campaign status is finalized
        // The `updateRecipientStatus` function already checks if all are done and sets to COMPLETED
        // So we just need to re-fetch the final state for logging
        const finalCampaignState = getCampaignById(campaignId);
        console.log(`[Campaign ${campaignId}] Completed — Sent: ${finalCampaignState?.stats.sent}, Failed: ${finalCampaignState?.stats.failed}`);
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