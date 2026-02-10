import { useState, useRef } from 'react';
import { api } from '../services/api';
import { Upload, ClipboardPaste, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, User, Key, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../services/AuthContext';

interface ParsedContact {
    name: string;
    phone: string;
    valid: boolean;
}

type Tab = 'csv' | 'paste';

function parseLines(raw: string): ParsedContact[] {
    const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length === 0) return [];

    // Auto-detect header
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('name') || firstLine.includes('phone') || firstLine.includes('nombre') || firstLine.includes('telefono');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    return dataLines.map(line => {
        // Split by tab or comma
        const parts = line.includes('\t') ? line.split('\t') : line.split(',');
        const name = (parts[0] || '').trim();
        const phone = (parts[1] || '').trim().replace(/[\s\-\(\)]/g, '');
        const valid = name.length > 0 && phone.length >= 7;
        return { name, phone, valid };
    });
}

export default function Settings() {
    const [tab, setTab] = useState<Tab>('csv');
    const [parsed, setParsed] = useState<ParsedContact[]>([]);
    const [pasteText, setPasteText] = useState('');
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ imported: number; duplicates: number } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const validCount = parsed.filter(c => c.valid).length;
    const invalidCount = parsed.filter(c => !c.valid).length;

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setResult(null);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            setParsed(parseLines(text));
        };
        reader.readAsText(file);
    };

    const handlePaste = () => {
        setResult(null);
        setParsed(parseLines(pasteText));
    };

    const handleImport = async () => {
        const contacts = parsed.filter(c => c.valid).map(c => ({ name: c.name, phone: c.phone }));
        if (contacts.length === 0) return;
        setImporting(true);
        try {
            const { data } = await api.post('/api/contacts/bulk', { contacts });
            setResult(data);
        } catch (error) {
            console.error('Bulk import failed', error);
        } finally {
            setImporting(false);
        }
    };

    const reset = () => {
        setParsed([]);
        setPasteText('');
        setResult(null);
        if (fileRef.current) fileRef.current.value = '';
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">Configuración</h2>

            <ChangeCredentialsSection />

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <FileSpreadsheet size={20} className="text-blue-600" />
                    Importar Contactos
                </h3>

                {/* Tabs */}
                <div className="flex gap-1 mb-6 bg-slate-100 rounded-lg p-1 w-fit">
                    <button
                        onClick={() => { setTab('csv'); reset(); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'csv' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                        <Upload size={16} /> Subir CSV
                    </button>
                    <button
                        onClick={() => { setTab('paste'); reset(); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'paste' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                        <ClipboardPaste size={16} /> Pegar Texto
                    </button>
                </div>

                {/* CSV Tab */}
                {tab === 'csv' && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Selecciona un archivo CSV (columnas: nombre, telefono)
                            </label>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".csv,.txt,.tsv"
                                onChange={handleFile}
                                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                            />
                        </div>
                        <p className="text-xs text-slate-400">
                            La fila de encabezado con "nombre" y "telefono" se detectará y omitirá automáticamente. Soporta delimitadores de coma o tabulación.
                        </p>
                    </div>
                )}

                {/* Paste Tab */}
                {tab === 'paste' && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Pega los contactos (uno por línea: nombre, telefono)
                            </label>
                            <textarea
                                value={pasteText}
                                onChange={(e) => setPasteText(e.target.value)}
                                rows={8}
                                placeholder={"Juan Perez,3001234567\nMaria Lopez,3109876543"}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                            />
                        </div>
                        <button
                            onClick={handlePaste}
                            className="py-2 px-4 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium text-sm"
                        >
                            Analizar Contactos
                        </button>
                        <p className="text-xs text-slate-400">
                            Soporta separadores de coma o tabulación (copiar y pegar desde Excel funciona). Encabezado detectado automáticamente.
                        </p>
                    </div>
                )}

                {/* Preview Table */}
                {parsed.length > 0 && (
                    <div className="mt-6 space-y-4">
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-medium text-slate-700">
                                Vista previa: {parsed.length} filas
                            </span>
                            <span className="flex items-center gap-1 text-sm text-green-600">
                                <CheckCircle size={14} /> {validCount} válidos
                            </span>
                            {invalidCount > 0 && (
                                <span className="flex items-center gap-1 text-sm text-red-500">
                                    <XCircle size={14} /> {invalidCount} inválidos
                                </span>
                            )}
                        </div>

                        <div className="border border-slate-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 sticky top-0">
                                    <tr>
                                        <th className="text-left px-4 py-2 font-medium text-slate-600">#</th>
                                        <th className="text-left px-4 py-2 font-medium text-slate-600">Nombre</th>
                                        <th className="text-left px-4 py-2 font-medium text-slate-600">Teléfono</th>
                                        <th className="text-left px-4 py-2 font-medium text-slate-600">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {parsed.map((c, i) => (
                                        <tr key={i} className={c.valid ? '' : 'bg-red-50'}>
                                            <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                                            <td className="px-4 py-2 text-slate-800">{c.name || <span className="text-red-400 italic">vacío</span>}</td>
                                            <td className="px-4 py-2 text-slate-800">{c.phone || <span className="text-red-400 italic">vacío</span>}</td>
                                            <td className="px-4 py-2">
                                                {c.valid
                                                    ? <CheckCircle size={16} className="text-green-500" />
                                                    : <AlertTriangle size={16} className="text-red-500" />
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Import Button */}
                        {!result && (
                            <button
                                onClick={handleImport}
                                disabled={validCount === 0 || importing}
                                className="py-2 px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {importing ? 'Importando...' : `Importar ${validCount} contactos`}
                            </button>
                        )}

                        {/* Result */}
                        {result && (
                            <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                                <CheckCircle size={20} className="text-green-600" />
                                <div className="text-sm text-green-800">
                                    <strong>{result.imported}</strong> contactos importados
                                    {result.duplicates > 0 && (
                                        <>, <strong>{result.duplicates}</strong> duplicados ignorados</>
                                    )}
                                </div>
                                <button
                                    onClick={reset}
                                    className="ml-auto text-sm text-green-700 underline hover:text-green-900"
                                >
                                    Importar más
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function ChangeCredentialsSection() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { logout } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (newPassword && newPassword !== confirmNewPassword) {
            toast.error('New password and confirmation do not match');
            setLoading(false);
            return;
        }

        if (!newUsername.trim() && !newPassword.trim()) {
            toast.error('Provide a new username or a new password');
            setLoading(false);
            return;
        }

        try {
            await api.put('/api/user/credentials', {
                currentPassword,
                newUsername: newUsername.trim() || undefined,
                newPassword: newPassword.trim() || undefined,
            });
            toast.success('Credentials updated successfully! Please log in again.');
            logout(); // Force re-login after credentials change
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to update credentials');
        } finally {
            setLoading(false);
            setCurrentPassword('');
            setNewUsername('');
            setNewPassword('');
            setConfirmNewPassword('');
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <User size={20} className="text-blue-600" />
                Cambiar Credenciales de Acceso
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de Usuario (opcional)</label>
                    <input
                        type="text"
                        placeholder="Nuevo nombre de usuario"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña Actual</label>
                    <input
                        type="password"
                        placeholder="Tu contraseña actual"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nueva Contraseña (opcional)</label>
                    <input
                        type="password"
                        placeholder="Deja vacío para no cambiar"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar Nueva Contraseña</label>
                    <input
                        type="password"
                        placeholder="Repite la nueva contraseña"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        disabled={!newPassword}
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading || !currentPassword.trim() || (!newUsername.trim() && !newPassword.trim())}
                    className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-semibold shadow-sm"
                >
                    <Save size={18} className="inline mr-2" />
                    {loading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </form>
        </div>
    );
}