import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Trash2, Edit2, Plus, Search, Save, X, Database, ChevronLeft, ChevronRight, RefreshCw, Trash } from 'lucide-react';
import { clsx } from 'clsx';

type Tab = 'sales' | 'products' | 'brands' | 'stores';

const DataManagementPage = () => {
    const [activeTab, setActiveTab] = useState<Tab>('sales');
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const ITEMS_PER_PAGE = 20;

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any | null>(null);
    const [formData, setFormData] = useState<any>({});

    // Meta Data for Dropdowns
    const [brands, setBrands] = useState<any[]>([]);
    const [stores, setStores] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);

    useEffect(() => {
        fetchData();
        fetchMeta();
    }, [activeTab, page, searchTerm]);

    const fetchMeta = async () => {
        if (activeTab === 'sales' || activeTab === 'products') {
            const { data: b } = await supabase.from('brands').select('id, name');
            if (b) setBrands(b);
        }
        if (activeTab === 'sales') {
            const { data: s } = await supabase.from('stores').select('id, name');
            const { data: p } = await supabase.from('products').select('id, name, barcode');
            if (s) setStores(s);
            if (p) setProducts(p);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            let query = supabase.from(activeTab).select('*', { count: 'exact' });

            // Search Logic
            if (searchTerm) {
                if (activeTab === 'sales') {
                    query = query.or(`sale_date.eq.${searchTerm}`);
                } else if (activeTab === 'products') {
                    query = query.or(`name.ilike.%${searchTerm}%,barcode.ilike.%${searchTerm}%`);
                } else {
                    query = query.ilike('name', `%${searchTerm}%`);
                }
            }

            // Pagination
            const from = (page - 1) * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            // Order
            if (activeTab === 'sales') query = query.order('sale_date', { ascending: false });
            else query = query.order('id', { ascending: true });

            // Joins for display
            if (activeTab === 'sales') {
                query = supabase
                    .from('sales')
                    .select(`
                        *,
                        stores (name),
                        products (name, barcode, brands(name))
                    `, { count: 'exact' })
                    .range(from, to)
                    .order('sale_date', { ascending: false });
            } else if (activeTab === 'products') {
                query = supabase
                    .from('products')
                    .select(`
                        *,
                        brands (name)
                    `, { count: 'exact' })
                    .range(from, to)
                    .order('id', { ascending: true });
            } else {
                query = query.range(from, to);
            }

            if (searchTerm && activeTab !== 'sales') {
                if (activeTab === 'products') {
                    query = query.or(`name.ilike.%${searchTerm}%,barcode.ilike.%${searchTerm}%`);
                } else {
                    query = query.ilike('name', `%${searchTerm}%`);
                }
            }

            const { data: result, count, error } = await query;
            if (error) throw error;

            setData(result || []);
            if (count) setTotalPages(Math.ceil(count / ITEMS_PER_PAGE));

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (item?: any) => {
        setEditingItem(item);
        if (item) {
            setFormData({ ...item });
        } else {
            setFormData({});
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        try {
            const { error } = await supabase
                .from(activeTab)
                .upsert(formData)
                .select();

            if (error) throw error;

            setIsModalOpen(false);
            fetchData();
            alert('저장되었습니다.');
        } catch (err: any) {
            console.error(err);
            alert('저장 실패: ' + err.message);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('정말 삭제하시겠습니까?')) return;
        try {
            const { error } = await supabase.from(activeTab).delete().eq('id', id);
            if (error) throw error;
            fetchData();
        } catch (err: any) {
            alert('삭제 실패: ' + err.message);
        }
    };

    const handleDeleteAll = async () => {
        if (!window.confirm(`현재 조회된 모든 ${activeTab} 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

        const confirmText = prompt("삭제를 확인하려면 '삭제'를 입력하세요.");
        if (confirmText !== '삭제') return;

        setLoading(true);
        try {
            // Delete all records in the current table (activeTab)
            // Using a filter that matches all records (id > 0)
            const { error } = await supabase.from(activeTab).delete().gt('id', 0);

            if (error) throw error;

            alert('모든 데이터가 삭제되었습니다.');
            fetchData();
        } catch (err: any) {
            console.error(err);
            alert('전체 삭제 실패: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev: any) => ({ ...prev, [name]: value }));
    };

    const renderTable = () => {
        if (loading) return <div className="p-8 text-center text-slate-500">로딩 중...</div>;
        if (data.length === 0) return <div className="p-8 text-center text-slate-500">데이터가 없습니다.</div>;

        return (
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                        <tr>
                            <th className="p-4">ID</th>
                            {activeTab === 'sales' && (
                                <>
                                    <th className="p-4">날짜</th>
                                    <th className="p-4">매장</th>
                                    <th className="p-4">브랜드</th>
                                    <th className="p-4">상품명</th>
                                    <th className="p-4 text-right">수량</th>
                                    <th className="p-4 text-right">금액</th>
                                </>
                            )}
                            {activeTab === 'products' && (
                                <>
                                    <th className="p-4">바코드</th>
                                    <th className="p-4">상품명</th>
                                    <th className="p-4">브랜드</th>
                                    <th className="p-4">카테고리</th>
                                </>
                            )}
                            {activeTab === 'brands' && <th className="p-4">브랜드명</th>}
                            {activeTab === 'stores' && <th className="p-4">매장명</th>}
                            <th className="p-4 text-center">관리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {data.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50">
                                <td className="p-4 text-slate-400">#{item.id}</td>
                                {activeTab === 'sales' && (
                                    <>
                                        <td className="p-4">{item.sale_date}</td>
                                        <td className="p-4">{item.stores?.name}</td>
                                        <td className="p-4">{item.products?.brands?.name}</td>
                                        <td className="p-4">{item.products?.name}</td>
                                        <td className="p-4 text-right">{item.quantity}</td>
                                        <td className="p-4 text-right">₩{item.amount?.toLocaleString()}</td>
                                    </>
                                )}
                                {activeTab === 'products' && (
                                    <>
                                        <td className="p-4">{item.barcode}</td>
                                        <td className="p-4 font-medium">{item.name}</td>
                                        <td className="p-4">{item.brands?.name}</td>
                                        <td className="p-4 text-slate-500">{item.category}</td>
                                    </>
                                )}
                                {activeTab === 'brands' && <td className="p-4 font-medium">{item.name}</td>}
                                {activeTab === 'stores' && <td className="p-4 font-medium">{item.name}</td>}
                                <td className="p-4 flex justify-center gap-2">
                                    <button onClick={() => handleOpenModal(item)} className="p-1 text-slate-400 hover:text-blue-500">
                                        <Edit2 size={16} />
                                    </button>
                                    <button onClick={() => handleDelete(item.id)} className="p-1 text-slate-400 hover:text-red-500">
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderModalContent = () => {
        switch (activeTab) {
            case 'brands':
            case 'stores':
                return (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">이름</label>
                        <input
                            name="name"
                            value={formData.name || ''}
                            onChange={handleInputChange}
                            className="w-full border border-slate-300 rounded px-3 py-2"
                        />
                    </div>
                );
            case 'products':
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">바코드</label>
                            <input
                                name="barcode"
                                value={formData.barcode || ''}
                                onChange={handleInputChange}
                                className="w-full border border-slate-300 rounded px-3 py-2"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">상품명</label>
                            <input
                                name="name"
                                value={formData.name || ''}
                                onChange={handleInputChange}
                                className="w-full border border-slate-300 rounded px-3 py-2"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">브랜드</label>
                            <select
                                name="brand_id"
                                value={formData.brand_id || ''}
                                onChange={handleInputChange}
                                className="w-full border border-slate-300 rounded px-3 py-2"
                            >
                                <option value="">선택하세요</option>
                                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">카테고리</label>
                            <input
                                name="category"
                                value={formData.category || ''}
                                onChange={handleInputChange}
                                className="w-full border border-slate-300 rounded px-3 py-2"
                            />
                        </div>
                    </div>
                );
            case 'sales':
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">날짜</label>
                            <input
                                type="date"
                                name="sale_date"
                                value={formData.sale_date || ''}
                                onChange={handleInputChange}
                                className="w-full border border-slate-300 rounded px-3 py-2"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">매장</label>
                            <select
                                name="store_id"
                                value={formData.store_id || ''}
                                onChange={handleInputChange}
                                className="w-full border border-slate-300 rounded px-3 py-2"
                            >
                                <option value="">선택하세요</option>
                                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">상품</label>
                            <select
                                name="product_id"
                                value={formData.product_id || ''}
                                onChange={handleInputChange}
                                className="w-full border border-slate-300 rounded px-3 py-2"
                            >
                                <option value="">선택하세요</option>
                                {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.barcode})</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">수량</label>
                                <input
                                    type="number"
                                    name="quantity"
                                    value={formData.quantity || 0}
                                    onChange={handleInputChange}
                                    className="w-full border border-slate-300 rounded px-3 py-2"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">금액</label>
                                <input
                                    type="number"
                                    name="amount"
                                    value={formData.amount || 0}
                                    onChange={handleInputChange}
                                    className="w-full border border-slate-300 rounded px-3 py-2"
                                />
                            </div>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Database className="text-slate-600" />
                데이터 관리 (Data Management)
            </h2>

            {/* Tabs */}
            <div className="flex border-b border-slate-200">
                {(['sales', 'products', 'brands', 'stores'] as Tab[]).map(tab => (
                    <button
                        key={tab}
                        onClick={() => { setActiveTab(tab); setPage(1); setSearchTerm(''); }}
                        className={clsx(
                            "px-6 py-3 font-medium text-sm transition-colors relative",
                            activeTab === tab ? "text-primary" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        {activeTab === tab && (
                            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary"></div>
                        )}
                    </button>
                ))}
            </div>

            {/* Controls */}
            <div className="flex justify-between items-center">
                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="검색..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                    />
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={fetchData}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                        title="새로고침"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={handleDeleteAll}
                        className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                    >
                        <Trash size={18} />
                        <span>전체 삭제</span>
                    </button>
                    <button
                        onClick={() => handleOpenModal()}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                    >
                        <Plus size={18} />
                        <span>새 항목 추가</span>
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {renderTable()}

                {/* Pagination */}
                <div className="p-4 border-t border-slate-200 flex justify-between items-center bg-slate-50">
                    <div className="text-sm text-slate-500">
                        Page {page} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-2 border border-slate-300 rounded hover:bg-white disabled:opacity-50"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="p-2 border border-slate-300 rounded hover:bg-white disabled:opacity-50"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-slate-800">
                                {editingItem ? '항목 수정' : '새 항목 추가'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-6">
                            {renderModalContent()}
                        </div>
                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors flex items-center gap-2"
                            >
                                <Save size={18} />
                                <span>저장하기</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DataManagementPage;
