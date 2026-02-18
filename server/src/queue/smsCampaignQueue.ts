import { getSmsCampaignById, getPendingSmsRecipients, updateSmsCampaignStatus, updateSmsRecipientStatus } from '../utils/smsCampaigns.js';
import { sendSmsViaGateway } from '../services/smsGatewayService.js';

const parseEnvInt = (value: string | undefined, fallback: number): number => {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

type SmsGatewayRuntime = {
    sent: number;
    failed: number;
    lastError?: string;
    lastActivityAt?: string;
};

type SmsRuntimeMetrics = {
    startedAt: string;
    byGateway: Record<string, SmsGatewayRuntime>;
    errorCounts: Record<string, number>;
};

class SmsCampaignQueue {
    private queue: string[] = [];
    private queuedIds = new Set<string>();
    private processing = false;
    private runtimeByCampaign = new Map<string, SmsRuntimeMetrics>();

    enqueue(campaignId: string): void {
        if (this.queuedIds.has(campaignId)) return;
        this.queue.push(campaignId);
        this.queuedIds.add(campaignId);

        if (!this.processing) {
            void this.processNext();
        }
    }

    getRuntimeMetrics(campaignId: string): SmsRuntimeMetrics | undefined {
        return this.runtimeByCampaign.get(campaignId);
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
        const campaign = getSmsCampaignById(campaignId);
        if (!campaign) return;

        if (campaign.status !== 'QUEUED' && campaign.status !== 'PROCESSING') {
            return;
        }

        if (campaign.status === 'QUEUED') {
            updateSmsCampaignStatus(campaignId, 'PROCESSING');
        }

        const gatewayIds = (campaign.gatewayIds || []).filter(Boolean);
        if (gatewayIds.length === 0) {
            updateSmsCampaignStatus(campaignId, 'FAILED');
            return;
        }

        const pendingRecipients = campaign.recipients?.filter((r) => r.status === 'PENDING') || [];
        if (pendingRecipients.length === 0) {
            updateSmsCampaignStatus(campaignId, 'COMPLETED');
            return;
        }

        const maxParallelGateways = Math.max(1, parseEnvInt(process.env.SMS_MAX_PARALLEL_GATEWAYS, gatewayIds.length));
        const workerGatewayIds = gatewayIds.slice(0, Math.min(maxParallelGateways, gatewayIds.length));

        const minDelayMs = parseEnvInt(process.env.SMS_DELAY_MIN_MS, 4000);
        const maxDelayMs = Math.max(minDelayMs, parseEnvInt(process.env.SMS_DELAY_MAX_MS, 7000));

        this.initializeRuntime(campaignId, workerGatewayIds);

        let nextRecipientIndex = 0;
        const getNextRecipient = () => {
            if (nextRecipientIndex >= pendingRecipients.length) return undefined;
            const idx = nextRecipientIndex++;
            return { idx, recipient: pendingRecipients[idx] };
        };

        const shouldStop = () => {
            const status = getSmsCampaignById(campaignId)?.status;
            return status === 'FAILED' || status === 'CANCELLED';
        };

        const workers = workerGatewayIds.map(async (gatewayId) => {
            let attempts = 0;
            while (true) {
                if (shouldStop()) return;

                const item = getNextRecipient();
                if (!item) return;

                const { recipient, idx } = item;

                if (attempts > 0) {
                    const canContinue = await this.sleepWithStatusCheck(campaignId, minDelayMs, maxDelayMs);
                    if (!canContinue) return;
                }

                try {
                    const resolved = this.resolveVariables(campaign.message, recipient.name || '', recipient.phone);
                    const cleanedPhone = (recipient.phone || '').replace(/\D/g, '');
                    await sendSmsViaGateway(gatewayId, cleanedPhone, resolved);
                    updateSmsRecipientStatus(campaignId, recipient.phone, 'SENT', undefined, gatewayId);
                    attempts++;
                    this.bumpMetric(campaignId, gatewayId, 'sent');
                    console.log(`[SMS ${campaignId}] [${idx + 1}/${pendingRecipients.length}] Sent to ${recipient.phone} via ${gatewayId}`);
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    updateSmsRecipientStatus(campaignId, recipient.phone, 'FAILED', msg, gatewayId);
                    attempts++;
                    this.bumpMetric(campaignId, gatewayId, 'failed', msg);
                    console.error(`[SMS ${campaignId}] [${idx + 1}/${pendingRecipients.length}] Failed for ${recipient.phone} via ${gatewayId}: ${msg}`);
                }
            }
        });

        await Promise.all(workers);

        const statusAfter = getSmsCampaignById(campaignId)?.status;
        if (statusAfter === 'FAILED' || statusAfter === 'CANCELLED') return;

        const stillPending = getPendingSmsRecipients(campaignId).length;
        if (stillPending === 0) {
            updateSmsCampaignStatus(campaignId, 'COMPLETED');
        }
    }

    private resolveVariables(content: string, name: string, phone: string): string {
        return content
            .replace(/\{\{name\}\}/g, name)
            .replace(/\{\{phone\}\}/g, phone);
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

            const status = getSmsCampaignById(campaignId)?.status;
            if (status === 'FAILED' || status === 'CANCELLED') return false;
        }

        return true;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private initializeRuntime(campaignId: string, gatewayIds: string[]): void {
        const existing = this.runtimeByCampaign.get(campaignId) ?? {
            startedAt: new Date().toISOString(),
            byGateway: {},
            errorCounts: {},
        };

        for (const gatewayId of gatewayIds) {
            if (!existing.byGateway[gatewayId]) {
                existing.byGateway[gatewayId] = { sent: 0, failed: 0 };
            }
        }

        this.runtimeByCampaign.set(campaignId, existing);
    }

    private bumpMetric(campaignId: string, gatewayId: string, type: 'sent' | 'failed', error?: string): void {
        const runtime = this.runtimeByCampaign.get(campaignId) ?? {
            startedAt: new Date().toISOString(),
            byGateway: {},
            errorCounts: {},
        };

        if (!runtime.byGateway[gatewayId]) {
            runtime.byGateway[gatewayId] = { sent: 0, failed: 0 };
        }

        runtime.byGateway[gatewayId][type] += 1;
        runtime.byGateway[gatewayId].lastActivityAt = new Date().toISOString();

        if (type === 'failed') {
            runtime.byGateway[gatewayId].lastError = error;
            const key = (error || 'Unknown error').slice(0, 120);
            runtime.errorCounts[key] = (runtime.errorCounts[key] || 0) + 1;
        }

        this.runtimeByCampaign.set(campaignId, runtime);
    }
}

export const smsCampaignQueue = new SmsCampaignQueue();
