import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Send, Search, CheckCircle, AlertTriangle, Clock, Users, History, Loader2, FileText, Trash2, Plus, Eye, ChevronLeft, ChevronRight, X, Pencil } from 'lucide-react';
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

interface CampaignRecipient {
    contactId: string;
    phone: string;
    name: string;
    status: 'PENDING' | 'SENT' | 'FAILED';
    error?: string;
    sentAt?: string;
}

interface Campaign {
    id: string;
    sessionId: string;
    message: string;
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED';
    recipients: CampaignRecipient[];
    totalCount: number;
    sentCount: number;
    failedCount: number;
    createdAt: string;
    completedAt?: string;
}

interface CampaignSummary {
    id: string;
    sessionId: string;
    status: string;
    totalCount: number;
    sentCount: number;
    failedCount: number;
    createdAt: string;
    completedAt?: string;
    messagePreview: string;
}

interface MessageTemplate {
    id: string;
    name: string;
    content: string;
    imageUrl?: string;
    createdAt: string;
    updatedAt: string;
}

export default function Campaigns() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [selectionMode, setSelectionMode] = useState<'manual' | 'group'>('manual');
    const [targetGroupId, setTargetGroupId] = useState<string>('');

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [message, setMessage] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [uploading, setUploading] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    
    // Multi-session selection
    const [availableSessions, setAvailableSessions] = useState<string[]>([]);
    const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
    const [showSessionDropdown, setShowSessionDropdown] = useState(false);

    const [launching, setLaunching] = useState(false);

    const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
    const [campaignHistory, setCampaignHistory] = useState<CampaignSummary[]>([]);
    
    // History Pagination
    const [historyPage, setHistoryPage] = useState(1);
    const [historyMeta, setHistoryMeta] = useState({ total: 0, page: 1, totalPages: 1 });

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [templateName, setTemplateName] = useState('');

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        fetchContacts();
        fetchGroups();
        fetchHistory();
        fetchTemplates();
        fetchSessions();
    }, []);

    const fetchGroups = async () => {
        try {
            const { data } = await api.get<Group[]>('/api/groups');
            setGroups(data);
        } catch (err) {
            console.error('Failed to fetch groups', err);
        }
    };

    const fetchSessions = async () => {
        try {
            const { data } = await api.get<string[]>('/api/whatsapp/sessions');
            setAvailableSessions(data);
            if (data.length > 0) {
                // Select ALL sessions by default for automatic rotation
                setSelectedSessions(new Set(data));
            }
        } catch (err) {
            console.error('Failed to fetch sessions', err);
        }
    };

    // Polling for active campaign
    useEffect(() => {
        if (activeCampaign && activeCampaign.status !== 'COMPLETED') {
            pollingRef.current = setInterval(async () => {
                try {
                    const { data } = await api.get<Campaign>(`/api/campaigns/${activeCampaign.id}`);
                    setActiveCampaign(data);
                    if (data.status === 'COMPLETED') {
                        if (pollingRef.current) clearInterval(pollingRef.current);
                        fetchHistory();
                    }
                } catch (err) {
                    console.error('Polling error', err);
                }
            }, 3000);
        }
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [activeCampaign?.id, activeCampaign?.status]);

    const fetchContacts = async () => {
        try {
            // Requesting a high limit to load contacts for selection
            // Future improvement: Implement server-side search/pagination in this component too
            const { data } = await api.get<{ data: Contact[] }>('/api/contacts?limit=1000');
            setContacts(data.data);
        } catch (err) {
            console.error('Failed to fetch contacts', err);
        }
    };

    const fetchHistory = async () => {
        try {
            const { data } = await api.get<{ data: CampaignSummary[], meta: any }>(
                `/api/campaigns?page=${historyPage}&limit=10`
            );
            setCampaignHistory(data.data);
            setHistoryMeta(data.meta);
        } catch (err) {
            console.error('Failed to fetch campaigns', err);
        }
    };

    const fetchTemplates = async () => {
        try {
            const { data } = await api.get<MessageTemplate[]>('/api/templates');
            setTemplates(data);
        } catch (err) {
            console.error('Failed to fetch templates', err);
        }
    };

    const toggleContactSelection = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSession = (sessionId: string) => {
        setSelectedSessions(prev => {
            const next = new Set(prev);
            if (next.has(sessionId)) {
                if (next.size > 1) next.delete(sessionId);
            } else {
                next.add(sessionId);
            }
            return next;
        });
    };

    const selectAll = () => {
        setSelectedIds(new Set(filteredContacts.map(c => c.id)));
    };

    const deselectAll = () => {
        setSelectedIds(new Set());
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('image', file);

        try {
            const { data } = await api.post<{ url: string }>('/api/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setImageUrl(data.url);
        } catch (err) {
            console.error('Upload failed', err);
        } finally {
            setUploading(false);
        }
    };

    const handleLaunch = async () => {
        const hasRecipients = selectionMode === 'manual' ? selectedIds.size > 0 : !!targetGroupId;
        if (!hasRecipients || !message.trim() || selectedSessions.size === 0) return;
        
        setLaunching(true);
        try {
            let templateId = selectedTemplateId;

            // If no template is selected or the message has changed from the template
            // we create a temporary one or ensure we have an ID
            if (!templateId) {
                const { data: newTpl } = await api.post<MessageTemplate>('/api/templates', {
                    name: `Campaña ${new Date().toLocaleDateString()}`,
                    content: message,
                    imageUrl: imageUrl.trim() || null
                });
                templateId = newTpl.id;
            }

            const { data } = await api.post<Campaign>('/api/campaigns', {
                name: `Campaña ${new Date().toLocaleString()}`,
                templateId: templateId,
                sessionIds: Array.from(selectedSessions),
                contactIds: selectionMode === 'manual' ? Array.from(selectedIds) : [],
                groupId: selectionMode === 'group' ? targetGroupId : null,
                imageUrl: imageUrl.trim() || null
            });
            setActiveCampaign(data);
            setMessage('');
            setImageUrl('');
            setSelectedTemplateId(null);
            setSelectedIds(new Set());
            setTargetGroupId('');
            fetchHistory();
        } catch (err) {
            console.error('Failed to create campaign', err);
        } finally {
            setLaunching(false);
        }
    };

    const handleSaveTemplate = async () => {
        if (!templateName.trim() || !message.trim()) return;
        try {
            await api.post('/api/templates', {
                name: templateName.trim(),
                content: message,
                imageUrl: imageUrl.trim() || null
            });
            setTemplateName('');
            fetchTemplates();
        } catch (err) {
            console.error('Failed to save template', err);
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        try {
            await api.delete(`/api/templates/${id}`);
            fetchTemplates();
        } catch (err) {
            console.error('Failed to delete template', err);
        }
    };

    const handleLoadTemplate = (template: MessageTemplate) => {
        setMessage(template.content);
        setImageUrl(template.imageUrl || '');
        setSelectedTemplateId(template.id);
    };

    const insertVariable = (variable: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newMessage = message.substring(0, start) + variable + message.substring(end);
        setMessage(newMessage);
        // Restore cursor position after the inserted variable
        setTimeout(() => {
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + variable.length;
        }, 0);
    };

    const filteredContacts = contacts.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm)
    );

    // Preview: resolve variables using the first selected contact
    const previewMessage = (() => {
        if (!message) return '';
        const firstSelectedContact = contacts.find(c => selectedIds.has(c.id));
        if (!firstSelectedContact) return message;
        return message
            .replace(/\{\{name\}\}/g, firstSelectedContact.name)
            .replace(/\{\{phone\}\}/g, firstSelectedContact.phone);
    })();

    const handleEditCampaign = async (e: React.MouseEvent, campaignId: string) => {
        e.stopPropagation();
        try {
            const { data: campaign } = await api.get<Campaign>(`/api/campaigns/${campaignId}`);
            
            // Restore Template/Message
            const template = templates.find(t => t.id === campaign.templateId);
            if (template) {
                setMessage(template.content);
                setSelectedTemplateId(template.id);
            } else {
                // Template might be deleted
                toast.error('La plantilla original fue eliminada. El mensaje está vacío.');
                setMessage('');
                setSelectedTemplateId(null);
            }

            // Restore Image
            setImageUrl(campaign.imageUrl || '');
            
            // Restore Sessions
            // Ensure we convert sessionIds to Set and only include available ones
            if (campaign.sessionIds && campaign.sessionIds.length > 0) {
                 const validSessions = campaign.sessionIds.filter(s => availableSessions.includes(s));
                 if (validSessions.length > 0) {
                     setSelectedSessions(new Set(validSessions));
                 }
            }

            // Restore Contacts (Always Manual Mode)
            setSelectionMode('manual');
            setTargetGroupId('');
            
            if (campaign.recipients) {
                const recipientIds = campaign.recipients.map(r => r.contactId).filter(id => id);
                setSelectedIds(new Set(recipientIds));
            }

            toast.success('Datos de la campaña cargados en el formulario.');
            
            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (err) {
            console.error('Failed to load campaign for editing', err);
            toast.error('Error al cargar la campaña');
        }
    };

    const progressPercent = activeCampaign
        ? Math.round(((activeCampaign.sentCount + activeCampaign.failedCount) / activeCampaign.totalCount) * 100)
        : 0;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800">Campañas Masivas</h2>
                
                {/* Session Multi-Select */}
                <div className="relative">
                    <button 
                        onClick={() => setShowSessionDropdown(!showSessionDropdown)}
                        className={`flex items-center gap-2 border rounded-xl px-4 py-2 text-sm font-bold transition-all shadow-sm ${
                            selectedSessions.size > 0 
                            ? 'bg-blue-600 border-blue-600 text-white' 
                            : 'bg-white border-slate-300 text-slate-600'
                        }`}
                    >
                        <Users size={16} />
                        <span>Líneas de Envío:</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${selectedSessions.size > 0 ? 'bg-white text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
                            {selectedSessions.size} / {availableSessions.length}
                        </span>
                    </button>
                    
                    {showSessionDropdown && (
                        <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-3 animate-in zoom-in-95 duration-150">
                            <div className="flex justify-between items-center mb-3 px-1">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dispositivos Disponibles</p>
                                <button 
                                    onClick={() => setSelectedSessions(new Set(availableSessions))}
                                    className="text-[10px] text-blue-600 font-bold hover:underline"
                                >
                                    Marcar Todos
                                </button>
                            </div>
                            
                            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                {availableSessions.length > 0 ? availableSessions.map(s => (
                                    <label key={s} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedSessions.has(s)}
                                            onChange={() => toggleSession(s)}
                                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-slate-700 capitalize font-medium">{s}</span>
                                    </label>
                                )) : (
                                    <p className="text-xs text-slate-400 px-2 py-4 text-center">No hay sesiones activas</p>
                                )}
                            </div>
                            
                            <div className="border-t border-slate-100 mt-3 pt-3 px-1">
                                <p className="text-[10px] text-slate-400 leading-tight text-center italic">
                                    El sistema enviará grupos de 15 mensajes por cada línea seleccionada.
                                </p>
                            </div>
                        </div>
                    )}
                    {/* Backdrop to close */}
                    {showSessionDropdown && (
                        <div className="fixed inset-0 z-10" onClick={() => setShowSessionDropdown(false)} />
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Column 1 — Contacts */}
                <div className="space-y-4">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <div className="flex flex-col gap-4 mb-4">
                            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                                <Users size={20} className="text-blue-600" />
                                Destinatarios
                            </h3>
                            
                            {/* Toggle Mode */}
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                <button 
                                    onClick={() => setSelectionMode('manual')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${selectionMode === 'manual' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                                >
                                    Manual
                                </button>
                                <button 
                                    onClick={() => setSelectionMode('group')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${selectionMode === 'group' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                                >
                                    Por Grupo
                                </button>
                            </div>
                        </div>

                        {selectionMode === 'manual' ? (
                            <>
                                {/* Search */}
                                <div className="relative mb-3">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Buscar contactos..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>

                                {/* Select/Deselect */}
                                <div className="flex justify-between items-center mb-3">
                                    <div className="flex gap-2">
                                        <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">Todos</button>
                                        <span className="text-xs text-slate-300">|</span>
                                        <button onClick={deselectAll} className="text-xs text-slate-500 hover:underline">Ninguno</button>
                                    </div>
                                    <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        {selectedIds.size} seleccionados
                                    </span>
                                </div>

                                {/* Contact list */}
                                <div className="max-h-[400px] overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                    {filteredContacts.length === 0 ? (
                                        <div className="p-4 text-center text-sm text-slate-400">No se encontraron contactos.</div>
                                    ) : (
                                        filteredContacts.map(c => (
                                            <label
                                                key={c.id}
                                                className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer transition-colors"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(c.id)}
                                                    onChange={() => toggleContactSelection(c.id)}
                                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                                                    <p className="text-[10px] text-slate-500">+57 {c.phone}</p>
                                                </div>
                                            </label>
                                        ))
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-xs text-slate-500">Selecciona el grupo al que deseas enviar esta campaña:</p>
                                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                                    {groups.length === 0 ? (
                                        <p className="text-sm text-slate-400 text-center py-10">No hay grupos creados.</p>
                                    ) : (
                                        groups.map(group => (
                                            <button
                                                key={group.id}
                                                onClick={() => setTargetGroupId(group.id)}
                                                className={`w-full text-left p-3 rounded-xl border transition-all ${
                                                    targetGroupId === group.id 
                                                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' 
                                                        : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className={`font-bold text-sm ${targetGroupId === group.id ? 'text-blue-700' : 'text-slate-700'}`}>
                                                        {group.name}
                                                    </span>
                                                    {targetGroupId === group.id && <CheckCircle size={16} className="text-blue-500" />}
                                                </div>
                                                <p className="text-xs text-slate-500">{group.contactCount} contactos</p>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Column 2 — Templates + Message */}
                <div className="space-y-4">
                    {/* Templates Section */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <FileText size={20} className="text-purple-600" />
                            Mis Plantillas
                        </h3>

                        {/* Template list */}
                        {templates.length > 0 && (
                            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 mb-3">
                                {templates.map(t => (
                                    <div
                                        key={t.id}
                                        className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer transition-colors group"
                                        onClick={() => handleLoadTemplate(t)}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
                                            <p className="text-xs text-slate-400 truncate">{t.content}</p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteTemplate(t.id);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all flex-shrink-0"
                                            title="Eliminar plantilla"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {templates.length === 0 && (
                            <p className="text-sm text-slate-400 mb-3">Aún no hay plantillas guardadas.</p>
                        )}

                        {/* Save as template */}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Nombre de plantilla..."
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                            <button
                                onClick={handleSaveTemplate}
                                disabled={!templateName.trim() || !message.trim()}
                                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors text-sm flex items-center gap-1"
                            >
                                <Plus size={14} /> Guardar
                            </button>
                        </div>
                    </div>

                    {/* Message Section */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <Send size={20} className="text-blue-600" />
                            Mensaje de Campaña
                        </h3>

                        {/* Variable insertion buttons */}
                        <div className="flex gap-2 mb-2">
                            <span className="text-xs text-slate-500 leading-6">Insertar:</span>
                            <button
                                onClick={() => insertVariable('{{name}}')}
                                className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-mono hover:bg-blue-100 transition-colors"
                            >
                                {'{{name}}'}
                            </button>
                            <button
                                onClick={() => insertVariable('{{phone}}')}
                                className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-mono hover:bg-blue-100 transition-colors"
                            >
                                {'{{phone}}'}
                            </button>
                        </div>

                        {/* Image Upload Input */}
                        <div className="mb-4">
                            <label className="block text-xs font-medium text-slate-500 mb-2">Imagen de la Campaña (Opcional):</label>
                            
                            {imageUrl ? (
                                <div className="relative inline-block group">
                                    <img 
                                        src={imageUrl} 
                                        alt="Preview" 
                                        className="h-32 w-48 object-cover rounded-lg border border-slate-200" 
                                    />
                                    <button 
                                        onClick={() => setImageUrl('')}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        {uploading ? (
                                            <Loader2 size={24} className="text-blue-500 animate-spin" />
                                        ) : (
                                            <>
                                                <Plus size={24} className="text-slate-400 mb-1" />
                                                <p className="text-xs text-slate-500">Haz clic para adjuntar imagen</p>
                                            </>
                                        )}
                                    </div>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                                </label>
                            )}
                        </div>

                        <textarea
                            ref={textareaRef}
                            placeholder="Escribe tu mensaje... Usa {{name}} y {{phone}} para personalizar"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-32 resize-none mb-3"
                        />

                        {/* Live Preview */}
                        {message && selectedIds.size > 0 && (
                            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                <p className="text-xs font-medium text-green-700 mb-1 flex items-center gap-1">
                                    <Eye size={12} /> Vista Previa (1er destinatario):
                                </p>
                                <p className="text-sm text-green-900 whitespace-pre-wrap">{previewMessage}</p>
                            </div>
                        )}

                        <button
                            onClick={handleLaunch}
                            disabled={launching || (selectionMode === 'manual' ? selectedIds.size === 0 : !targetGroupId) || !message.trim()}
                            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
                        >
                            {launching ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" /> Iniciando...
                                </>
                            ) : (
                                <>
                                    <Send size={16} /> {selectionMode === 'manual' ? `Lanzar Campaña (${selectedIds.size})` : `Lanzar a Grupo (${groups.find(g => g.id === targetGroupId)?.contactCount || 0})`}
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Column 3 — Progress + History */}
                <div className="space-y-4">
                    {/* Active Campaign Progress */}
                    {activeCampaign && (
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                {activeCampaign.status === 'COMPLETED' ? (
                                    <CheckCircle size={20} className="text-green-600" />
                                ) : (
                                    <Loader2 size={20} className="text-blue-600 animate-spin" />
                                )}
                                Progreso de Campaña
                                <span className={`ml-auto text-xs font-bold px-2 py-1 rounded-full ${
                                    activeCampaign.status === 'COMPLETED'
                                        ? 'bg-green-100 text-green-700'
                                        : activeCampaign.status === 'PROCESSING'
                                            ? 'bg-blue-100 text-blue-700'
                                            : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                    {activeCampaign.status}
                                </span>
                            </h3>

                            {/* Progress bar */}
                            <div className="w-full bg-slate-200 rounded-full h-3 mb-3">
                                <div
                                    className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>

                            {/* Counters */}
                            <div className="flex gap-4 mb-4 text-sm">
                                <span className="flex items-center gap-1 text-green-600">
                                    <CheckCircle size={14} /> {activeCampaign.sentCount} enviados
                                </span>
                                <span className="flex items-center gap-1 text-red-500">
                                    <AlertTriangle size={14} /> {activeCampaign.failedCount} fallidos
                                </span>
                                <span className="flex items-center gap-1 text-slate-500">
                                    <Clock size={14} /> {activeCampaign.totalCount - activeCampaign.sentCount - activeCampaign.failedCount} pendientes
                                </span>
                            </div>

                            {/* Recipients list */}
                            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                {activeCampaign.recipients.map(r => (
                                    <div key={r.contactId} className="flex items-center justify-between px-3 py-2 text-sm">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">
                                                {r.name.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="truncate text-slate-800">{r.name}</span>
                                            <span className="text-xs text-slate-400 flex-shrink-0">{r.phone}</span>
                                        </div>
                                        <div className="flex-shrink-0 ml-2">
                                            {r.status === 'SENT' && (
                                                <span className="inline-flex items-center gap-1 text-green-600 bg-green-50 px-2 py-0.5 rounded-full text-xs font-medium">
                                                    <CheckCircle size={10} /> Enviado
                                                </span>
                                            )}
                                            {r.status === 'FAILED' && (
                                                <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded-full text-xs font-medium" title={r.error}>
                                                    <AlertTriangle size={10} /> Fallido
                                                </span>
                                            )}
                                            {r.status === 'PENDING' && (
                                                <span className="inline-flex items-center gap-1 text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full text-xs font-medium">
                                                    <Clock size={10} /> Pendiente
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Campaign History */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 border-b border-slate-200 bg-slate-50">
                            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                <History size={20} className="text-slate-500" />
                                Historial de Campañas
                            </h3>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {campaignHistory.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 text-sm">Aún no hay campañas.</div>
                            ) : (
                                campaignHistory.map(c => (
                                    <div
                                        key={c.id}
                                        className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                                        onClick={async () => {
                                            try {
                                                const { data } = await api.get<Campaign>(`/api/campaigns/${c.id}`);
                                                setActiveCampaign(data);
                                            } catch (err) {
                                                console.error(err);
                                            }
                                        }}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-medium text-slate-800 truncate max-w-[60%]">
                                                {c.messagePreview}
                                            </span>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                                c.status === 'COMPLETED' ? 'bg-green-100 text-green-700'
                                                    : c.status === 'PROCESSING' ? 'bg-blue-100 text-blue-700'
                                                        : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                {c.status}
                                            </span>
                                        </div>
                                        <div className="flex gap-3 text-xs text-slate-500">
                                            <span>{c.totalCount} destinatarios</span>
                                            <span className="text-green-600">{c.sentCount} enviados</span>
                                            {c.failedCount > 0 && <span className="text-red-500">{c.failedCount} fallidos</span>}
                                            <div className="ml-auto flex items-center gap-2">
                                                <span>{new Date(c.createdAt).toLocaleString()}</span>
                                                <button
                                                    onClick={(e) => handleEditCampaign(e, c.id)}
                                                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                                    title="Editar / Reutilizar Campaña"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        
                        {/* History Pagination */}
                        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                            <span>Página {historyMeta.page} de {historyMeta.totalPages}</span>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                                    disabled={historyPage === 1}
                                    className="p-1 rounded hover:bg-white border border-transparent hover:border-slate-300 disabled:opacity-50"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button
                                    onClick={() => setHistoryPage(p => Math.min(historyMeta.totalPages, p + 1))}
                                    disabled={historyPage >= historyMeta.totalPages}
                                    className="p-1 rounded hover:bg-white border border-transparent hover:border-slate-300 disabled:opacity-50"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}