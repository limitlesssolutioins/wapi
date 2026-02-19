import { useState, useEffect, useRef, useMemo, type FC, type Dispatch, type SetStateAction } from 'react';
import { api } from '../services/api';
import {
    Send, Search, CheckCircle, Users, History, Loader2, Plus, X, Pencil, Zap, Server, Settings2,
    ChevronLeft, ChevronRight, Trash2, Eye
} from 'lucide-react';
import { toast } from 'sonner';

// --- INTERFACES ---
interface Contact { id: string; name: string; phone: string; }
interface Group { id: string; name: string; contactCount: number; }
interface MessageTemplate { id: string; name: string; content: string; imageUrl?: string; }

interface CampaignRecipient {
    contactId: string;
    phone: string;
    name: string;
    status: 'PENDING' | 'SENT' | 'FAILED';
    error?: string;
    sentAt?: string;
}

interface CampaignSessionData {
    id: string; // The sessionId
    proxyUrl?: string | null;
}

interface Campaign {
    id: string;
    name?: string;
    templateId?: string;
    imageUrl?: string;
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'PAUSED' | 'FAILED' | 'CANCELLED';
    sessions: CampaignSessionData[];
    recipients: CampaignRecipient[];
    stats?: { total: number; sent: number; failed: number; pending: number; };
    runtime?: { 
        startedAt: string;
        bySession: Record<string, { sent: number; failed: number; lastError?: string; lastActivityAt?: string; }>;
        errorCounts: Record<string, number>;
    };
    createdAt: string;
    completedAt?: string;
}

