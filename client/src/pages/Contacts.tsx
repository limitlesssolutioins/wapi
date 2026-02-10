import { UserPlus, Trash2, Search, Phone, ChevronLeft, ChevronRight, Loader2, Pencil, X, Users, Plus, FolderOpen, MoreVertical, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';

interface Contact {
    id: string;
    name: string;
    phone: string;
    groupId?: string | null;
}

interface Group {
    id: string;
    name: string;
    contactCount: number;
}

interface Meta {
    total: number;
    page: number;
    totalPages: number;
    limit: number;
}

export default function Contacts() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string | 'unassigned'>('unassigned');
    const [newGroupName, setNewGroupName] = useState('');
    
    // Multi-selection state
    const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

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
            const { data } = await api.get<{ data: Contact[], meta: Meta }>(
                `/api/contacts?page=${page}&limit=20&search=${searchTerm}&groupId=${selectedGroupId}`
            );
            
            if (data && Array.isArray(data.data)) {
                setContacts(data.data);
                if (data.meta) setMeta(data.meta);
            } else {
                setContacts([]);
            }
        } catch (error) {
            console.error('Failed to fetch contacts', error);
            toast.error('Error al cargar contactos');
        } finally {
            setLoading(false);
        }
    };

    const fetchGroups = async () => {
        try {
            const { data } = await api.get<Group[]>('/api/groups');
            setGroups(data);
        } catch (error) {
            console.error('Failed to fetch groups', error);
        }
    };

    useEffect(() => {
        fetchGroups();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchContacts();
        }, 300); 
        return () => clearTimeout(timer);
    }, [page, searchTerm, selectedGroupId]);

    const handleCreateGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newGroupName.trim()) return;
        try {
            await api.post('/api/groups', { name: newGroupName.trim() });
            toast.success('Grupo creado');
            setNewGroupName('');
            fetchGroups();
        } catch (error) {
            toast.error('Error al crear grupo');
        }
    };

    const handleDeleteGroup = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('¿Borrar este grupo? Los contactos no se eliminarán, solo quedarán sin grupo.')) return;
        try {
            await api.delete(`/api/groups/${id}`);
            if (selectedGroupId === id) setSelectedGroupId('unassigned');
            fetchGroups();
            fetchContacts();
        } catch (error) {
            toast.error('Error al eliminar grupo');
        }
    };

    const toggleContactSelection = (id: string) => {
        setSelectedContactIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const assignToGroup = async (groupId: string | null) => {
        if (selectedContactIds.size === 0) return;
        try {
            await api.post('/api/groups/assign', {
                contactIds: Array.from(selectedContactIds),
                groupId
            });
            toast.success('Contactos movidos');
            setSelectedContactIds(new Set());
            fetchContacts();
            fetchGroups();
        } catch (error) {
            toast.error('Error al asignar contactos');
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingId) {
                await api.put(`/api/contacts/${editingId}`, { name, phone });
                toast.success('Contacto actualizado');
            } else {
                await api.post('/api/contacts', { name, phone });
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
            await api.delete(`/api/contacts/${id}`);
            toast.success('Contacto eliminado');
            fetchContacts();
        } catch (error) {
            console.error(error);
            toast.error('Error al eliminar contacto');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800">Organización de Contactos</h2>
                {selectedContactIds.size > 0 && (
                    <div className="flex items-center gap-2 animate-in slide-in-from-top-2">
                        <span className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                            {selectedContactIds.size} seleccionados
                        </span>
                        <select 
                            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                            onChange={(e) => assignToGroup(e.target.value || null)}
                            value=""
                        >
                            <option value="" disabled>Mover a...</option>
                            <option value="unassigned">Sin Grupo</option>
                            {groups.map(g => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Sidebar: Groups List */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <FolderOpen size={18} className="text-amber-500" />
                            Grupos
                        </h3>
                        
                        <div className="space-y-1">
                            <button
                                onClick={() => { setSelectedGroupId('unassigned'); setPage(1); }}
                                className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
                                    selectedGroupId === 'unassigned' 
                                        ? 'bg-blue-50 text-blue-700 font-medium' 
                                        : 'text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                <span className="text-sm">Sin Grupo</span>
                                {selectedGroupId === 'unassigned' && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                            </button>

                            {groups.map(group => (
                                <button
                                    key={group.id}
                                    onClick={() => { setSelectedGroupId(group.id); setPage(1); }}
                                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center group transition-colors ${
                                        selectedGroupId === group.id 
                                            ? 'bg-blue-50 text-blue-700 font-medium' 
                                            : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    <span className="text-sm flex-1 truncate">{group.name}</span>
                                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full mr-2">
                                        {group.contactCount}
                                    </span>
                                    <Trash2 
                                        size={14} 
                                        onClick={(e) => handleDeleteGroup(group.id, e)}
                                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity" 
                                    />
                                </button>
                            ))}
                        </div>

                        <form onSubmit={handleCreateGroup} className="mt-4 pt-4 border-t border-slate-100 flex gap-1">
                            <input 
                                type="text"
                                placeholder="Nuevo grupo..."
                                value={newGroupName}
                                onChange={(e) => setNewGroupName(e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded outline-none focus:border-blue-500"
                            />
                            <button type="submit" className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                                <Plus size={18} />
                            </button>
                        </form>
                    </div>

                    {/* Add Contact Form (Inside Sidebar now for space) */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <UserPlus size={18} className="text-blue-600" />
                            {editingId ? 'Editar' : 'Nuevo Contacto'}
                        </h3>
                        <form onSubmit={handleSave} className="space-y-3">
                            <input
                                type="text"
                                placeholder="Nombre"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                required
                            />
                            <div className="flex">
                                <span className="inline-flex items-center px-2 rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 text-slate-500 text-xs">+57</span>
                                <input
                                    type="text"
                                    placeholder="300..."
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                                    className="w-full px-3 py-1.5 border border-slate-300 rounded-r-lg text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                    required
                                />
                            </div>
                            <button type="submit" className="w-full py-1.5 px-3 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                                {editingId ? 'Actualizar' : 'Guardar'}
                            </button>
                            {editingId && <button type="button" onClick={resetForm} className="w-full text-xs text-slate-500">Cancelar</button>}
                        </form>
                    </div>
                </div>

                {/* Main Content: Contact List */}
                <div className="lg:col-span-3 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="text" 
                                placeholder={`Buscar en ${selectedGroupId === 'unassigned' ? 'Sin Grupo' : 'este grupo'}...`}
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[500px]">
                        {loading ? (
                            <div className="flex-1 flex items-center justify-center py-20">
                                <Loader2 size={32} className="animate-spin text-blue-500" />
                            </div>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-4 py-3 w-10 text-slate-500 font-medium text-xs">
                                                    <button 
                                                        onClick={() => {
                                                            if (selectedContactIds.size === contacts.length) setSelectedContactIds(new Set());
                                                            else setSelectedContactIds(new Set(contacts.map(c => c.id)));
                                                        }}
                                                        className="text-slate-400 hover:text-blue-600"
                                                    >
                                                        {selectedContactIds.size === contacts.length && contacts.length > 0 ? <CheckSquare size={18}/> : <Square size={18}/>}
                                                    </button>
                                                </th>
                                                <th className="px-4 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider">Nombre</th>
                                                <th className="px-4 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider">Teléfono</th>
                                                <th className="px-4 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider text-right">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {contacts.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="px-4 py-20 text-center text-slate-400">
                                                        <Users size={48} className="mx-auto mb-2 opacity-20" />
                                                        <p>No hay contactos en esta sección.</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                contacts.map((contact) => (
                                                    <tr key={contact.id} className={`hover:bg-slate-50/80 transition-colors ${selectedContactIds.has(contact.id) ? 'bg-blue-50/30' : ''}`}>
                                                        <td className="px-4 py-3">
                                                            <button 
                                                                onClick={() => toggleContactSelection(contact.id)}
                                                                className={selectedContactIds.has(contact.id) ? 'text-blue-600' : 'text-slate-300'}
                                                            >
                                                                {selectedContactIds.has(contact.id) ? <CheckSquare size={18}/> : <Square size={18}/>}
                                                            </button>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 text-xs font-bold">
                                                                    {contact.name.charAt(0).toUpperCase()}
                                                                </div>
                                                                <span className="font-medium text-slate-800">{contact.name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-slate-600">+57 {contact.phone}</td>
                                                        <td className="px-4 py-3 text-right">
                                                            <div className="flex justify-end gap-1">
                                                                <button onClick={() => handleEdit(contact)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-white"><Pencil size={16} /></button>
                                                                <button onClick={() => handleDelete(contact.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-white"><Trash2 size={16} /></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination Footer */}
                                <div className="mt-auto p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                    <span className="text-xs text-slate-500 font-medium">
                                        Mostrando {contacts.length} de {meta.total} contactos
                                    </span>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page === 1 || loading}
                                            className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-slate-200 disabled:opacity-30 transition-all shadow-sm"
                                        >
                                            <ChevronLeft size={20} />
                                        </button>
                                        <span className="text-sm font-bold text-slate-700 min-w-[80px] text-center">
                                            {page} / {meta.totalPages || 1}
                                        </span>
                                        <button
                                            onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                                            disabled={page >= meta.totalPages || loading}
                                            className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-slate-200 disabled:opacity-30 transition-all shadow-sm"
                                        >
                                            <ChevronRight size={20} />
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
