import { waService } from '../services/whatsappService.js';
import { CampaignRecipient, getCampaignById, getPendingRecipients, updateCampaignStatus, updateRecipientStatus } from '../utils/campaigns.js';
import { getTemplateById } from '../utils/templates.js';

const parseEnvInt = (value: string | undefined, fallback: number): number => {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

type SessionRuntimeMetrics = {
    sent: number;
    failed: number;
    lastError?: string;
    lastActivityAt?: string;
};

type CampaignRuntimeMetrics = {
    startedAt: string;
    bySession: Record<string, SessionRuntimeMetrics>;
    errorCounts: Record<string, number>;
};

type WorkerConfig = {
    minDelayMs: number;
    maxDelayMs: number;
    batchBreakMinMessages: number;
    batchBreakMaxMessages: number;
    batchBreakMinMs: number;
    batchBreakMaxMs: number;
};

type ActiveCampaignState = {
    pendingRecipients: CampaignRecipient[];
    nextIndex: number;
    template: { content: string };
    imageUrl?: string;
    config: WorkerConfig;
    activeSessionWorkers: Set<string>;
    spawnWorker: (sessionId: string) => void;
};

class CampaignQueue {
    private queue: string[] = [];
    private queuedIds = new Set<string>();
    private processing = false;
    private runtimeByCampaign = new Map<string, CampaignRuntimeMetrics>();
    private activeStates = new Map<string, ActiveCampaignState>();

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

    /** Spawns a new worker for the given session on an already-running campaign. */
    addSessionToCampaign(campaignId: string, sessionId: string): boolean {
        const state = this.activeStates.get(campaignId);
        if (!state) return false;
        state.spawnWorker(sessionId);
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

        const sessionIds = (campaign.sessionIds || []).filter((s) => waService.isValidSessionId(s));
        if (sessionIds.length === 0) {
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

        const config: WorkerConfig = {
            minDelayMs,
            maxDelayMs,
            batchBreakMinMessages: parseEnvInt(process.env.CAMPAIGN_BATCH_MIN, 12),
            batchBreakMaxMessages: parseEnvInt(process.env.CAMPAIGN_BATCH_MAX, 18),
            batchBreakMinMs: parseEnvInt(process.env.CAMPAIGN_BATCH_REST_MIN_MS, 120000),
            batchBreakMaxMs: Math.max(
                parseEnvInt(process.env.CAMPAIGN_BATCH_REST_MIN_MS, 120000),
                parseEnvInt(process.env.CAMPAIGN_BATCH_REST_MAX_MS, 240000)
            ),
        };

        const state: ActiveCampaignState = {
            pendingRecipients,
            nextIndex: 0,
            template,
            imageUrl: campaign.imageUrl,
            config,
            activeSessionWorkers: new Set<string>(),
            spawnWorker: () => {}, // Assigned below
        };

        // Counter + promise to track when all workers (including dynamically added ones) finish
        let activeWorkerCount = 0;
        let allDoneResolve!: () => void;
        const allDonePromise = new Promise<void>((r) => { allDoneResolve = r; });

        const spawnWorker = (sessionId: string) => {
            if (state.activeSessionWorkers.has(sessionId)) return;
            if (!waService.isValidSessionId(sessionId)) return;
            state.activeSessionWorkers.add(sessionId);
            activeWorkerCount++;
            this.initializeRuntimeMetrics(campaignId, [sessionId]);
            void this.runWorkerLoop(campaignId, sessionId, state).finally(() => {
                state.activeSessionWorkers.delete(sessionId);
                activeWorkerCount--;
                if (activeWorkerCount === 0) allDoneResolve();
            });
        };

        state.spawnWorker = spawnWorker;
        this.activeStates.set(campaignId, state);

        console.log(
            `[Campaign ${campaignId}] Running: ${pendingRecipients.length} pending recipients using ${workerSessionIds.length} parallel sessions.`
        );

        for (const sessionId of workerSessionIds) {
            spawnWorker(sessionId);
        }

        if (activeWorkerCount > 0) {
            await allDonePromise;
        }

        this.activeStates.delete(campaignId);

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

    private async runWorkerLoop(
        campaignId: string,
        sessionId: string,
        state: ActiveCampaignState
    ): Promise<void> {
        let messagesSinceBatchBreak = 0;
        const { config } = state;
        const nextBatchBreakAt = () =>
            Math.floor(Math.random() * (config.batchBreakMaxMessages - config.batchBreakMinMessages + 1)) +
            config.batchBreakMinMessages;
        let currentBatchLimit = nextBatchBreakAt();

        while (true) {
            if (this.isCampaignStopped(campaignId)) return;

            if (this.isSessionRemoved(campaignId, sessionId)) {
                console.log(`[Campaign ${campaignId}] [${sessionId}] Session removed, worker stopping.`);
                return;
            }

            const recipient = this.getNextRecipient(state);
            if (!recipient) return;

            if (messagesSinceBatchBreak >= currentBatchLimit) {
                const restMs =
                    Math.floor(Math.random() * (config.batchBreakMaxMs - config.batchBreakMinMs + 1)) +
                    config.batchBreakMinMs;
                const restSec = Math.round(restMs / 1000);
                console.log(
                    `[Campaign ${campaignId}] [${sessionId}] Batch break: ${messagesSinceBatchBreak} msgs sent, resting ${restSec}s...`
                );
                const canContinue = await this.sleepWithStatusCheck(campaignId, restMs, restMs);
                if (!canContinue) return;
                messagesSinceBatchBreak = 0;
                currentBatchLimit = nextBatchBreakAt();
            }

            const canContinue = await this.sleepWithStatusCheck(campaignId, config.minDelayMs, config.maxDelayMs);
            if (!canContinue) return;

            // Check again after sleep — session may have been removed during the delay
            if (this.isSessionRemoved(campaignId, sessionId)) {
                console.log(`[Campaign ${campaignId}] [${sessionId}] Session removed during delay, worker stopping.`);
                return;
            }

            try {
                const resolvedMessage = this.resolveVariables(state.template.content, recipient);
                await waService.sendMessage(sessionId, recipient.phone, resolvedMessage, state.imageUrl);
                updateRecipientStatus(campaignId, recipient.contactId, 'SENT');
                this.bumpSessionMetric(campaignId, sessionId, 'sent');
                messagesSinceBatchBreak++;
                console.log(
                    `[Campaign ${campaignId}] [${sessionId}] Sent to ${recipient.phone} (batch ${messagesSinceBatchBreak}/${currentBatchLimit})`
                );
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                updateRecipientStatus(campaignId, recipient.contactId, 'FAILED', errorMsg);
                messagesSinceBatchBreak++;
                this.bumpSessionMetric(campaignId, sessionId, 'failed', errorMsg);
                console.error(
                    `[Campaign ${campaignId}] [${sessionId}] Failed for ${recipient.phone}: ${errorMsg}`
                );
            }
        }
    }

    private isCampaignStopped(campaignId: string): boolean {
        const status = getCampaignById(campaignId)?.status;
        return status === 'PAUSED' || status === 'FAILED' || status === 'CANCELLED';
    }

    private isSessionRemoved(campaignId: string, sessionId: string): boolean {
        const campaign = getCampaignById(campaignId);
        if (!campaign) return true;
        return !campaign.sessionIds.includes(sessionId);
    }

    private getNextRecipient(state: ActiveCampaignState): CampaignRecipient | undefined {
        if (state.nextIndex >= state.pendingRecipients.length) return undefined;
        return state.pendingRecipients[state.nextIndex++];
    }

    private resolveVariables(templateContent: string, recipient: { name: string; phone: string }): string {
        return templateContent
            .replace(/\{\{name\}\}/g, recipient.name)
            .replace(/\{\{phone\}\}/g, recipient.phone);
    }

    private async sleepWithStatusCheck(campaignId: string, minDelayMs: number, maxDelayMs: number): Promise<boolean> {
        if (maxDelayMs <= 0) return true;

        const targetDelay =
            minDelayMs >= maxDelayMs
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

    getRuntimeMetrics(campaignId: string): CampaignRuntimeMetrics | undefined {
        return this.runtimeByCampaign.get(campaignId);
    }

    private initializeRuntimeMetrics(campaignId: string, sessionIds: string[]): void {
        const existing = this.runtimeByCampaign.get(campaignId) ?? {
            startedAt: new Date().toISOString(),
            bySession: {},
            errorCounts: {},
        };
        for (const sessionId of sessionIds) {
            if (!existing.bySession[sessionId]) {
                existing.bySession[sessionId] = { sent: 0, failed: 0 };
            }
        }
        this.runtimeByCampaign.set(campaignId, existing);
    }

    private bumpSessionMetric(
        campaignId: string,
        sessionId: string,
        type: 'sent' | 'failed',
        lastError?: string
    ): void {
        const metrics = this.runtimeByCampaign.get(campaignId) ?? {
            startedAt: new Date().toISOString(),
            bySession: {},
            errorCounts: {},
        };
        if (!metrics.bySession[sessionId]) {
            metrics.bySession[sessionId] = { sent: 0, failed: 0 };
        }

        metrics.bySession[sessionId][type] += 1;
        metrics.bySession[sessionId].lastActivityAt = new Date().toISOString();
        if (type === 'failed') {
            metrics.bySession[sessionId].lastError = lastError;
            const key = (lastError || 'Unknown error').slice(0, 120);
            metrics.errorCounts[key] = (metrics.errorCounts[key] || 0) + 1;
        }

        this.runtimeByCampaign.set(campaignId, metrics);
    }
}

export const campaignQueue = new CampaignQueue();
