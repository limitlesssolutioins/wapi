import { waService } from '../services/whatsappService.js';
import { getCampaignById, updateCampaignStatus, updateRecipientStatus, CampaignSessionData } from '../utils/campaigns.js';
import { getTemplateById } from '../utils/templates.js';

type SessionMetrics = {
    sent: number;
    failed: number;
    lastError?: string;
    lastActivityAt?: string;
};

type CampaignRuntimeMetrics = {
    startedAt: string;
    bySession: Record<string, SessionMetrics>;
    errorCounts: Record<string, number>;
};

// Randomize rotation every N messages to give each number a natural rest
const getNewRotationLimit = () => Math.floor(Math.random() * (20 - 10 + 1)) + 10;

class CampaignQueue {
    private queue: string[] = [];
    private queuedIds = new Set<string>();
    private processing = false;
    private runtimeByCampaign = new Map<string, CampaignRuntimeMetrics>();

    enqueue(campaignId: string): void {
        if (this.queuedIds.has(campaignId)) return;

        this.queue.push(campaignId);
        this.queuedIds.add(campaignId);

        if (!this.processing) {
            void this.processNext();
        }
    }

    /** No-op in sequential mode — sessions are picked up from DB on next rotation. */
    addSessionToCampaign(_campaignId: string, _sessionData: CampaignSessionData): boolean {
        return true;
    }

    private async processNext(): Promise<void> {
        if (this.processing) return;
        this.processing = true;

        while (this.queue.length > 0) {
            const campaignId = this.queue.shift()!;
            this.queuedIds.delete(campaignId);
            await this.processCampaign(campaignId);
        }

        this.processing = false;
    }

    private async processCampaign(campaignId: string): Promise<void> {
        console.log(`[Campaign ${campaignId}] Processing started...`);

        const campaign = getCampaignById(campaignId);
        if (!campaign) {
            console.error(`[Campaign ${campaignId}] Not found.`);
            return;
        }

        const template = getTemplateById(campaign.templateId);
        if (!template) {
            console.error(`[Campaign ${campaignId}] Template ${campaign.templateId} not found.`);
            updateCampaignStatus(campaignId, 'FAILED');
            return;
        }

        if (!campaign.recipients || campaign.recipients.length === 0) {
            updateCampaignStatus(campaignId, 'COMPLETED');
            return;
        }

        if (campaign.status !== 'QUEUED' && campaign.status !== 'PROCESSING') {
            console.log(`[Campaign ${campaignId}] Skipping: status is ${campaign.status}.`);
            return;
        }

        if (campaign.status === 'QUEUED') {
            updateCampaignStatus(campaignId, 'PROCESSING');
        }

        const pendingRecipients = campaign.recipients.filter((r) => r.status === 'PENDING');
        if (pendingRecipients.length === 0) {
            updateCampaignStatus(campaignId, 'COMPLETED');
            return;
        }

        // Initialize metrics
        const activeSessionsData = (campaign.sessions || []).filter((s) => waService.isValidSessionId(s.id));
        if (activeSessionsData.length === 0) {
            console.error(`[Campaign ${campaignId}] No valid sessions assigned.`);
            updateCampaignStatus(campaignId, 'FAILED');
            return;
        }

        this.runtimeByCampaign.set(campaignId, {
            startedAt: new Date().toISOString(),
            bySession: Object.fromEntries(activeSessionsData.map((s) => [s.id, { sent: 0, failed: 0 }])),
            errorCounts: {},
        });

        let currentRotationLimit = getNewRotationLimit();
        console.log(
            `[Campaign ${campaignId}] ${pendingRecipients.length} recipients, sessions: [${activeSessionsData.map(s => s.id).join(', ')}], initial rotation limit: ${currentRotationLimit}.`
        );

        let currentSessionIndex = 0;
        let messagesSentOnCurrentSession = 0;

        for (let i = 0; i < pendingRecipients.length; i++) {
            const recipient = pendingRecipients[i];

            // Check campaign status every 5 messages
            if (i % 5 === 0) {
                const status = getCampaignById(campaignId)?.status;
                if (status === 'PAUSED' || status === 'FAILED' || status === 'CANCELLED') {
                    console.log(`[Campaign ${campaignId}] Stopped: status changed to ${status}.`);
                    return;
                }
            }

            // Re-read session list from DB (supports adding/removing sessions mid-campaign)
            const updatedCampaign = getCampaignById(campaignId);
            if (!updatedCampaign) { // Campaign might have been deleted
                console.error(`[Campaign ${campaignId}] Campaign not found during processing. Stopping.`);
                return;
            }
            const currentActiveSessionsData = (updatedCampaign.sessions || []).filter((s) =>
                waService.isValidSessionId(s.id)
            );
            if (currentActiveSessionsData.length === 0) {
                console.error(`[Campaign ${campaignId}] No sessions remaining. Failing.`);
                updateCampaignStatus(campaignId, 'FAILED');
                return;
            }

            // Rotate session after ROTATION_LIMIT messages
            if (messagesSentOnCurrentSession >= currentRotationLimit && currentActiveSessionsData.length > 1) {
                messagesSentOnCurrentSession = 0;
                currentRotationLimit = getNewRotationLimit();
                currentSessionIndex = (currentSessionIndex + 1) % currentActiveSessionsData.length;
                console.log(`[Campaign ${campaignId}] Rotated to session: ${currentActiveSessionsData[currentSessionIndex].id} (Next limit: ${currentRotationLimit})`);
            }

            const currentSession = currentActiveSessionsData[currentSessionIndex % currentActiveSessionsData.length];

            // Delay between messages (skip before the very first)
            if (i > 0) {
                const canContinue = await this.sleepWithStatusCheck(campaignId, 15000, 35000);
                if (!canContinue) return;
            }

            try {
                const resolvedMessage = this.resolveVariables(template.content, recipient);
                // Pass proxyUrl to sendMessage
                await waService.sendMessage(currentSession.id, recipient.phone, resolvedMessage, campaign.imageUrl, false, currentSession.proxyUrl || undefined);
                updateRecipientStatus(campaignId, recipient.contactId, 'SENT');
                messagesSentOnCurrentSession++;
                this.bumpMetric(campaignId, currentSession.id, 'sent');
                console.log(
                    `[Campaign ${campaignId}] [${i + 1}/${pendingRecipients.length}] [${currentSession.id}] Sent to ${recipient.phone}`
                );
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                updateRecipientStatus(campaignId, recipient.contactId, 'FAILED', errorMsg);
                this.bumpMetric(campaignId, currentSession.id, 'failed', errorMsg);
                console.error(
                    `[Campaign ${campaignId}] [${i + 1}/${pendingRecipients.length}] Failed for ${recipient.phone}: ${errorMsg}`
                );

                // Rotate immediately if the session disconnected and there are alternatives
                if (errorMsg.toLowerCase().includes('disconnected') && currentActiveSessionsData.length > 1) {
                    currentSessionIndex = (currentSessionIndex + 1) % currentActiveSessionsData.length;
                    messagesSentOnCurrentSession = 0;
                    currentRotationLimit = getNewRotationLimit();
                    console.log(`[Campaign ${campaignId}] Session error — rotated to: ${currentActiveSessionsData[currentSessionIndex].id}`);
                }
            }
        }

        updateCampaignStatus(campaignId, 'COMPLETED');
        console.log(`[Campaign ${campaignId}] Finished.`);
    }

