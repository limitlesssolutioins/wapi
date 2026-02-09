import { useState, useEffect } from 'react';
import axios from 'axios';
import { UserPlus, Trash2, Search, Phone, ChevronLeft, ChevronRight, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';

interface Contact {
    id: string;
    name: string;
    phone: string;
}

interface Meta {
    total: number;
    page: number;
    totalPages: number;
    limit: number;
}

export default function Contacts() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    
    // Pagination state
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, totalPages: 1, limit: 20 });
    const [loading, setLoading] = useState(false);

    const fetchContacts = async () => {
        setLoading(true);
        try {
            const { data } = await axios.get<{ data: Contact[], meta: Meta }>(
                `http://localhost:3001/api/contacts?page=${page}&limit=20&search=${searchTerm}`
            );
            
            // Handle response structure safety
            if (data && Array.isArray(data.data)) {
                setContacts(data.data);
                if (data.meta) setMeta(data.meta);
            } else {
                console.error('Invalid API response format:', data);
                setContacts([]);
            }
        } catch (error) {
            console.error('Failed to fetch contacts', error);
            toast.error('Error al cargar contactos');
        } finally {
            setLoading(false);
        }
    };

    // Debounce search or just effect on dependency change
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchContacts();
        }, 300); // Small debounce for search
        return () => clearTimeout(timer);
    }, [page, searchTerm]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingId) {
                await axios.put(`http://localhost:3001/api/contacts/${editingId}`, { name, phone });
                toast.success('Contacto actualizado');
            } else {
                await axios.post('http://localhost:3001/api/contacts', { name, phone });
                toast.success('Contacto guardado');
            }
            resetForm();
            fetchContacts();
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar contacto');
        }
    };

    const handleEdit = (contact: Contact) => {
        setEditingId(contact.id);
        setName(contact.name);
        setPhone(contact.phone);
    };

    const resetForm = () => {
        setEditingId(null);
        setName('');
        setPhone('');
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este contacto?')) return;
        try {
            await axios.delete(`http://localhost:3001/api/contacts/${id}`);
            toast.success('Contacto eliminado');
            fetchContacts();
        } catch (error) {
            console.error(error);
            toast.error('Error al eliminar contacto');
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">Contactos</h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Add/Edit Contact Form */}
                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 sticky top-6">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <UserPlus size={20} className="text-blue-600" />
                                {editingId ? 'Editar Contacto' : 'Añadir Contacto'}
                            </span>
                            {editingId && (
                                <button onClick={resetForm} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
                                    <X size={14} /> Cancelar
                                </button>
                            )}
                        </h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                                <input
                                    type="text"
                                    placeholder="Juan Pérez"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Número de Teléfono</label>
                                <div className="flex">
                                    <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 text-slate-500 text-sm">
                                        +57
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="3001234567"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-r-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        required
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                className={`w-full py-2 px-4 text-white rounded-lg transition-colors font-medium ${
                                    editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'
                                }`}
                            >
                                {editingId ? 'Actualizar Contacto' : 'Guardar Contacto'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Contact List */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input 
                            type="text" 
                            placeholder="Buscar contactos..." 
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setPage(1); 
                            }}
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px]">
                        {loading ? (
                            <div className="flex-1 flex items-center justify-center text-slate-400">
                                <Loader2 size={32} className="animate-spin text-blue-500" />
                            </div>
                        ) : contacts.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
                                <Search size={32} className="mb-2 opacity-50" />
                                <p>No se encontraron contactos.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 flex-1">
                                {contacts.map((contact) => (
                                    <div key={contact.id} className="p-4 hover:bg-slate-50 flex items-center justify-between group transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold">
                                                {contact.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-slate-800">{contact.name}</p>
                                                <p className="text-sm text-slate-500 flex items-center gap-1">
                                                    <Phone size={12} /> +57 {contact.phone}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => handleEdit(contact)}
                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                                title="Editar"
                                            >
                                                <Pencil size={18} />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(contact.id)}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                                                title="Eliminar"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {/* Pagination Footer */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                            <span className="text-xs text-slate-500">
                                Mostrando {contacts.length} de {meta.total}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1 || loading}
                                    className="p-1.5 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronLeft size={18} className="text-slate-600" />
                                </button>
                                <span className="text-sm font-medium text-slate-700 flex items-center px-2">
                                    Página {page} de {meta.totalPages || 1}
                                </span>
                                <button
                                    onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                                    disabled={page >= meta.totalPages || loading}
                                    className="p-1.5 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronRight size={18} className="text-slate-600" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}