// --- MAIN COMPONENT ---
export default function Campaigns() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [availableSessions, setAvailableSessions] = useState<string[]>([]);
    const [campaignHistory, setCampaignHistory] = useState<Campaign[]>([]);
    
    const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);

    // Campaign Creation State
    const [campaignName, setCampaignName] = useState('');
    const [selectionMode, setSelectionMode] = useState<'manual' | 'group'>('manual');
    const [targetGroupId, setTargetGroupId] = useState<string>('');
    const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
    const [message, setMessage] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
    const [sessionProxies, setSessionProxies] = useState<Record<string, string>>({});
    const [blitzMode, setBlitzMode] = useState(false);
    
    const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
    const [launching, setLaunching] = useState(false);
    
    // UI State
    const [historyPage, setHistoryPage] = useState(1);
    const [historyMeta, setHistoryMeta] = useState({ total: 0, page: 1, totalPages: 1 });
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // --- DATA FETCHING & EFFECTS ---
    useEffect(() => {
        fetchContacts();
        fetchGroups();
        fetchHistory();
        fetchTemplates();
        fetchSessions();
    }, []);

    useEffect(() => {
        if (activeCampaign) {
            const isTerminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(activeCampaign.status);
            if (!isTerminal && !pollingRef.current) {
                pollingRef.current = setInterval(() => fetchCampaignDetails(activeCampaign.id), 3000);
            } else if (isTerminal && pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
                fetchHistory();
            }
        }
        return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }, [activeCampaign]);

    const fetchData = async <T,>(endpoint: string, setter: (data: T) => void, errorMessage: string) => {
        try {
            const { data } = await api.get<{ data: T } | T>(endpoint);
            // Handle paginated responses
            if (data && typeof data === 'object' && 'data' in data && 'meta' in data) {
                setter((data as any).data as T);
                if(endpoint.includes('campaigns')) setHistoryMeta((data as any).meta);
            } else {
                setter(data as T);
            }
        } catch (err) {
            console.error(errorMessage, err);
            toast.error(errorMessage);
        }
    };
    
    const fetchContacts = () => fetchData<Contact[]>('/api/contacts?limit=1000', setContacts, 'Error al cargar contactos');
    const fetchGroups = () => fetchData<Group[]>('/api/groups', setGroups, 'Error al cargar grupos');
    const fetchTemplates = () => fetchData<MessageTemplate[]>('/api/templates', setTemplates, 'Error al cargar plantillas');
    const fetchHistory = (page = historyPage) => fetchData<Campaign[]>(`/api/campaigns?page=${page}&limit=5`, setCampaignHistory, 'Error al cargar historial');
    const fetchCampaignDetails = (id: string) => fetchData<Campaign>(`/api/campaigns/${id}`, (data) => setActiveCampaign(data), `Error al cargar detalles de campaña ${id}`);
    
    const fetchSessions = async () => {
        try {
            const { data } = await api.get<string[]>('/api/whatsapp/sessions');
            setAvailableSessions(data);
            if (data.length > 0) setSelectedSessions(new Set(data));
        } catch (err) {
            console.error('Failed to fetch sessions', err);
        }
    };

    // --- EVENT HANDLERS ---
    const resetCampaignForm = () => {
        setCampaignName('');
        setMessage('');
        setImageUrl('');
        setSelectedTemplateId(null);
        setSelectedContactIds(new Set());
        setTargetGroupId('');
        setEditingCampaignId(null);
        setBlitzMode(false);
        setSessionProxies({});
        // No reseteamos las sesiones seleccionadas, el usuario suele querer usar las mismas
    };

    const handleLaunch = async () => {
        const hasRecipients = selectionMode === 'manual' ? selectedContactIds.size > 0 : !!targetGroupId;
        if ((!editingCampaignId && !hasRecipients) || !message.trim() || selectedSessions.size === 0) {
            return toast.warning('Completa los destinatarios, mensaje y líneas de envío.');
        }

        setLaunching(true);
        try {
            let templateId = selectedTemplateId;
            if (!templateId) {
                const { data: newTpl } = await api.post<MessageTemplate>('/api/templates', {
                    name: `Campaña ${new Date().toLocaleDateString()}`,
                    content: message,
                    imageUrl: imageUrl.trim() || undefined
                });
                templateId = newTpl.id;
            }

            const sessionsPayload: CampaignSessionData[] = Array.from(selectedSessions).map(id => ({
                id,
                proxyUrl: sessionProxies[id] || null
            }));

            const campaignData = {
                name: campaignName.trim() || `Campaña ${new Date().toLocaleString()}`,
                templateId: templateId,
                sessions: sessionsPayload,
                imageUrl: imageUrl.trim() || undefined,
                blitzMode,
                contactIds: selectionMode === 'manual' ? Array.from(selectedContactIds) : [],
                groupId: selectionMode === 'group' ? targetGroupId : null,
            };

            if (editingCampaignId) {
                await api.put(`/api/campaigns/${editingCampaignId}`, campaignData);
                toast.success('Campaña actualizada con éxito');
            } else {
                const { data } = await api.post<Campaign>('/api/campaigns', campaignData);
                setActiveCampaign(data);
                toast.success('Campaña lanzada con éxito');
            }
            
            resetCampaignForm();
            fetchHistory();
        } catch (err) {
            toast.error('Error al procesar la campaña');
        } finally {
            setLaunching(false);
        }
    };

    const handleEditCampaign = async (campaign: Campaign) => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const template = templates.find(t => t.id === campaign.templateId);
        if (template) {
            setMessage(template.content);
            setSelectedTemplateId(template.id);
        } else {
            setMessage('');
            setSelectedTemplateId(null);
            toast.warning('La plantilla original fue eliminada.');
        }

        setCampaignName(campaign.name || '');
        setImageUrl(campaign.imageUrl || '');
        
        const validSessionIds = campaign.sessions.map(s => s.id).filter(id => availableSessions.includes(id));
        setSelectedSessions(new Set(validSessionIds));
        
        const proxies = campaign.sessions.reduce((acc, s) => {
            if (s.proxyUrl) acc[s.id] = s.proxyUrl;
            return acc;
        }, {} as Record<string, string>);
        setSessionProxies(proxies);

        setSelectionMode('manual');
        setTargetGroupId('');
        setSelectedContactIds(new Set(campaign.recipients.map(r => r.contactId)));

        if (['QUEUED', 'PAUSED'].includes(campaign.status)) {
            setEditingCampaignId(campaign.id);
            toast.info('Modo Edición: Puedes modificar esta campaña pendiente.');
        } else {
            setEditingCampaignId(null);
            toast.info('Campaña clonada. Se creará una nueva al lanzar.');
        }
    };

    const handleCancelCampaign = async (id: string) => {
        try {
            const { data } = await api.post<Campaign>(`/api/campaigns/${id}/cancel`);
            setActiveCampaign(data);
            toast.success('Campaña cancelada');
        } catch (err) { toast.error('No se pudo cancelar la campaña'); }
    };

    // --- RENDER ---
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">Campañas Masivas</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* --- COLUMN 1: CONFIGURACIÓN --- */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader icon={Users} title="1. Destinatarios" />
                        <CampaignRecipients
                            contacts={contacts}
                            groups={groups}
                            selectionMode={selectionMode}
                            setSelectionMode={setSelectionMode}
                            targetGroupId={targetGroupId}
                            setTargetGroupId={setTargetGroupId}
                            selectedContactIds={selectedContactIds}
                            setSelectedContactIds={setSelectedContactIds}
                        />
                    </Card>

                    <Card>
                        <CardHeader icon={Send} title="2. Mensaje y Envío" />
                        <CampaignMessage
                            message={message}
                            setMessage={setMessage}
                            imageUrl={imageUrl}
                            setImageUrl={setImageUrl}
                            templates={templates}
                            onLoadTemplate={(tpl: MessageTemplate) => {
                                setMessage(tpl.content);
                                setImageUrl(tpl.imageUrl || '');
                                setSelectedTemplateId(tpl.id);
                            }}
                            fetchTemplates={fetchTemplates}
                            contacts={contacts}
                            selectedContactIds={selectedContactIds}
                        />
                    </Card>
                    
                    <Card>
                        <CardHeader icon={Server} title="3. Opciones de Envío" />
                         <CampaignOptions
                            availableSessions={availableSessions}
                            selectedSessions={selectedSessions}
                            setSelectedSessions={setSelectedSessions}
                            sessionProxies={sessionProxies}
                            setSessionProxies={setSessionProxies}
                            blitzMode={blitzMode}
                            setBlitzMode={setBlitzMode}
                        />
                    </Card>

                    <div className="flex gap-4">
                        {editingCampaignId && (
                            <Button onClick={resetCampaignForm} variant="secondary">Cancelar Edición</Button>
                        )}
                        <Button onClick={handleLaunch} disabled={launching} variant={blitzMode ? 'danger' : 'primary'} className="flex-1">
                            {launching ? <><Loader2 size={16} className="animate-spin" /> Procesando...</> : 
                                editingCampaignId ? <><Pencil size={16} /> Actualizar Campaña</> :
                                blitzMode ? <><Zap size={16} /> Lanzar en Modo Blitz</> :
                                <><Send size={16} /> Lanzar Campaña</>
                            }
                        </Button>
                    </div>
                </div>

                {/* --- COLUMN 2: MONITOR Y HISTORIAL --- */}
                <div className="space-y-6">
                    {activeCampaign && (
                        <Card>
                            <CardHeader 
                                icon={isTerminalStatus(activeCampaign.status) ? CheckCircle : Loader2} 
                                iconClassName={isTerminalStatus(activeCampaign.status) ? "text-green-500" : "text-blue-500 animate-spin"}
                                title="Campaña Activa" 
                            />
                            <ActiveCampaignMonitor
                                campaign={activeCampaign}
                                onCancel={handleCancelCampaign}
                                onPause={async (id: string) => { const { data } = await api.post(`/api/campaigns/${id}/pause`); setActiveCampaign(data); }}
                                onResume={async (id: string) => { const { data } = await api.post(`/api/campaigns/${id}/resume`); setActiveCampaign(data); }}
                            />
                        </Card>
                    )}
                    <Card>
                         <CardHeader icon={History} title="Historial" />
                         <CampaignHistory
                            campaigns={campaignHistory}
                            meta={historyMeta}
                            onSelectCampaign={fetchCampaignDetails}
                            onEditCampaign={handleEditCampaign}
                            onCancelCampaign={handleCancelCampaign}
                            onPageChange={(page: number) => { setHistoryPage(page); fetchHistory(page); }}
                         />
                    </Card>
                </div>
            </div>
        </div>
    );
}

