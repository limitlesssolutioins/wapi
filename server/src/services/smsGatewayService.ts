import { createSmsGateway, deleteSmsGateway, getSmsGatewayById, listSmsGateways, SmsGateway, updateSmsGateway } from '../utils/smsGateways.js';

const parseEnvInt = (value: string | undefined, fallback: number): number => {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const withMaskedToken = (gateway: SmsGateway) => ({
    ...gateway,
    token: gateway.token ? `${gateway.token.slice(0, 3)}***` : null,
});

const normalizeEndpoint = (endpoint: string): string => endpoint.trim().replace(/\/$/, '');

export const getSmsGateways = () => listSmsGateways().map(withMaskedToken);

export const getSmsGateway = (id: string): SmsGateway | undefined => getSmsGatewayById(id);

export const createGateway = (input: { name: string; endpoint: string; token?: string | null; isActive?: boolean }) => {
    if (!input.name?.trim()) throw new Error('Gateway name is required.');
    if (!input.endpoint?.trim()) throw new Error('Gateway endpoint is required.');

    const gateway = createSmsGateway({
        name: input.name.trim(),
        endpoint: normalizeEndpoint(input.endpoint),
        token: input.token || null,
        isActive: input.isActive,
    });

    return withMaskedToken(gateway);
};

export const updateGateway = (
    id: string,
    updates: Partial<{ name: string; endpoint: string; token?: string | null; isActive: boolean }>
) => {
    const gateway = updateSmsGateway(id, {
        name: updates.name?.trim(),
        endpoint: updates.endpoint ? normalizeEndpoint(updates.endpoint) : undefined,
        token: updates.token,
        isActive: updates.isActive,
    });

    return withMaskedToken(gateway);
};

export const removeGateway = (id: string): void => {
    deleteSmsGateway(id);
};

export const sendSmsViaGateway = async (gatewayId: string, phone: string, message: string): Promise<void> => {
    const gateway = getSmsGatewayById(gatewayId);
    if (!gateway) throw new Error(`Gateway ${gatewayId} not found.`);
    if (!gateway.isActive) throw new Error(`Gateway ${gateway.name} is inactive.`);

    const timeoutMs = parseEnvInt(process.env.SMS_GATEWAY_TIMEOUT_MS, 15000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${normalizeEndpoint(gateway.endpoint)}/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(gateway.token ? { Authorization: `Bearer ${gateway.token}`, 'x-api-key': gateway.token } : {}),
            },
            body: JSON.stringify({
                to: phone,
                message,
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Gateway HTTP ${response.status}${text ? `: ${text}` : ''}`);
        }

        const payload: any = await response.json().catch(() => ({}));
        if (payload?.success === false) {
            throw new Error(payload?.error || 'Gateway rejected SMS.');
        }
    } catch (error) {
        if ((error as any)?.name === 'AbortError') {
            throw new Error('Gateway timeout.');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
};
