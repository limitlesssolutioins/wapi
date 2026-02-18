import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Smartphone, Send, Settings, Menu, Users, Zap, MessageSquare, LogOut } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { Toaster } from 'sonner';
import { useAuth } from '../services/AuthContext';

export default function Layout() {
    const { pathname } = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const { logout } = useAuth();

    const navItems = [
        { icon: LayoutDashboard, label: 'Inicio', path: '/' },
        { icon: MessageSquare, label: 'BuzÃ³n', path: '/inbox' },
        { icon: Smartphone, label: 'Dispositivos', path: '/devices' },
        { icon: Send, label: 'Campanas', path: '/campaigns' },
        { icon: Send, label: 'SMS', path: '/sms' },
        { icon: Users, label: 'Contactos', path: '/contacts' },
        { icon: Settings, label: 'ConfiguraciÃ³n', path: '/settings' },
    ];

    return (
        <div className="flex h-screen bg-slate-100 overflow-hidden">
            {/* Sidebar */}
            <aside className={clsx(
                "bg-slate-900 text-white transition-all duration-300 flex flex-col flex-shrink-0",
                sidebarOpen ? "w-60" : "w-[68px]"
            )}>
                {/* Logo area */}
                <div className={clsx(
                    "h-16 flex items-center border-b border-slate-800 transition-all duration-300",
                    sidebarOpen ? "gap-3 px-4" : "justify-center"
                )}>
                    <div className={clsx(
                        "w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20 transition-all duration-300",
                        sidebarOpen ? "opacity-100" : "opacity-0 w-0 hidden"
                    )}>
                        <Zap size={16} className="text-white" />
                    </div>
                    <span className={clsx(
                        "font-bold text-base tracking-tight truncate transition-all duration-200",
                        sidebarOpen ? "opacity-100 w-auto" : "opacity-0 w-0 hidden"
                    )}>
                        Wapi
                    </span>
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className={clsx(
                            "p-1.5 hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0",
                            sidebarOpen ? "ml-auto" : ""
                        )}
                    >
                        <Menu size={18} />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-3 space-y-1">
                    {navItems.map((item) => {
                        const isActive = pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={clsx(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative",
                                    isActive
                                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
                                        : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
                                )}
                            >
                                <item.icon size={19} className={clsx(
                                    "flex-shrink-0 transition-colors",
                                    isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                                )} />
                                <span className={clsx(
                                    "text-sm font-medium truncate transition-opacity duration-200",
                                    sidebarOpen ? "opacity-100" : "opacity-0 w-0"
                                )}>
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                </nav>
                
                {/* Logout Button */}
                <div className="p-3">
                    <button
                        onClick={logout}
                        className={clsx(
                            "flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left transition-all duration-150 group text-red-400 hover:bg-red-500/10 hover:text-red-300",
                            !sidebarOpen && "justify-center"
                        )}
                    >
                        <LogOut size={19} className="flex-shrink-0" />
                        <span className={clsx(
                            "text-sm font-medium truncate transition-opacity duration-200",
                            sidebarOpen ? "opacity-100" : "opacity-0 w-0"
                        )}>
                            Cerrar SesiÃ³n
                        </span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto">
                <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 sticky top-0 z-10">
                    <h1 className="text-lg font-semibold text-slate-800">
                        {navItems.find(i => i.path === pathname)?.label || 'Panel Principal'}
                    </h1>
                </header>
                <div className="p-6 lg:p-8">
                    <Outlet />
                </div>
            </main>
            <Toaster position="top-right" richColors />
        </div>
    );
}


