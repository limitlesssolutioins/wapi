import { waService } from '../services/whatsappService.js';
import { getCampaignById, getPendingRecipients, updateCampaignStatus, updateRecipientStatus } from '../utils/campaigns.js';
import { getTemplateById } from '../utils/templates.js';

const parseEnvInt = (value: string | undefined, fallback: number): number => {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

class CampaignQueue {
    private queue: string[] = [];
    private queuedIds = new Set<string>();
    private processing = false;

    enqueue(campaignId: string): void {
        if (this.queuedIds.has(campaignId)) {
            return;
        }

        this.queue.push(campaignId);
        this.queuedIds.add(campaignId);

        if (!this.processing) {
            void this.processNext();
        }
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
            console.error(`[Campaign ${campaignId}] Error: Campaign not found in database.`);
            return;
        }

        const template = getTemplateById(campaign.templateId);
        if (!template) {
            console.error(`[Campaign ${campaignId}] Error: Template ${campaign.templateId} not found.`);
            updateCampaignStatus(campaignId, 'FAILED');
            return;
        }

        if (!campaign.recipients || campaign.recipients.length === 0) {
            console.log(`[Campaign ${campaignId}] No recipients found. Completing.`);
            updateCampaignStatus(campaignId, 'COMPLETED');
            return;
        }

        if (campaign.status !== 'QUEUED' && campaign.status !== 'PROCESSING') {
            console.log(`[Campaign ${campaignId}] Skipping: Invalid status (${campaign.status}).`);
            return;
        }

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

        const pendingRecipients = campaign.recipients.filter((r) => r.status === 'PENDING');
        if (pendingRecipients.length === 0) {
            updateCampaignStatus(campaignId, 'COMPLETED');
            return;
        }

        const minDelayMs = parseEnvInt(process.env.CAMPAIGN_DELAY_MIN_MS, 10000);
        const maxDelayMs = Math.max(minDelayMs, parseEnvInt(process.env.CAMPAIGN_DELAY_MAX_MS, 20000));
        const maxParallelSessions = Math.max(1, parseEnvInt(process.env.CAMPAIGN_MAX_PARALLEL_SESSIONS, sessionIds.length));
        const workerSessionIds = sessionIds.slice(0, Math.min(maxParallelSessions, sessionIds.length));

        console.log(
            `[Campaign ${campaignId}] Running: ${pendingRecipients.length} pending recipients using ${workerSessionIds.length} parallel sessions.`
        );

        let nextRecipientIndex = 0;
        const getNextRecipient = () => {
            if (nextRecipientIndex >= pendingRecipients.length) {
                return undefined;
            }
            const index = nextRecipientIndex++;
            return { index, recipient: pendingRecipients[index] };
        };

        const shouldStop = () => {
            const currentStatus = getCampaignById(campaignId)?.status;
            return currentStatus === 'PAUSED' || currentStatus === 'FAILED' || currentStatus === 'CANCELLED';
        };

        const workers = workerSessionIds.map(async (sessionId) => {
            let sentByWorker = 0;

            while (true) {
                if (shouldStop()) {
                    return;
                }

                const item = getNextRecipient();
                if (!item) {
                    return;
                }

                const { recipient, index } = item;

                if (sentByWorker > 0) {
                    const canContinue = await this.sleepWithStatusCheck(campaignId, minDelayMs, maxDelayMs);
                    if (!canContinue) {
                        return;
                    }
                }

                try {
                    const resolvedMessage = this.resolveVariables(template.content, recipient);
                    await waService.sendMessage(sessionId, recipient.phone, resolvedMessage, campaign.imageUrl);
                    updateRecipientStatus(campaignId, recipient.contactId, 'SENT');
                    sentByWorker++;

                    console.log(
                        `[Campaign ${campaignId}] [${index + 1}/${pendingRecipients.length}] Sent to ${recipient.phone} via ${sessionId}`
                    );
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    updateRecipientStatus(campaignId, recipient.contactId, 'FAILED', errorMsg);
                    console.error(
                        `[Campaign ${campaignId}] [${index + 1}/${pendingRecipients.length}] Failed for ${recipient.phone} via ${sessionId}: ${errorMsg}`
                    );
                }
            }
        });

        await Promise.all(workers);

        const statusAfterWorkers = getCampaignById(campaignId)?.status;
        if (statusAfterWorkers === 'PAUSED' || statusAfterWorkers === 'FAILED' || statusAfterWorkers === 'CANCELLED') {
            console.log(`[Campaign ${campaignId}] Stopped with status ${statusAfterWorkers}.`);
            return;
        }

        const stillPending = getPendingRecipients(campaignId).length;
        if (stillPending === 0) {
            updateCampaignStatus(campaignId, 'COMPLETED');
        }

        console.log(`[Campaign ${campaignId}] Finished.`);
    }

    private resolveVariables(templateContent: string, recipient: { name: string; phone: string }): string {
        return templateContent
            .replace(/\{\{name\}\}/g, recipient.name)
            .replace(/\{\{phone\}\}/g, recipient.phone);
    }

    private async sleepWithStatusCheck(campaignId: string, minDelayMs: number, maxDelayMs: number): Promise<boolean> {
        if (maxDelayMs <= 0) return true;

        const targetDelay = minDelayMs >= maxDelayMs
            ? minDelayMs
            : Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;

        const checkEveryMs = 500;
        let elapsed = 0;

        while (elapsed < targetDelay) {
            const step = Math.min(checkEveryMs, targetDelay - elapsed);
            await this.sleep(step);
            elapsed += step;

            const currentStatus = getCampaignById(campaignId)?.status;
            if (currentStatus === 'PAUSED' || currentStatus === 'FAILED' || currentStatus === 'CANCELLED') {
                return false;
            }
        }

        return true;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

export const campaignQueue = new CampaignQueue();