// --- SUB-COMPONENTS ---
const Card: FC<{children: React.ReactNode}> = ({ children }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">{children}</div>
);

const CardHeader: FC<{icon: React.ElementType, title: string, iconClassName?: string}> = ({ icon: Icon, title, iconClassName }) => (
    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-3">
        <Icon size={20} className={iconClassName || "text-blue-600"} />
        <span>{title}</span>
    </h3>
);

const Button: FC<{onClick: () => void, disabled?: boolean, children: React.ReactNode, variant?: 'primary'|'secondary'|'danger', className?: string}> = 
({ onClick, disabled, children, variant = 'primary', className }) => {
    const baseClasses = "py-2.5 px-4 rounded-lg transition-all font-medium flex items-center justify-center gap-2 shadow-sm disabled:cursor-not-allowed";
    const variantClasses = {
        primary: 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-300',
        secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:bg-slate-100',
        danger: 'bg-red-600 hover:bg-red-700 text-white disabled:bg-slate-300',
    };
    return (
        <button onClick={onClick} disabled={disabled} className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
            {children}
        </button>
    );
};

const isTerminalStatus = (status?: string) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status || '');

// --- PROPS INTERFACES ---
interface CampaignRecipientsProps {
    contacts: Contact[];
    groups: Group[];
    selectionMode: 'manual' | 'group';
    setSelectionMode: (mode: 'manual' | 'group') => void;
    targetGroupId: string;
    setTargetGroupId: (id: string) => void;
    selectedContactIds: Set<string>;
    setSelectedContactIds: Dispatch<SetStateAction<Set<string>>>;
}

