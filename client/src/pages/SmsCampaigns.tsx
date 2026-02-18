import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { AlertTriangle, CheckCircle, Clock, Plus, Send, Smartphone, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';

interface Contact {
    id: string;
    name: string;
    phone: string;
}

interface Group {
    id: string;
    name: string;
    contactCount: number;
}

interface SmsGateway {
    id: string;
    name: string;
    endpoint: string;
    token?: string | null;
    isActive: boolean;
}

interface SmsRecipient {
    contactId?: string;
    phone: string;
    name: string;
    status: 'PENDING' | 'SENT' | 'FAILED';
    error?: string;
}

interface SmsCampaign {
    id: string;
    name: string;
    message: string;
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    gatewayIds: string[];
    recipients?: SmsRecipient[];
    stats: { total: number; sent: number; failed: number; pending: number };
    runtimeByGateway?: Record<string, { sent: number; failed: number; lastError?: string; lastActivityAt?: string }>;
    runtime?: { startedAt: string; errorCounts: Record<string, number> };
    createdAt: string;
}

export default function SmsCampaigns() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [gateways, setGateways] = useState<SmsGateway[]>([]);

    const [selectionMode, setSelectionMode] = useState<'manual' | 'group'>('manual');
    const [targetGroupId, setTargetGroupId] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedGatewayIds, setSelectedGatewayIds] = useState<Set<string>>(new Set());

    const [search, setSearch] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);

    const [history, setHistory] = useState<SmsCampaign[]>([]);
    const [activeCampaign, setActiveCampaign] = useState<SmsCampaign | null>(null);

    const [newGatewayName, setNewGatewayName] = useState('');
    const [newGatewayEndpoint, setNewGatewayEndpoint] = useState('');
    const [newGatewayUser, setNewGatewayUser] = useState('');
    const [newGatewayPass, setNewGatewayPass] = useState('');

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const isTerminal = (status?: string) => status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';

    const fetchContacts = async () => {
        const { data } = await api.get<{ data: Contact[] }>('/api/contacts?limit=2000');
        setContacts(data.data || []);
    };

    const fetchGroups = async () => {
        const { data } = await api.get<Group[]>('/api/groups');
        setGroups(data || []);
    };

    const fetchGateways = async () => {
        const { data } = await api.get<SmsGateway[]>('/api/sms/gateways');
        setGateways(data || []);
        const active = (data || []).filter((g) => g.isActive).map((g) => g.id);
        if (!selectedGatewayIds.size && active.length) {
            setSelectedGatewayIds(new Set(active));
        }
    };

    const fetchHistory = async () => {
        const { data } = await api.get<{ data: SmsCampaign[] }>('/api/sms/campaigns?page=1&limit=10');
        setHistory(data.data || []);
    };

    useEffect(() => {
        void Promise.all([fetchContacts(), fetchGroups(), fetchGateways(), fetchHistory()]);
    }, []);

    useEffect(() => {
        if (!activeCampaign || isTerminal(activeCampaign.status)) return;

        pollingRef.current = setInterval(async () => {
            try {
                const { data } = await api.get<SmsCampaign>(`/api/sms/campaigns/${activeCampaign.id}`);
                setActiveCampaign(data);
                if (isTerminal(data.status)) {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    fetchHistory();
                }
            } catch {
                // ignore
            }
        }, 3000);

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [activeCampaign?.id, activeCampaign?.status]);

    const filteredContacts = contacts.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
    );

    const toggleRecipient = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleGateway = (id: string) => {
        setSelectedGatewayIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const createGateway = async () => {
        if (!newGatewayName.trim() || !newGatewayEndpoint.trim()) return;
        const token = newGatewayUser.trim() && newGatewayPass.trim()
            ? `${newGatewayUser.trim()}:${newGatewayPass.trim()}`
            : null;
        try {
            await api.post('/api/sms/gateways', {
                name: newGatewayName.trim(),
                endpoint: newGatewayEndpoint.trim(),
                token,
                isActive: true,
            });
            setNewGatewayName('');
            setNewGatewayEndpoint('');
            setNewGatewayUser('');
            setNewGatewayPass('');
            toast.success('Gateway SMS creado');
            fetchGateways();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'No se pudo crear el gateway');
        }
    };

    const deleteGateway = async (id: string) => {
        try {
            await api.delete(`/api/sms/gateways/${id}`);
            toast.success('Gateway eliminado');
            fetchGateways();
        } catch {
            toast.error('No se pudo eliminar el gateway');
        }
    };

    const launchSmsCampaign = async () => {
        const hasRecipients = selectionMode === 'manual' ? selectedIds.size > 0 : !!targetGroupId;
        if (!hasRecipients || !message.trim() || selectedGatewayIds.size === 0) return;

        setSending(true);
        try {
            const { data } = await api.post<SmsCampaign>('/api/sms/campaigns', {
                name: `SMS ${new Date().toLocaleString()}`,
                message: message.trim(),
                gatewayIds: Array.from(selectedGatewayIds),
                contactIds: selectionMode === 'manual' ? Array.from(selectedIds) : [],
                groupId: selectionMode === 'group' ? targetGroupId : null,
            });

            setActiveCampaign(data);
            setMessage('');
            setSelectedIds(new Set());
            setTargetGroupId('');
            fetchHistory();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'No se pudo lanzar la campaña SMS');
        } finally {
            setSending(false);
        }
    };

    const cancelCampaign = async (id: string) => {
        try {
            await api.post(`/api/sms/campaigns/${id}/cancel`);
            toast.success('Campaña SMS cancelada');
            fetchHistory();
            if (activeCampaign?.id === id) {
                const { data } = await api.get<SmsCampaign>(`/api/sms/campaigns/${id}`);
                setActiveCampaign(data);
            }
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'No se pudo cancelar');
        }
    };

    const totals = activeCampaign?.stats || { total: 0, sent: 0, failed: 0, pending: 0 };
    const progress = totals.total ? Math.round(((totals.sent + totals.failed) / totals.total) * 100) : 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-800">SMS Masivos</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200">
                        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Smartphone size={16} /> Gateways SMS</h3>
                        <div className="space-y-2 mb-3">
                            {gateways.map((g) => (
                                <label key={g.id} className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={selectedGatewayIds.has(g.id)} onChange={() => toggleGateway(g.id)} />
                                    <span className="font-medium">{g.name}</span>
                                    <span className="text-slate-400">{g.endpoint}</span>
                                    {!g.isActive && <span className="text-red-500">(inactivo)</span>}
                                    <button className="ml-auto text-red-500" onClick={() => deleteGateway(g.id)}><Trash2 size={14} /></button>
                                </label>
                            ))}
                            {gateways.length === 0 && <p className="text-xs text-slate-400">Aún no hay gateways.</p>}
                        </div>
                        <div className="space-y-2">
                            <input value={newGatewayName} onChange={(e) => setNewGatewayName(e.target.value)} placeholder="Nombre (ej: Mi Android)" className="w-full px-3 py-2 border rounded text-sm" />
                            <input value={newGatewayEndpoint} onChange={(e) => setNewGatewayEndpoint(e.target.value)} placeholder="Endpoint (ej: http://192.168.1.100:8080)" className="w-full px-3 py-2 border rounded text-sm" />
                            <div className="grid grid-cols-2 gap-2">
                                <input value={newGatewayUser} onChange={(e) => setNewGatewayUser(e.target.value)} placeholder="Usuario" className="w-full px-3 py-2 border rounded text-sm" />
                                <input type="password" value={newGatewayPass} onChange={(e) => setNewGatewayPass(e.target.value)} placeholder="Contraseña" className="w-full px-3 py-2 border rounded text-sm" />
                            </div>
                            <p className="text-xs text-slate-400">Credenciales de la app SMS Gateway en tu Android</p>
                            <button onClick={createGateway} className="w-full py-2 rounded bg-slate-900 text-white text-sm flex items-center justify-center gap-2"><Plus size={14} /> Agregar Gateway</button>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200">
                        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Users size={16} /> Destinatarios</h3>
                        <div className="flex gap-2 mb-2">
                            <button onClick={() => setSelectionMode('manual')} className={`px-2 py-1 rounded text-xs ${selectionMode === 'manual' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Manual</button>
                            <button onClick={() => setSelectionMode('group')} className={`px-2 py-1 rounded text-xs ${selectionMode === 'group' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Grupo</button>
                        </div>
                        {selectionMode === 'group' ? (
                            <select className="w-full border rounded px-3 py-2 text-sm" value={targetGroupId} onChange={(e) => setTargetGroupId(e.target.value)}>
                                <option value="">Seleccionar grupo</option>
                                {groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.contactCount})</option>)}
                            </select>
                        ) : (
                            <>
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contacto" className="w-full mb-2 border rounded px-3 py-2 text-sm" />
                                <div className="max-h-60 overflow-auto border rounded divide-y">
                                    {filteredContacts.slice(0, 300).map((c) => (
                                        <label key={c.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                                            <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleRecipient(c.id)} />
                                            <span className="truncate">{c.name}</span>
                                            <span className="text-slate-400 ml-auto">{c.phone}</span>
                                        </label>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200">
                        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Send size={16} /> Mensaje SMS</h3>
                        <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="w-full border rounded p-3 h-52" placeholder="Escribe tu mensaje SMS. Variables: {{name}}, {{phone}}" />
                        <button onClick={launchSmsCampaign} disabled={sending} className="w-full mt-3 py-2 rounded bg-blue-600 text-white disabled:bg-slate-300">
                            {sending ? 'Lanzando...' : 'Lanzar Campaña SMS'}
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    {activeCampaign && (
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <div className="flex items-center gap-2 mb-3">
                                <h3 className="font-semibold text-slate-800">Progreso SMS</h3>
                                <span className="ml-auto text-xs px-2 py-1 rounded bg-slate-100">{activeCampaign.status}</span>
                            </div>
                            {!isTerminal(activeCampaign.status) && (
                                <button onClick={() => cancelCampaign(activeCampaign.id)} className="mb-3 px-2 py-1 bg-red-100 text-red-700 rounded text-xs">Cancelar</button>
                            )}
                            <div className="w-full bg-slate-200 h-2 rounded mb-2"><div className="bg-blue-600 h-2 rounded" style={{ width: `${progress}%` }} /></div>
                            <div className="text-sm flex gap-3 mb-3">
                                <span className="text-green-600 flex items-center gap-1"><CheckCircle size={12} /> {totals.sent}</span>
                                <span className="text-red-500 flex items-center gap-1"><AlertTriangle size={12} /> {totals.failed}</span>
                                <span className="text-slate-500 flex items-center gap-1"><Clock size={12} /> {totals.pending}</span>
                            </div>
                            {activeCampaign.runtimeByGateway && (
                                <div className="border rounded divide-y text-xs">
                                    {Object.entries(activeCampaign.runtimeByGateway).map(([gw, m]) => (
                                        <div key={gw} className="px-2 py-1">
                                            <div className="flex justify-between"><span className="font-semibold">{gw}</span><span>{m.sent} OK / {m.failed} FAIL</span></div>
                                            {m.lastError && <p className="text-red-500 truncate">{m.lastError}</p>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="bg-white p-4 rounded-xl border border-slate-200">
                        <h3 className="font-semibold text-slate-800 mb-3">Historial SMS</h3>
                        <div className="divide-y max-h-96 overflow-auto">
                            {history.map((c) => (
                                <div key={c.id} className="py-2 cursor-pointer" onClick={async () => {
                                    const { data } = await api.get<SmsCampaign>(`/api/sms/campaigns/${c.id}`);
                                    setActiveCampaign(data);
                                }}>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium truncate">{c.name}</span>
                                        <span className="ml-auto text-xs px-2 py-0.5 rounded bg-slate-100">{c.status}</span>
                                    </div>
                                    <div className="text-xs text-slate-500 flex gap-2 mt-1">
                                        <span>{c.stats.total} total</span>
                                        <span className="text-green-600">{c.stats.sent} enviados</span>
                                        <span className="text-red-500">{c.stats.failed} fallidos</span>
                                        {(c.status === 'PROCESSING' || c.status === 'QUEUED') && (
                                            <button onClick={(e) => { e.stopPropagation(); void cancelCampaign(c.id); }} className="ml-auto text-red-600 flex items-center gap-1"><X size={12} /> Cancelar</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {history.length === 0 && <p className="text-sm text-slate-400">Aún no hay campañas SMS.</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

