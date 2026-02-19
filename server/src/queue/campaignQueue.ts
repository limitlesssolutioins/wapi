import { waService } from '../services/whatsappService.js';
import { getCampaignById, updateCampaignStatus, updateRecipientStatus } from '../utils/campaigns.js';
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

// Rotate session every N messages to give each number a natural rest
const ROTATION_LIMIT = 15;

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
    addSessionToCampaign(_campaignId: string, _sessionId: string): boolean {
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
        const sessionIds = (campaign.sessionIds || []).filter((s) => waService.isValidSessionId(s));
        if (sessionIds.length === 0) {
            console.error(`[Campaign ${campaignId}] No valid sessions assigned.`);
            updateCampaignStatus(campaignId, 'FAILED');
            return;
        }

        this.runtimeByCampaign.set(campaignId, {
            startedAt: new Date().toISOString(),
            bySession: Object.fromEntries(sessionIds.map((s) => [s, { sent: 0, failed: 0 }])),
            errorCounts: {},
        });

        console.log(
            `[Campaign ${campaignId}] ${pendingRecipients.length} recipients, sessions: [${sessionIds.join(', ')}], rotating every ${ROTATION_LIMIT} messages.`
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
            const activeSessions = (getCampaignById(campaignId)?.sessionIds || []).filter((s) =>
                waService.isValidSessionId(s)
            );
            if (activeSessions.length === 0) {
                console.error(`[Campaign ${campaignId}] No sessions remaining. Failing.`);
                updateCampaignStatus(campaignId, 'FAILED');
                return;
            }

            // Rotate session after ROTATION_LIMIT messages
            if (messagesSentOnCurrentSession >= ROTATION_LIMIT && activeSessions.length > 1) {
                messagesSentOnCurrentSession = 0;
                currentSessionIndex = (currentSessionIndex + 1) % activeSessions.length;
                console.log(`[Campaign ${campaignId}] Rotated to session: ${activeSessions[currentSessionIndex]}`);
            }

            const currentSessionId = activeSessions[currentSessionIndex % activeSessions.length];

            // Delay between messages (skip before the very first)
            if (i > 0) {
                const canContinue = await this.sleepWithStatusCheck(campaignId, 10000, 20000);
                if (!canContinue) return;
            }

            try {
                const resolvedMessage = this.resolveVariables(template.content, recipient);
                await waService.sendMessage(currentSessionId, recipient.phone, resolvedMessage, campaign.imageUrl);
                updateRecipientStatus(campaignId, recipient.contactId, 'SENT');
                messagesSentOnCurrentSession++;
                this.bumpMetric(campaignId, currentSessionId, 'sent');
                console.log(
                    `[Campaign ${campaignId}] [${i + 1}/${pendingRecipients.length}] [${currentSessionId}] Sent to ${recipient.phone}`
                );
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                updateRecipientStatus(campaignId, recipient.contactId, 'FAILED', errorMsg);
                this.bumpMetric(campaignId, currentSessionId, 'failed', errorMsg);
                console.error(
                    `[Campaign ${campaignId}] [${i + 1}/${pendingRecipients.length}] Failed for ${recipient.phone}: ${errorMsg}`
                );

                // Rotate immediately if the session disconnected and there are alternatives
                if (errorMsg.includes('disconnected') && activeSessions.length > 1) {
                    currentSessionIndex = (currentSessionIndex + 1) % activeSessions.length;
                    messagesSentOnCurrentSession = 0;
                    console.log(`[Campaign ${campaignId}] Session error — rotated to: ${activeSessions[currentSessionIndex]}`);
                }
            }
        }

        updateCampaignStatus(campaignId, 'COMPLETED');
        console.log(`[Campaign ${campaignId}] Finished.`);
    }

    private resolveVariables(templateContent: string, recipient: { name: string; phone: string }): string {
        return templateContent
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