interface CampaignMessageProps {
    message: string;
    setMessage: Dispatch<SetStateAction<string>>;
    imageUrl: string;
    setImageUrl: (url: string) => void;
    templates: MessageTemplate[];
    onLoadTemplate: (template: MessageTemplate) => void;
    fetchTemplates: () => void;
    contacts: Contact[];
    selectedContactIds: Set<string>;
}

interface CampaignOptionsProps {
    availableSessions: string[];
    selectedSessions: Set<string>;
    setSelectedSessions: Dispatch<SetStateAction<Set<string>>>;
    sessionProxies: Record<string, string>;
    setSessionProxies: Dispatch<SetStateAction<Record<string, string>>>;
    blitzMode: boolean;
    setBlitzMode: Dispatch<SetStateAction<boolean>>;
}

interface ActiveCampaignMonitorProps {
    campaign: Campaign;
    onCancel: (id: string) => void;
    onPause: (id: string) => void;
    onResume: (id: string) => void;
}

interface CampaignHistoryProps {
    campaigns: Campaign[];
    meta: { total: number; page: number; totalPages: number; };
    onSelectCampaign: (id: string) => void;
    onEditCampaign: (campaign: Campaign) => void;
    onCancelCampaign: (id: string) => void;
    onPageChange: (page: number) => void;
}

// --- SUB-COMPONENT IMPLEMENTATIONS ---

