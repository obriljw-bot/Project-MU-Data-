import React, { useState } from 'react';
import { Menu, X, Home, Upload, BarChart2, Settings, LogOut } from 'lucide-react';
import { clsx } from 'clsx';

interface LayoutProps {
    children: React.ReactNode;
    onNavigate: (page: string) => void;
    currentPage: string;
}

const Layout: React.FC<LayoutProps> = ({ children, onNavigate, currentPage }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

    const navItems = [
        { icon: Home, label: '대시보드', id: 'dashboard' },
        { icon: Upload, label: '데이터 업로드', id: 'upload' },
        { icon: BarChart2, label: '매출 분석', id: 'analysis' },
        { icon: Settings, label: '설정', id: 'settings' },
    ];

    return (
        <div className="flex h-screen bg-slate-50">
            {/* Sidebar */}
            <aside
                className={clsx(
                    "bg-white border-r border-slate-200 transition-all duration-300 ease-in-out flex flex-col",
                    isSidebarOpen ? "w-64" : "w-20"
                )}
            >
                <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100">
                    {isSidebarOpen && <span className="font-bold text-xl text-primary">SalesAdmin</span>}
                    <button onClick={toggleSidebar} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                        {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item, index) => (
                        <button
                            key={index}
                            onClick={() => onNavigate(item.id)}
                            className={clsx(
                                "flex items-center gap-3 p-3 rounded-lg w-full transition-colors",
                                currentPage === item.id
                                    ? "bg-primary-light text-primary font-medium"
                                    : "text-slate-600 hover:bg-slate-50"
                            )}
                        >
                            <item.icon size={20} />
                            {isSidebarOpen && <span>{item.label}</span>}
                        </button>
                    ))}
                </nav>

                <div className="p-4 border-t border-slate-100">
                    <button className="flex items-center gap-3 p-3 w-full rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors">
                        <LogOut size={20} />
                        {isSidebarOpen && <span className="font-medium">로그아웃</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8">
                    <h1 className="text-xl font-semibold text-slate-800">대시보드</h1>
                    <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                            A
                        </div>
                        <span className="text-sm font-medium text-slate-600">Admin User</span>
                    </div>
                </header>

                <div className="flex-1 overflow-auto p-8">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