    private resolveVariables(templateContent: string, recipient: { name: string; phone: string }): string {
        // First resolve Spintax: {Hola|Qué tal|Buen día}
        let content = templateContent.replace(/\{([^{}]+)\}/g, (match, choices) => {
            const parts = choices.split('|');
            return parts[Math.floor(Math.random() * parts.length)];
        });

        // Then resolve variables
        return content
            .replace(/\{\{name\}\}/g, recipient.name)
            .replace(/\{\{phone\}\}/g, recipient.phone);
    }

    private async sleepWithStatusCheck(campaignId: string, minMs: number, maxMs: number): Promise<boolean> {
        const targetDelay =
            minMs >= maxMs ? minMs : Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

        const checkEveryMs = 500;
        let elapsed = 0;

        while (elapsed < targetDelay) {
            const step = Math.min(checkEveryMs, targetDelay - elapsed);
            await this.sleep(step);
            elapsed += step;

            const status = getCampaignById(campaignId)?.status;
            if (status === 'PAUSED' || status === 'FAILED' || status === 'CANCELLED') {
                return false;
            }
        }

        return true;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    getRuntimeMetrics(campaignId: string): CampaignRuntimeMetrics | undefined {
        return this.runtimeByCampaign.get(campaignId);
    }

    private bumpMetric(
        campaignId: string,
        sessionId: string,
        type: 'sent' | 'failed',
        lastError?: string
    ): void {
        const metrics = this.runtimeByCampaign.get(campaignId);
        if (!metrics) return;

        if (!metrics.bySession[sessionId]) {
            metrics.bySession[sessionId] = { sent: 0, failed: 0 };
        }

        metrics.bySession[sessionId][type] += 1;
        metrics.bySession[sessionId].lastActivityAt = new Date().toISOString();

        if (type === 'failed' && lastError) {
            metrics.bySession[sessionId].lastError = lastError;
            const key = lastError.slice(0, 120);
            metrics.errorCounts[key] = (metrics.errorCounts[key] || 0) + 1;
        }
    }
}

export const campaignQueue = new CampaignQueue();
