import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { QRCodeSVG } from 'qrcode.react';
import { RefreshCcw, CheckCircle, Smartphone, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';

interface StatusResponse {
    status: 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED';
    qrCode: string | null;
}

export default function DeviceManager() {
    const [sessions, setSessions] = useState<string[]>([]);
    const [currentSession, setCurrentSession] = useState('');
    const [statusData, setStatusData] = useState<StatusResponse>({ status: 'DISCONNECTED', qrCode: null });
    const [loading, setLoading] = useState(false);
    const [newSessionName, setNewSessionName] = useState('');
    
    // Rename state
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renamingValue, setRenamingValue] = useState('');

    const fetchSessions = async () => {
        try {
            const { data } = await api.get<string[]>('/api/whatsapp/sessions');
            setSessions(data);
            if (data.length > 0 && !currentSession) {
                setCurrentSession(data[0]);
            } else if (data.length === 0) {
                setCurrentSession('');
            }
        } catch (err) {
            console.error(err);
            setSessions([]);
        }
    };

    const fetchStatus = async () => {
        try {
            const { data } = await api.get(`/api/whatsapp/status?sessionId=${currentSession}`);
            setStatusData(data);
        } catch (error) {
            console.error('Failed to fetch status', error);
        }
    };

    const initSession = async () => {
        setLoading(true);
        try {
            await api.post('/api/whatsapp/init', { sessionId: currentSession });
            setTimeout(fetchStatus, 2000);
        } catch (error) {
            console.error(error);
            toast.error('Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    const handleRename = async (oldId: string) => {
        const newName = renamingValue.trim().toLowerCase();
        if (!newName || newName === oldId) {
            setRenamingId(null);
            return;
        }
        try {
            await api.post('/api/whatsapp/rename', { oldId, newId: newName });
            toast.success('Sesion renombrada');
            if (currentSession === oldId) setCurrentSession(newName);
            fetchSessions();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al renombrar');
        } finally {
            setRenamingId(null);
        }
    };

    const handleDeleteSession = async (sessionId: string) => {
        if (!confirm(`¿Estás seguro de eliminar la sesión "${sessionId}"? Esto borrará sus datos de conexión.`)) return;
        try {
            await api.post('/api/whatsapp/logout', { sessionId });
            toast.success('Sesión eliminada');
            if (currentSession === sessionId) {
                setCurrentSession('');
                setStatusData({ status: 'DISCONNECTED', qrCode: null });
            }
            fetchSessions();
        } catch (error) {
            console.error(error);
            toast.error('Error al eliminar sesión');
        }
    };

    const logoutSession = async () => {
        if (!confirm('¿Estás seguro de cerrar sesión?')) return;
        setLoading(true);
        try {
            await api.post('/api/whatsapp/logout', { sessionId: currentSession });
            setStatusData({ status: 'DISCONNECTED', qrCode: null });
            fetchSessions();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };
    const forceNewQr = async () => {
        if (!currentSession) return;
        if (!confirm(`Se reiniciara la sesion "${currentSession}" para generar un QR nuevo. Continuar?`)) return;
        setLoading(true);
        try {
            await api.post('/api/whatsapp/reset', { sessionId: currentSession });
            toast.success('Reinicio de sesion iniciado. Esperando nuevo QR...');
            setStatusData({ status: 'CONNECTING', qrCode: null });
            setTimeout(fetchStatus, 1500);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'No se pudo reiniciar la sesion');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
        const interval = setInterval(fetchSessions, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!currentSession) {
             setStatusData({ status: 'DISCONNECTED', qrCode: null });
             return;
        }
        setStatusData({ status: 'DISCONNECTED', qrCode: null }); 
        fetchStatus();
        const interval = setInterval(fetchStatus, 2000);
        return () => clearInterval(interval);
    }, [currentSession]);

    const isConnected = statusData.status === 'CONNECTED';
    const isQrReady = statusData.status === 'QR_READY' || (statusData.status === 'CONNECTING' && statusData.qrCode);

    const handleAddSession = async (e: React.FormEvent) => {
        e.preventDefault();
        const name = newSessionName.trim().toLowerCase();
        if (!name) return;
        if (name === 'default') {
            toast.error('El nombre "default" esta reservado.');
            return;
        }
        if (sessions.includes(name)) {
            setCurrentSession(name);
            return;
        }

        try {
            setLoading(true);
            await api.post('/api/whatsapp/init', { sessionId: name });
            setCurrentSession(name);
            setNewSessionName('');
            await fetchSessions();
            setTimeout(fetchStatus, 1500);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al crear sesion');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">Gestión de Dispositivos</h2>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Session List Sidebar */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-semibold text-slate-700 mb-3">Sesiones</h3>
                        <div className="space-y-2">
                            {sessions.map(session => (
                                <div key={session} className="group relative">
                                    {renamingId === session ? (
                                        <div className="flex items-center gap-1 p-1">
                                            <input 
                                                autoFocus
                                                value={renamingValue}
                                                onChange={(e) => setRenamingValue(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleRename(session)}
                                                className="w-full text-sm border rounded px-2 py-1 outline-none focus:border-blue-500"
                                            />
                                            <button onClick={() => handleRename(session)} className="text-green-600 p-1"><Check size={16}/></button>
                                            <button onClick={() => setRenamingId(null)} className="text-red-500 p-1"><X size={16}/></button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center">
                                            <button
                                                onClick={() => setCurrentSession(session)}
                                                className={`flex-1 text-left px-4 py-2 rounded-lg flex items-center justify-between transition-colors ${
                                                    currentSession === session 
                                                        ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                                                        : 'hover:bg-slate-50 text-slate-600'
                                                }`}
                                            >
                                                <span className="capitalize font-medium truncate">{session}</span>
                                                {currentSession === session && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                                            </button>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setRenamingId(session);
                                                    setRenamingValue(session);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-blue-600 transition-opacity"
                                                title="Renombrar"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteSession(session);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-600 transition-opacity"
                                                title="Eliminar"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <form onSubmit={handleAddSession} className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                            <input 
                                type="text"
                                placeholder="Nueva sesión..."
                                value={newSessionName}
                                onChange={(e) => setNewSessionName(e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-slate-300 rounded outline-none focus:border-blue-500"
                            />
                            <button type="submit" className="p-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-600">
                                <Plus size={20} />
                            </button>
                        </form>
                    </div>
                </div>

                {/* Main Connection Area */}
                <div className="lg:col-span-3">
                    {currentSession ? (
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-lg ${isConnected ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                                    <Smartphone size={24} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg capitalize">{currentSession} Dispositivo</h3>
                                    <p className="text-slate-500 text-sm">Estado: <span className="font-mono font-bold">{statusData.status}</span></p>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col items-center justify-center p-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 min-h-[400px]">
                            {isConnected ? (
                                <div className="text-center text-green-600 animate-in fade-in zoom-in duration-300">
                                    <CheckCircle size={64} className="mx-auto mb-4" />
                                    <p className="font-bold text-xl">Dispositivo Conectado</p>
                                    <p className="text-slate-500 mt-2 mb-6">Listo para manejar campañas para <span className="font-semibold text-slate-700 capitalize">{currentSession}</span></p>
                                    
                                    <button
                                        onClick={logoutSession}
                                        disabled={loading}
                                        className="px-6 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg border border-red-200 transition-colors text-sm font-medium flex items-center gap-2 mx-auto"
                                    >
                                        <Trash2 size={16} />
                                        {loading ? 'Cerrando...' : 'Cerrar Sesión'}
                                    </button>
                                </div>
                            ) : isQrReady && statusData.qrCode ? (
                                <div className="text-center animate-in fade-in zoom-in duration-300">
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 inline-block mb-4">
                                        <QRCodeSVG value={statusData.qrCode} size={256} />
                                    </div>
                                    <p className="text-slate-800 font-bold text-lg">Escanear Código QR</p>
                                    <p className="text-slate-500">Abre WhatsApp &gt; Dispositivos vinculados &gt; Vincular un dispositivo</p>
                                </div>
                            ) : (
                                <div className="text-center">
                                    <p className="text-slate-500 mb-6 text-lg">No hay sesión activa para <span className="font-semibold text-slate-700 capitalize">{currentSession}</span></p>
                                    <div className="flex justify-center gap-3">
                                        <button
                                            onClick={initSession}
                                            disabled={loading || statusData.status === 'CONNECTING'}
                                            className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-200 flex items-center gap-3 font-medium"
                                        >
                                            <RefreshCcw size={20} className={loading || statusData.status === 'CONNECTING' ? "animate-spin" : ""} />
                                            {loading || statusData.status === 'CONNECTING' ? 'Iniciando...' : 'Iniciar Sesión'}
                                        </button>
                                        <button
                                            onClick={forceNewQr}
                                            disabled={loading}
                                            className="px-4 py-3 bg-amber-100 text-amber-800 border border-amber-200 rounded-xl hover:bg-amber-200 transition-colors font-medium"
                                        >
                                            Forzar nuevo QR
                                        </button>
                                        {(loading || statusData.status === 'CONNECTING') && (
                                            <button 
                                                onClick={() => {
                                                    setLoading(false);
                                                    setStatusData({ status: 'DISCONNECTED', qrCode: null });
                                                }}
                                                className="px-4 py-3 bg-white text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors font-medium"
                                            >
                                                Cancelar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-white rounded-xl border border-slate-200 p-12">
                            <Smartphone size={64} className="mb-4 opacity-50" />
                            <h3 className="text-xl font-semibold mb-2">Selecciona una sesión</h3>
                            <p>O crea una nueva para comenzar a conectar dispositivos.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}






