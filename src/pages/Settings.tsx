import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, Plus, Trash2, Save, X, FileSpreadsheet, RefreshCw } from 'lucide-react';
import XLSX from 'xlsx-js-style';

interface BrandGroup {
    id: number;
    name: string;
    brands: string[]; // Joined string of brand names
    brandIds: number[];
}

const SettingsPage = () => {
    const [groups, setGroups] = useState<BrandGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<BrandGroup | null>(null);
    const [groupName, setGroupName] = useState('');
    const [selectedBrandIds, setSelectedBrandIds] = useState<number[]>([]);
    const [allBrands, setAllBrands] = useState<{ id: number, name: string }[]>([]);

    useEffect(() => {
        fetchGroups();
        fetchBrands();
    }, []);

    const fetchBrands = async () => {
        const { data } = await supabase.from('brands').select('id, name').order('name');
        if (data) setAllBrands(data);
    };

    const fetchGroups = async () => {
        setLoading(true);
        try {
            const { data: groupsData, error } = await supabase
                .from('brand_groups')
                .select(`
                    id, 
                    name, 
                    brand_group_members (
                        brand_id,
                        brands (name)
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const formattedGroups = groupsData.map((g: any) => ({
                id: g.id,
                name: g.name,
                brands: g.brand_group_members.map((m: any) => m.brands.name),
                brandIds: g.brand_group_members.map((m: any) => m.brand_id)
            }));

            setGroups(formattedGroups);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (group?: BrandGroup) => {
        if (group) {
            setEditingGroup(group);
            setGroupName(group.name);
            setSelectedBrandIds(group.brandIds);
        } else {
            setEditingGroup(null);
            setGroupName('');
            setSelectedBrandIds([]);
        }
        setIsModalOpen(true);
    };

    const handleSaveGroup = async () => {
        if (!groupName.trim()) return alert('그룹명을 입력하세요.');

        try {
            let groupId;

            if (editingGroup) {
                // Update
                const { error } = await supabase
                    .from('brand_groups')
                    .update({ name: groupName })
                    .eq('id', editingGroup.id);
                if (error) throw error;
                groupId = editingGroup.id;
            } else {
                // Create
                const { data, error } = await supabase
                    .from('brand_groups')
                    .insert({ name: groupName })
                    .select()
                    .single();
                if (error) throw error;
                groupId = data.id;
            }

            // Update Members
            // First delete existing
            await supabase.from('brand_group_members').delete().eq('group_id', groupId);

            // Insert new
            if (selectedBrandIds.length > 0) {
                const members = selectedBrandIds.map(bid => ({
                    group_id: groupId,
                    brand_id: bid
                }));
                const { error: memberError } = await supabase
                    .from('brand_group_members')
                    .insert(members);
                if (memberError) throw memberError;
            }

            setIsModalOpen(false);
            fetchGroups();
            alert('저장되었습니다.');

        } catch (err: any) {
            console.error(err);
            alert('저장 실패: ' + err.message);
        }
    };

    const handleDeleteGroup = async (id: number) => {
        if (!window.confirm('정말 삭제하시겠습니까?')) return;
        try {
            const { error } = await supabase.from('brand_groups').delete().eq('id', id);
            if (error) throw error;
            fetchGroups();
        } catch (err: any) {
            alert('삭제 실패: ' + err.message);
        }
    };

    const toggleBrandSelection = (id: number) => {
        setSelectedBrandIds(prev =>
            prev.includes(id) ? prev.filter(bid => bid !== id) : [...prev, id]
        );
    };

    const handleGroupUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

                // Format: Row 0 is header (skip). Col A: Group Name, Col B...: Brand Names
                // Need to map brand names to IDs.
                const brandMap = new Map(allBrands.map(b => [b.name, b.id]));

                let successCount = 0;

                for (let i = 1; i < data.length; i++) {
                    const row = data[i];
                    if (!row || row.length === 0) continue;

                    const gName = row[0];
                    if (!gName) continue;

                    const brandNames = row.slice(1).filter(n => n); // Get brand names from col B onwards
                    const brandIds = brandNames.map(n => brandMap.get(n)).filter(id => id !== undefined) as number[];

                    // Upsert Group
                    const { data: groupData, error: groupError } = await supabase
                        .from('brand_groups')
                        .upsert({ name: gName }, { onConflict: 'name' }) // Requires UNIQUE constraint on name
                        .select()
                        .single();

                    if (groupError) {
                        console.error(`Error creating group ${gName}:`, groupError);
                        continue;
                    }

                    const gId = groupData.id;

                    // Update Members (Delete all then insert)
                    await supabase.from('brand_group_members').delete().eq('group_id', gId);

                    if (brandIds.length > 0) {
                        const members = brandIds.map(bid => ({ group_id: gId, brand_id: bid }));
                        await supabase.from('brand_group_members').insert(members);
                    }
                    successCount++;
                }

                alert(`${successCount}개 그룹이 처리되었습니다.`);
                fetchGroups();

            } catch (err: any) {
                console.error(err);
                alert('업로드 처리 중 오류: ' + err.message);
            }
        };
        reader.readAsBinaryString(file);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Settings className="text-slate-600" />
                        설정 (Settings)
                    </h2>
                    <p className="text-slate-500 mt-1">브랜드 그룹 및 시스템 설정을 관리합니다.</p>
                </div>
                <button
                    onClick={fetchGroups}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                    title="새로고침"
                >
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Brand Groups Section */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-lg text-slate-800">브랜드 그룹 관리</h3>
                    <div className="flex gap-2">
                        <label htmlFor="group-upload" className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer">
                            <FileSpreadsheet size={18} />
                            <span>엑셀 일괄 등록</span>
                            <input
                                id="group-upload"
                                type="file"
                                accept=".xlsx, .xls"
                                className="hidden"
                                onChange={handleGroupUpload}
                            />
                        </label>
                        <button
                            onClick={() => handleOpenModal()}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                        >
                            <Plus size={18} />
                            <span>새 그룹 추가</span>
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-slate-500">로딩 중...</div>
                ) : groups.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">등록된 그룹이 없습니다.</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {groups.map(group => (
                            <div key={group.id} className="p-6 hover:bg-slate-50 transition-colors flex justify-between items-start">
                                <div>
                                    <h4 className="font-bold text-slate-800 text-lg mb-2">{group.name}</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {group.brands.map((b, i) => (
                                            <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
                                                {b}
                                            </span>
                                        ))}
                                        {group.brands.length === 0 && <span className="text-slate-400 text-sm">포함된 브랜드 없음</span>}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleOpenModal(group)}
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    >
                                        <Settings size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteGroup(group.id)}
                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-slate-800">
                                {editingGroup ? '그룹 수정' : '새 그룹 추가'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-slate-700 mb-2">그룹명</label>
                                <input
                                    type="text"
                                    value={groupName}
                                    onChange={(e) => setGroupName(e.target.value)}
                                    className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                    placeholder="예: 기초 화장품 모음"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">포함할 브랜드 선택</label>
                                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto border border-slate-200 rounded-lg p-2">
                                    {allBrands.map(brand => (
                                        <label
                                            key={brand.id}
                                            className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-slate-50 ${selectedBrandIds.includes(brand.id) ? 'bg-blue-50 text-blue-700' : 'text-slate-600'}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedBrandIds.includes(brand.id)}
                                                onChange={() => toggleBrandSelection(brand.id)}
                                                className="rounded border-slate-300 text-primary focus:ring-primary"
                                            />
                                            <span className="text-sm">{brand.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleSaveGroup}
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

export default SettingsPage;
