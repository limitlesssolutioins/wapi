import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    MessageSquare, Users, Smartphone, AlertTriangle, Send,
    CheckCircle, BarChart3, RefreshCw, Clock, Activity, Loader2
} from 'lucide-react';

interface Stats {
    sentCount: number;
    failedCount: number;
    connectedDevices: number;
    totalCampaigns: number;
    activeCampaigns: number;
    totalContacts: number;
    recentMessages: RecentMessage[];
}

interface RecentMessage {
    id: string;
    sessionId: string;
    phone: string;
    message: string;
    timestamp: string;
    status: 'SENT' | 'FAILED';
    error?: string;
}

export default function DashboardHome() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [sessions, setSessions] = useState<string[]>([]);
    const [selectedSession, setSelectedSession] = useState('default');

    // Quick send state
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState('');
    const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

    const fetchStats = async () => {
        try {
            const { data } = await axios.get<Stats>('http://localhost:3001/api/stats');
            setStats(data);
        } catch (err) {
            console.error('Failed to fetch stats', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchSessions = async () => {
        try {
            const { data } = await axios.get<string[]>('http://localhost:3001/api/whatsapp/sessions');
            setSessions(data);
            // Default to first session if current selection not in list
            if (data.length > 0 && !data.includes(selectedSession) && selectedSession === 'default') {
                setSelectedSession(data[0]);
            }
        } catch (err) {
            console.error('Failed to fetch sessions', err);
        }
    };

    useEffect(() => {
        fetchStats();
        fetchSessions();
        const interval = setInterval(fetchStats, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        setSendStatus('sending');
        const fullPhone = phone.startsWith('57') ? phone : `57${phone}`;
        try {
            await axios.post('http://localhost:3001/api/whatsapp/send', { 
                phone: fullPhone, 
                message,
                sessionId: selectedSession 
            });
            setSendStatus('success');
            setMessage('');
            fetchStats();
            setTimeout(() => setSendStatus('idle'), 3000);
        } catch (error) {
            console.error(error);
            setSendStatus('error');
            setTimeout(() => setSendStatus('idle'), 3000);
        }
    };

    const statCards = stats ? [
        {
            label: 'Mensajes Enviados',
            value: stats.sentCount.toLocaleString(),
            icon: MessageSquare,
            gradient: 'from-blue-500 to-blue-600',
            lightBg: 'bg-blue-50',
            textColor: 'text-blue-600',
        },
        {
            label: 'Campañas Activas',
            value: stats.activeCampaigns,
            subtitle: `${stats.totalCampaigns} total`,
            icon: BarChart3,
            gradient: 'from-purple-500 to-purple-600',
            lightBg: 'bg-purple-50',
            textColor: 'text-purple-600',
        },
        {
            label: 'Dispositivos Conectados',
            value: stats.connectedDevices,
            icon: Smartphone,
            gradient: 'from-emerald-500 to-emerald-600',
            lightBg: 'bg-emerald-50',
            textColor: 'text-emerald-600',
        },
        {
            label: 'Contactos',
            value: stats.totalContacts,
            icon: Users,
            gradient: 'from-amber-500 to-amber-600',
            lightBg: 'bg-amber-50',
            textColor: 'text-amber-600',
        },
        {
            label: 'Mensajes Fallidos',
            value: stats.failedCount,
            icon: AlertTriangle,
            gradient: 'from-red-500 to-red-600',
            lightBg: 'bg-red-50',
            textColor: 'text-red-600',
        },
    ] : [];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={32} className="animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Resumen General</h2>
                    <p className="text-sm text-slate-500 mt-1">Estadísticas en tiempo real de tus sesiones de WhatsApp</p>
                </div>
                <button
                    onClick={fetchStats}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                    <RefreshCw size={14} /> Actualizar
                </button>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {statCards.map((stat) => (
                    <div
                        key={stat.label}
                        className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow group"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className={`p-2.5 rounded-lg bg-gradient-to-br ${stat.gradient} text-white shadow-sm`}>
                                <stat.icon size={18} />
                            </div>
                            <Activity size={14} className="text-slate-300 group-hover:text-slate-400 transition-colors" />
                        </div>
                        <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                        <p className="text-xs font-medium text-slate-500 mt-1">{stat.label}</p>
                        {'subtitle' in stat && stat.subtitle && (
                            <p className="text-[11px] text-slate-400 mt-0.5">{stat.subtitle}</p>
                        )}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Quick Send Form */}
                <div className="lg:col-span-2">
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden h-full">
                        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                <Send size={16} className="text-blue-600" />
                                Mensaje Rápido
                            </h3>
                        </div>
                        <form onSubmit={handleSend} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                                    Desde el Dispositivo (Sesión)
                                </label>
                                <div className="flex gap-2">
                                    <select 
                                        value={selectedSession}
                                        onChange={(e) => setSelectedSession(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-all bg-white text-slate-700 font-medium"
                                    >
                                        <option value="" disabled>Selecciona una sesión...</option>
                                        {sessions.length > 0 ? (
                                            sessions.map(s => (
                                                <option key={s} value={s}>{s} {s === 'default' ? '(Principal)' : ''}</option>
                                            ))
                                        ) : (
                                            <option value="default">Default (Principal)</option>
                                        )}
                                    </select>
                                    <button 
                                        type="button" 
                                        onClick={fetchSessions}
                                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                                        title="Refrescar Sesiones"
                                    >
                                        <RefreshCw size={16} />
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Número de Teléfono</label>
                                <div className="flex">
                                    <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 text-slate-400 text-sm font-mono">
                                        +57
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="3001234567"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-r-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-all"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Mensaje</label>
                                <textarea
                                    placeholder="Escribe tu mensaje aquí..."
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-all h-28 resize-none"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={sendStatus === 'sending'}
                                className={`w-full py-2.5 px-4 rounded-lg text-white text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm
                                    ${sendStatus === 'sending' ? 'bg-blue-400 cursor-not-allowed' :
                                        sendStatus === 'success' ? 'bg-emerald-600 hover:bg-emerald-700' :
                                            sendStatus === 'error' ? 'bg-red-600 hover:bg-red-700' :
                                                'bg-blue-600 hover:bg-blue-700 hover:shadow-md'}`}
                            >
                                {sendStatus === 'sending' && <Loader2 size={16} className="animate-spin" />}
                                {sendStatus === 'success' && <CheckCircle size={16} />}
                                {sendStatus === 'error' && <AlertTriangle size={16} />}
                                {sendStatus === 'idle' && 'Enviar Mensaje'}
                                {sendStatus === 'sending' && 'Enviando...'}
                                {sendStatus === 'success' && '¡Enviado!'}
                                {sendStatus === 'error' && 'Falló — Intenta de nuevo'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="lg:col-span-3">
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden h-full flex flex-col">
                        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                <Clock size={16} className="text-slate-500" />
                                Actividad Reciente
                            </h3>
                            <span className="text-xs text-slate-400">Últimos {stats?.recentMessages.length || 0} mensajes</span>
                        </div>
                        <div className="flex-1 overflow-auto divide-y divide-slate-100">
                            {!stats?.recentMessages.length ? (
                                <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400">
                                    <MessageSquare size={32} className="mb-2 text-slate-300" />
                                    <p className="text-sm">Aún no hay mensajes</p>
                                    <p className="text-xs text-slate-300 mt-1">Los mensajes aparecerán aquí una vez enviados</p>
                                </div>
                            ) : (
                                stats.recentMessages.map((msg, i) => (
                                    <div key={`${msg.id}-${i}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors">
                                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                            msg.status === 'SENT'
                                                ? 'bg-emerald-50 text-emerald-500'
                                                : 'bg-red-50 text-red-500'
                                        }`}>
                                            {msg.status === 'SENT' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-slate-700 font-mono">{msg.phone}</span>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${
                                                    msg.status === 'SENT'
                                                        ? 'bg-emerald-50 text-emerald-600'
                                                        : 'bg-red-50 text-red-600'
                                                }`}>{msg.status}</span>
                                            </div>
                                            <p className="text-xs text-slate-500 truncate mt-0.5">{msg.message}</p>
                                        </div>
                                        <span className="text-[11px] text-slate-400 flex-shrink-0 whitespace-nowrap">
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
