import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { toast } from 'sonner';
import { Search, CheckCircle2, XCircle, Loader2, Copy, Square, AlertCircle } from 'lucide-react';

interface CheckResult {
    phone: string;
    exists: boolean | null; // null = pendiente / error
    jid?: string;
    error?: string;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export default function CheckNumber() {
    const [sessions, setSessions] = useState<string[]>([]);
    const [sessionId, setSessionId] = useState('');
    const [mode, setMode] = useState<'single' | 'batch'>('single');

    // Single
    const [phone, setPhone] = useState('');
    const [singleResult, setSingleResult] = useState<CheckResult | null>(null);
    const [singleLoading, setSingleLoading] = useState(false);

    // Batch
    const [batchInput, setBatchInput] = useState('');
    const [batchResults, setBatchResults] = useState<CheckResult[]>([]);
    const [batchRunning, setBatchRunning] = useState(false);
    const stopRef = useRef(false);

    useEffect(() => {
        api.get<string[]>('/api/whatsapp/sessions')
            .then(({ data }) => {
                setSessions(data);
                if (data.length > 0) setSessionId(data[0]);
            })
            .catch(() => {});
    }, []);

    // ── Single ──────────────────────────────────────────────────────────────────
    const checkSingle = async () => {
        const clean = phone.trim().replace(/\D/g, '');
        if (!sessionId || !clean) return;
        setSingleLoading(true);
        setSingleResult(null);
        try {
            const { data } = await api.get<{ exists: boolean; jid?: string }>(
                `/api/whatsapp/check?sessionId=${sessionId}&phone=${clean}`
            );
            setSingleResult({ phone: clean, exists: data.exists, jid: data.jid });
        } catch (err: any) {
            const msg: string = err.response?.data?.error || 'Error al verificar';
            toast.error(msg);
            setSingleResult({ phone: clean, exists: null, error: msg });
        } finally {
            setSingleLoading(false);
        }
    };

    // ── Batch ───────────────────────────────────────────────────────────────────
    const startBatch = async () => {
        const phones = batchInput
            .split('\n')
            .map(l => l.trim().replace(/\D/g, ''))
            .filter(l => l.length > 5);

        if (!sessionId || phones.length === 0) {
            toast.error('Seleccioná una sesión y agregá números válidos');
            return;
        }

        stopRef.current = false;
        setBatchRunning(true);
        setBatchResults(phones.map(p => ({ phone: p, exists: null })));

        for (let i = 0; i < phones.length; i++) {
            if (stopRef.current) break;
            const p = phones[i];
            try {
                const { data } = await api.get<{ exists: boolean; jid?: string }>(
                    `/api/whatsapp/check?sessionId=${sessionId}&phone=${p}`
                );
                setBatchResults(prev => {
                    const next = [...prev];
                    next[i] = { phone: p, exists: data.exists, jid: data.jid };
                    return next;
                });
            } catch (err: any) {
                setBatchResults(prev => {
                    const next = [...prev];
                    next[i] = { phone: p, exists: null, error: err.response?.data?.error || 'Error' };
                    return next;
                });
            }
            if (i < phones.length - 1) await sleep(700);
        }

        setBatchRunning(false);
    };

    const stopBatch = () => { stopRef.current = true; };

    const copyPhones = (filter: 'exists' | 'not_exists') => {
        const list = batchResults.filter(r => filter === 'exists' ? r.exists === true : r.exists === false);
        if (list.length === 0) { toast.error('No hay números en esa categoría'); return; }
        navigator.clipboard.writeText(list.map(r => r.phone).join('\n'));
        toast.success(`${list.length} números copiados al portapapeles`);
    };

    const checkedCount = batchResults.filter(r => r.exists !== null).length;
    const existsCount  = batchResults.filter(r => r.exists === true).length;
    const noExistsCount = batchResults.filter(r => r.exists === false).length;
    const errorCount  = batchResults.filter(r => r.exists === null && r.error).length;
    const total = batchResults.length;

    return (
        <div className="max-w-3xl space-y-6">

            {/* Session selector */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
                <label className="block text-sm font-medium text-slate-700 mb-2">Sesión WhatsApp</label>
                {sessions.length === 0 ? (
                    <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                        No hay sesiones conectadas. Conectá un dispositivo primero.
                    </p>
                ) : (
                    <select
                        value={sessionId}
                        onChange={e => setSessionId(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {sessions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                )}
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                {(['single', 'batch'] as const).map(m => (
                    <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                            mode === m
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {m === 'single' ? 'Verificar uno' : 'Verificar lista'}
                    </button>
                ))}
            </div>

            {/* ── Single mode ── */}
            {mode === 'single' && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <h2 className="text-sm font-semibold text-slate-700">Número a verificar</h2>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            placeholder="Ej: 5491112345678"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && checkSingle()}
                            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            onClick={checkSingle}
                            disabled={singleLoading || !sessionId || !phone.trim()}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {singleLoading
                                ? <Loader2 size={15} className="animate-spin" />
                                : <Search size={15} />}
                            Verificar
                        </button>
                    </div>

                    {singleResult && (
                        <div className={`flex items-center gap-3 p-4 rounded-lg border ${
                            singleResult.exists === true
                                ? 'bg-green-50 border-green-200'
                                : singleResult.exists === false
                                    ? 'bg-red-50 border-red-200'
                                    : 'bg-amber-50 border-amber-200'
                        }`}>
                            {singleResult.exists === true && <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />}
                            {singleResult.exists === false && <XCircle size={20} className="text-red-500 flex-shrink-0" />}
                            {singleResult.exists === null && <AlertCircle size={20} className="text-amber-500 flex-shrink-0" />}
                            <div>
                                <p className={`text-sm font-semibold ${
                                    singleResult.exists === true ? 'text-green-700' :
                                    singleResult.exists === false ? 'text-red-600' : 'text-amber-700'
                                }`}>
                                    {singleResult.exists === true
                                        ? `+${singleResult.phone} tiene WhatsApp`
                                        : singleResult.exists === false
                                            ? `+${singleResult.phone} NO tiene WhatsApp`
                                            : singleResult.error || 'Error desconocido'}
                                </p>
                                {singleResult.jid && (
                                    <p className="text-xs text-slate-500 mt-0.5">JID: {singleResult.jid}</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Batch mode ── */}
            {mode === 'batch' && (
                <div className="space-y-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">
                                Lista de números <span className="text-slate-400 font-normal">(uno por línea)</span>
                            </label>
                            <textarea
                                rows={8}
                                placeholder={"5491112345678\n5491187654321\n5491199998888"}
                                value={batchInput}
                                onChange={e => setBatchInput(e.target.value)}
                                disabled={batchRunning}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-slate-50"
                            />
                        </div>

                        <div className="flex gap-3">
                            {!batchRunning ? (
                                <button
                                    onClick={startBatch}
                                    disabled={!sessionId || !batchInput.trim()}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Search size={15} />
                                    Verificar lista
                                </button>
                            ) : (
                                <button
                                    onClick={stopBatch}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
                                >
                                    <Square size={14} />
                                    Detener
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Results */}
                    {batchResults.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                            {/* Stats bar */}
                            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-5 flex-wrap">
                                <span className="text-sm text-slate-500">
                                    {batchRunning
                                        ? `Verificando ${checkedCount} de ${total}…`
                                        : `${total} verificados`}
                                </span>
                                <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                                    <CheckCircle2 size={14} /> {existsCount} con WhatsApp
                                </span>
                                <span className="flex items-center gap-1.5 text-sm text-red-500 font-medium">
                                    <XCircle size={14} /> {noExistsCount} sin WhatsApp
                                </span>
                                {errorCount > 0 && (
                                    <span className="flex items-center gap-1.5 text-sm text-amber-500 font-medium">
                                        <AlertCircle size={14} /> {errorCount} error
                                    </span>
                                )}
                                <div className="ml-auto flex gap-2">
                                    <button
                                        onClick={() => copyPhones('exists')}
                                        disabled={existsCount === 0}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Copy size={12} /> Copiar con WA
                                    </button>
                                    <button
                                        onClick={() => copyPhones('not_exists')}
                                        disabled={noExistsCount === 0}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Copy size={12} /> Copiar sin WA
                                    </button>
                                </div>
                            </div>

                            {/* Progress bar */}
                            {batchRunning && total > 0 && (
                                <div className="h-1 bg-slate-100">
                                    <div
                                        className="h-1 bg-blue-500 transition-all duration-300"
                                        style={{ width: `${(checkedCount / total) * 100}%` }}
                                    />
                                </div>
                            )}

                            {/* Table */}
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Número</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Estado</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">JID</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {batchResults.map((r, i) => (
                                        <tr key={i} className="border-b border-slate-50 last:border-0">
                                            <td className="px-5 py-3 text-sm font-mono text-slate-700">+{r.phone}</td>
                                            <td className="px-5 py-3">
                                                {r.exists === null && !r.error && (
                                                    <span className="flex items-center gap-1.5 text-sm text-slate-400">
                                                        <Loader2 size={13} className="animate-spin" /> Verificando…
                                                    </span>
                                                )}
                                                {r.exists === true && (
                                                    <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                                                        <CheckCircle2 size={14} /> Tiene WhatsApp
                                                    </span>
                                                )}
                                                {r.exists === false && (
                                                    <span className="flex items-center gap-1.5 text-sm font-medium text-red-500">
                                                        <XCircle size={14} /> No tiene WhatsApp
                                                    </span>
                                                )}
                                                {r.exists === null && r.error && (
                                                    <span className="flex items-center gap-1.5 text-sm text-amber-600" title={r.error}>
                                                        <AlertCircle size={14} /> Error
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-xs text-slate-400 font-mono">
                                                {r.jid || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