const CampaignRecipients: FC<CampaignRecipientsProps> = ({ contacts, groups, selectionMode, setSelectionMode, targetGroupId, setTargetGroupId, selectedContactIds, setSelectedContactIds }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const filteredContacts = useMemo(() => contacts.filter((c: Contact) => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm)
    ), [contacts, searchTerm]);

    return (
        <div>
            <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                <button onClick={() => setSelectionMode('manual')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${selectionMode === 'manual' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Manual</button>
                <button onClick={() => setSelectionMode('group')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${selectionMode === 'group' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Por Grupo</button>
            </div>
            {selectionMode === 'manual' ? (
                <>
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input type="text" placeholder="Buscar contactos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div className="flex justify-between items-center mb-3">
                        <div className="flex gap-2">
                            <button onClick={() => setSelectedContactIds(new Set(filteredContacts.map((c: Contact) => c.id)))} className="text-xs text-blue-600 hover:underline">Todos</button>
                            <span className="text-xs text-slate-300">|</span>
                            <button onClick={() => setSelectedContactIds(new Set())} className="text-xs text-slate-500 hover:underline">Ninguno</button>
                        </div>
                        <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{selectedContactIds.size} seleccionados</span>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                        {filteredContacts.map((c: Contact) => (
                            <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer transition-colors">
                                <input type="checkbox" checked={selectedContactIds.has(c.id)} onChange={() => setSelectedContactIds((prev) => { const next = new Set(prev); if (next.has(c.id)) next.delete(c.id); else next.add(c.id); return next; })} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                <div>
                                    <p className="text-sm font-medium text-slate-800">{c.name}</p>
                                    <p className="text-xs text-slate-500">{c.phone}</p>
                                </div>
                            </label>
                        ))}
                    </div>
                </>
            ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {groups.map((group: Group) => (
                        <button key={group.id} onClick={() => setTargetGroupId(group.id)} className={`w-full text-left p-3 rounded-xl border transition-all ${targetGroupId === group.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}>
                            <div className="flex justify-between items-center">
                                <span className={`font-bold text-sm ${targetGroupId === group.id ? 'text-blue-700' : 'text-slate-700'}`}>{group.name}</span>
                                {targetGroupId === group.id && <CheckCircle size={16} className="text-blue-500" />}
                            </div>
                            <p className="text-xs text-slate-500">{group.contactCount} contactos</p>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const CampaignMessage: FC<CampaignMessageProps> = ({ message, setMessage, imageUrl, setImageUrl, templates, onLoadTemplate, fetchTemplates, contacts, selectedContactIds }) => {
    const [templateName, setTemplateName] = useState('');
    const [uploading, setUploading] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSaveTemplate = async () => {
        if (!templateName.trim() || !message.trim()) return;
        try {
            await api.post('/api/templates', { name: templateName.trim(), content: message, imageUrl: imageUrl.trim() || undefined });
            setTemplateName('');
            fetchTemplates();
            toast.success('Plantilla guardada');
        } catch (err) { toast.error('Error al guardar plantilla'); }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('image', file);
        try {
            const { data } = await api.post<{ url: string }>('/api/upload', formData);
            setImageUrl(data.url);
        } catch (err) { toast.error('Error al subir imagen'); } finally { setUploading(false); }
    };

    // Live Preview Logic
    const previewMessage = useMemo(() => {
        if (!message) return '';
        const firstContactId = Array.from(selectedContactIds)[0];
        const contact = contacts.find(c => c.id === firstContactId) || { name: 'Ejemplo', phone: '1234567890' } as Contact;
        
        let content = message;
        // Spintax simplified preview (takes first option)
        content = content.replace(/\{([^{}]+)\}/g, (_, choices) => choices.split('|')[0]);
        // Variables
        content = content.replace(/\{\{name\}\}/g, contact.name).replace(/\{\{phone\}\}/g, contact.phone);
        return content;
    }, [message, selectedContactIds, contacts]);
    
    return (
        <div className="space-y-4">
             <div className="flex gap-2 mb-2">
                <span className="text-xs text-slate-500 leading-6">Insertar:</span>
                <button onClick={() => setMessage(prev => prev + '{{name}}')} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-mono hover:bg-blue-100 transition-colors">{'{{name}}'}</button>
                <button onClick={() => setMessage(prev => prev + '{{phone}}')} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-mono hover:bg-blue-100 transition-colors">{'{{phone}}'}</button>
            </div>
             <textarea ref={textareaRef} placeholder="Escribe tu mensaje... Usa {{name}} y {{phone}}" value={message} onChange={(e) => setMessage(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-32 resize-none" />
             
             {/* Live Preview Box */}
             {message && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs font-medium text-green-700 mb-1 flex items-center gap-1"><Eye size={12} /> Vista Previa:</p>
                    <p className="text-sm text-green-900 whitespace-pre-wrap">{previewMessage}</p>
                </div>
             )}

             {imageUrl ? (
                <div className="relative inline-block group">
                    <img src={imageUrl} alt="Preview" className="h-32 w-48 object-cover rounded-lg border border-slate-200" />
                    <button onClick={() => setImageUrl('')} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600"><X size={14} /></button>
                </div>
            ) : (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                    <div className="flex flex-col items-center justify-center">
                        {uploading ? <Loader2 size={24} className="text-blue-500 animate-spin" /> : <><Plus size={24} className="text-slate-400" /><p className="text-xs text-slate-500">Adjuntar imagen</p></>}
                    </div>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                </label>
            )}
             <div className="border-t border-slate-200 pt-4 mt-4">
                 <h4 className="text-sm font-semibold text-slate-600 mb-2">Plantillas</h4>
                 <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 mb-3">
                    {templates.map((t: MessageTemplate) => (
                        <div key={t.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer group" onClick={() => onLoadTemplate(t)}>
                            <p className="flex-1 text-sm font-medium text-slate-800 truncate">{t.name}</p>
                            <button onClick={async (e) => { e.stopPropagation(); await api.delete(`/api/templates/${t.id}`); fetchTemplates(); }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                        </div>
                    ))}
                 </div>
                 <div className="flex gap-2">
                    <input type="text" placeholder="Nombre de plantilla..." value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm" />
                    <Button onClick={handleSaveTemplate} disabled={!templateName.trim() || !message.trim()} variant="secondary"><Plus size={14} /> Guardar</Button>
                </div>
             </div>
        </div>
    );
};

const CampaignOptions: FC<CampaignOptionsProps> = ({ availableSessions, selectedSessions, setSelectedSessions, sessionProxies, setSessionProxies, blitzMode, setBlitzMode }) => {
    return (
        <div className="space-y-4">
            <div>
                <h4 className="text-sm font-semibold text-slate-600 mb-2">Líneas de Envío ({selectedSessions.size}/{availableSessions.length})</h4>
                 <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2">
                    {availableSessions.map((s: string) => (
                        <div key={s}>
                            <label className="flex items-center gap-3 px-2 py-1.5 hover:bg-slate-50 rounded-lg">
                                <input type="checkbox" checked={selectedSessions.has(s)} onChange={() => setSelectedSessions((prev) => { const next = new Set(prev); if (next.has(s)) { if (next.size > 1) next.delete(s); } else next.add(s); return next; })} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                <span className="text-sm text-slate-700 font-medium">{s}</span>
                            </label>
                            {selectedSessions.has(s) && (
                                <div className="relative mt-1 ml-8">
                                    <Settings2 className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                    <input type="text" placeholder="URL del Proxy (opcional)" value={sessionProxies[s] || ''} onChange={(e) => setSessionProxies((p) => ({ ...p, [s]: e.target.value }))} className="w-full pl-8 pr-3 py-1 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-blue-500 outline-none" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            <button type="button" onClick={() => setBlitzMode((p) => !p)} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border-2 transition-all text-sm font-medium ${blitzMode ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'}`}>
                <Zap size={16} className={blitzMode ? 'text-red-500' : 'text-slate-400'} />
                <div className="flex-1 text-left">
                    <span className="block font-bold">{blitzMode ? 'Modo Blitz ACTIVO' : 'Modo Blitz'}</span>
                    <span className="text-xs font-normal opacity-75">{blitzMode ? 'Envío máximo, sin delays ni verificación' : 'Acelera el envío omitiendo delays'}</span>
                </div>
                <div className={`w-10 h-5 rounded-full transition-colors relative ${blitzMode ? 'bg-red-500' : 'bg-slate-300'}`}><div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${blitzMode ? 'translate-x-5' : 'translate-x-0.5'}`} /></div>
            </button>
        </div>
    );
};


const ActiveCampaignMonitor: FC<ActiveCampaignMonitorProps> = ({ campaign, onCancel, onPause, onResume }) => {
    const totals = useMemo(() => {
        if (!campaign) return { total: 0, sent: 0, failed: 0, pending: 0 };
        const total = campaign.stats?.total ?? 0;
        const sent = campaign.stats?.sent ?? 0;
        const failed = campaign.stats?.failed ?? 0;
        const pending = Math.max(0, total - sent - failed);
        return { total, sent, failed, pending };
    }, [campaign]);

    const progressPercent = totals.total > 0 ? Math.round(((totals.sent + totals.failed) / totals.total) * 100) : 0;
    
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700 truncate max-w-[70%]">{campaign.name}</span>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    campaign.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 
                    campaign.status === 'PROCESSING' ? 'bg-blue-100 text-blue-700' :
                    'bg-yellow-100 text-yellow-700'
                }`}>{campaign.status}</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2.5"><div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progressPercent}%` }}></div></div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div><span className="font-bold text-green-600 block">{totals.sent}</span><span className="text-slate-500">Enviados</span></div>
                <div><span className="font-bold text-red-500 block">{totals.failed}</span><span className="text-slate-500">Fallidos</span></div>
                <div><span className="font-bold text-slate-600 block">{totals.pending}</span><span className="text-slate-500">Pendientes</span></div>
            </div>
            {!isTerminalStatus(campaign.status) && (
                <div className="flex gap-2">
                    {campaign.status === 'PROCESSING' && <Button onClick={() => onPause(campaign.id)} variant="secondary" className="text-xs flex-1">Pausar</Button>}
                    {campaign.status === 'PAUSED' && <Button onClick={() => onResume(campaign.id)} variant="secondary" className="text-xs flex-1">Reanudar</Button>}
                    <Button onClick={() => onCancel(campaign.id)} variant="secondary" className="text-xs flex-1">Cancelar</Button>
                </div>
            )}
            <div className="text-xs text-slate-500 pt-2 border-t border-slate-200">
                <h5 className="font-semibold mb-1">Sesiones Activas</h5>
                {campaign.sessions.map(s => <div key={s.id} className="truncate" title={s.proxyUrl || 'Sin proxy'}>- {s.id} {s.proxyUrl && <span className="text-blue-500">(Proxy)</span>}</div>)}
            </div>
        </div>
    );
};

const CampaignHistory: FC<CampaignHistoryProps> = ({ campaigns, meta, onSelectCampaign, onEditCampaign, onCancelCampaign, onPageChange }) => (
    <div className="divide-y divide-slate-100">
        {campaigns.length === 0 ? <p className="p-4 text-center text-sm text-slate-400">No hay historial.</p> :
            campaigns.map((c: Campaign) => (
                <div key={c.id} className="p-3 hover:bg-slate-50 group">
                    <div className="flex items-start justify-between">
                        <button className="text-left flex-1" onClick={() => onSelectCampaign(c.id)}>
                             <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                             <p className="text-xs text-slate-500">
                                 {new Date(c.createdAt).toLocaleString()} &middot; {c.stats?.total} destinatarios
                             </p>
                        </button>
                         <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full self-center ml-2 ${ c.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{c.status}</span>
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-2">
                        <button onClick={() => onEditCampaign(c)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full"><Pencil size={14} /></button>
                        {!isTerminalStatus(c.status) && <button onClick={() => onCancelCampaign(c.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full"><X size={14} /></button>}
                    </div>
                </div>
            ))
        }
        <div className="p-2 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
            <span>Página {meta.page} de {meta.totalPages}</span>
            <div className="flex gap-1">
                <button onClick={() => onPageChange(meta.page - 1)} disabled={meta.page <= 1} className="p-1 rounded hover:bg-white disabled:opacity-50"><ChevronLeft size={16} /></button>
                <button onClick={() => onPageChange(meta.page + 1)} disabled={meta.page >= meta.totalPages} className="p-1 rounded hover:bg-white disabled:opacity-50"><ChevronRight size={16} /></button>
            </div>
        </div>
    </div>
);
