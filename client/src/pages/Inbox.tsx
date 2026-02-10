import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Send, Search, User, Check, Clock, Loader2, MessageSquare, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Message {
    id: string;
    sessionId: string;
    phone: string;
    message: string;
    timestamp: string;
    status: 'SENT' | 'FAILED' | 'RECEIVED';
    direction: 'INCOMING' | 'OUTGOING';
}

export default function Inbox() {
    const [chats, setChats] = useState<Message[]>([]);
    const [activeChat, setActiveChat] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [availableSessions, setAvailableSessions] = useState<string[]>([]);
    const [sessionId, setSessionId] = useState('');
    
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchSessions = async () => {
        try {
            const { data } = await api.get<string[]>('/api/whatsapp/sessions');
            setAvailableSessions(data);
            if (data.length > 0 && !sessionId) {
                setSessionId(data[0]);
            }
        } catch (err) {
            console.error('Failed to fetch sessions', err);
        }
    };

    const fetchChats = async () => {
        if (!sessionId) return;
        try {
            const { data } = await api.get<Message[]>(`/api/whatsapp/chats?sessionId=${sessionId}`);
            // Filter unique phones just in case backend doesn't perfectly
            const unique = data.filter((v, i, a) => a.findIndex(t => (t.phone === v.phone)) === i);
            setChats(unique);
        } catch (error) {
            console.error('Error fetching chats:', error);
        }
    };

    const fetchConversation = async (phone: string) => {
        try {
            const { data } = await api.get<Message[]>(`/api/whatsapp/chats/${phone}?sessionId=${sessionId}`);
            setMessages(data);
            setActiveChat(phone);
            setTimeout(scrollToBottom, 100);
        } catch (error) {
            console.error('Error fetching conversation:', error);
        }
    };

    const handleDeleteChat = async (phone: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('¿Estás seguro de que deseas eliminar este chat del buzón?')) return;
        
        try {
            await api.delete(`/api/whatsapp/chats/${phone}?sessionId=${sessionId}`);
            toast.success('Chat eliminado');
            if (activeChat === phone) {
                setActiveChat(null);
                setMessages([]);
            }
            fetchChats();
        } catch (error) {
            console.error('Error deleting chat:', error);
            toast.error('No se pudo eliminar el chat');
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !activeChat) return;

        setSending(true);
        try {
            // Optimistic update
            const tempMsg: Message = {
                id: 'temp-' + Date.now(),
                sessionId,
                phone: activeChat,
                message: newMessage,
                timestamp: new Date().toISOString(),
                status: 'SENT',
                direction: 'OUTGOING'
            };
            setMessages(prev => [...prev, tempMsg]);
            setNewMessage('');
            scrollToBottom();

            await api.post('/api/whatsapp/send', {
                sessionId,
                phone: activeChat,
                message: tempMsg.message
            });
            
            // Refresh to get real ID and status
            fetchConversation(activeChat);
        } catch (error) {
            console.error('Error sending message:', error);
            // Optionally mark message as failed in UI
        } finally {
            setSending(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    useEffect(() => {
        if (sessionId) {
            fetchChats();
            const interval = setInterval(fetchChats, 10000);
            return () => clearInterval(interval);
        }
    }, [sessionId]);

    useEffect(() => {
        if (activeChat) {
            const interval = setInterval(() => fetchConversation(activeChat), 3000);
            return () => clearInterval(interval);
        }
    }, [activeChat]);

    const filteredChats = chats.filter(c => c.phone.includes(searchTerm));

    return (
        <div className="h-[calc(100vh-140px)] flex bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Sidebar List */}
            <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50">
                <div className="p-4 border-b border-slate-200 bg-white">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center justify-between">
                        Buzón de Mensajes
                        <button onClick={fetchChats} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-full hover:bg-slate-100 transition-colors">
                            <RefreshCw size={16} />
                        </button>
                    </h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar chat..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    {/* Session Selector */}
                    <div className="mt-3 flex items-center gap-2">
                         <span className="text-xs font-semibold text-slate-500">Dispositivo:</span>
                         <select 
                            value={sessionId}
                            onChange={(e) => setSessionId(e.target.value)}
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-full bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 capitalize font-medium"
                         >
                            {availableSessions.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                         </select>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {filteredChats.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-sm">
                            No hay conversaciones recientes.
                        </div>
                    ) : (
                        filteredChats.map(chat => (
                            <button
                                key={chat.phone}
                                onClick={() => fetchConversation(chat.phone)}
                                className={`w-full text-left p-4 hover:bg-white border-b border-slate-100 transition-colors flex gap-3 ${
                                    activeChat === chat.phone ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                                }`}
                            >
                                <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 font-bold flex-shrink-0">
                                    <User size={20} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <span className="font-semibold text-slate-800 truncate text-sm">+57 {chat.phone}</span>
                                        <span className="text-[10px] text-slate-400 flex-shrink-0">
                                            {new Date(chat.timestamp).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                                        {chat.direction === 'OUTGOING' && (
                                            <span className="text-slate-400">Tú:</span>
                                        )}
                                        {chat.message}
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => handleDeleteChat(chat.phone, e)}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 transition-all self-center"
                                    title="Eliminar chat"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-[#e5ddd5]/30">
                {activeChat ? (
                    <>
                        {/* Chat Header */}
                        <div className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 font-bold">
                                    <User size={16} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800">+57 {activeChat}</h3>
                                    <div className="text-xs text-green-600 flex items-center gap-1">
                                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                        En línea
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {messages.map((msg, index) => {
                                const isMe = msg.direction === 'OUTGOING';
                                return (
                                    <div
                                        key={msg.id || index}
                                        className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-[70%] rounded-lg px-4 py-2 shadow-sm text-sm relative group ${
                                                isMe 
                                                    ? 'bg-[#d9fdd3] text-slate-800 rounded-tr-none' 
                                                    : 'bg-white text-slate-800 rounded-tl-none'
                                            }`}
                                        >
                                            <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                                            <div className="flex items-center justify-end gap-1 mt-1 opacity-70">
                                                <span className="text-[10px]">
                                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                {isMe && (
                                                    <span>
                                                        {msg.status === 'SENT' ? <Check size={12} /> : 
                                                         msg.status === 'FAILED' ? <span className="text-red-500">!</span> : 
                                                         <Clock size={12} />}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-white border-t border-slate-200">
                            <form onSubmit={handleSendMessage} className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Escribe un mensaje..."
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-slate-50"
                                />
                                <button
                                    type="submit"
                                    disabled={sending || !newMessage.trim()}
                                    className="p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                            <MessageSquare size={32} className="text-slate-300" />
                        </div>
                        <p className="font-medium">Selecciona un chat para comenzar</p>
                        <p className="text-sm mt-1">Envía y recibe mensajes directamente desde aquí.</p>
                    </div>
                )}
            </div>
        </div>
    );
}