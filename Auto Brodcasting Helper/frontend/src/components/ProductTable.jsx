import React from 'react';
import { Package, Edit, Trash, Plus, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

export function ProductTable({ products, onEdit, onDelete, onAdd, onUpdateProduct, selectedProduct, onSelectProduct }) {

    const handleExport = () => {
        try {
            const exportData = products.map(p => ({
                barcode: p.barcode || '',
                code: p.code,
                brand: p.brand || '',
                name: p.name,
                expiry: p.expiry || '',
                stock: p.stock,
                sales: p.sales || 0,
                price: p.price,
                revenue: (p.sales || 0) * (p.price || 0),
                remaining: p.stock - (p.sales || 0),
                keywords: Array.isArray(p.keywords) ? p.keywords.join(', ') : p.keywords
            }));
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Products");
            XLSX.writeFile(wb, `product_sales_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (err) {
            console.error(err);
            alert("Export failed");
        }
    };

    return (
        <div className="flex-1 flex flex-col border-b border-gray-800 min-h-0 relative">

            {/* 헤더 */}
            <div className="h-12 border-b border-gray-800 flex items-center px-4 bg-gray-800/40 flex-none justify-between sticky top-0 z-10 backdrop-blur-sm">
                <div className="flex items-center">
                    <Package size={16} className="text-yellow-400 mr-2" />
                    <h2 className="font-bold text-sm text-gray-200">Product Sales Info</h2>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleExport} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors">
                        <Download size={10} /> Export
                    </button>
                    <button onClick={onAdd} className="text-xs bg-green-700 hover:bg-green-600 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors">
                        <Plus size={10} /> Add Product
                    </button>
                </div>
            </div>

            {/* 테이블 */}
            <div className="flex-1 p-4 overflow-auto min-h-0">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-700">
                            <th className="p-2 w-28">Barcode</th>
                            <th className="p-2 w-24">Code</th>
                            <th className="p-2 w-24">Brand</th>
                            <th className="p-2 w-1/3">Product Name</th>
                            <th className="p-2 text-right">Price</th>
                            <th className="p-2 text-right">Stock</th>
                            <th className="p-2 text-right">Sold</th>
                            <th className="p-2 text-right">Revenue</th>
                            <th className="p-2 text-right font-bold text-blue-300">Rem.</th>
                            <th className="p-2 text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody className="text-xs text-gray-300">
                        {products.length === 0 ? (
                            <tr>
                                <td colSpan="10" className="text-center py-8 text-gray-600">No Products Registered</td>
                            </tr>
                        ) : products.map((p) => {
                            const isSelected = selectedProduct?.id
                                ? selectedProduct.id === p.id
                                : selectedProduct?.code === p.code;
                            return (
                                <tr
                                    id={`product-row-${p.id || p.code}`}
                                    key={p.id || p.code}
                                    onClick={() => onSelectProduct(p)}
                                    className={`border-b border-gray-800 transition-colors cursor-pointer ${isSelected ? 'bg-yellow-900/30 border-yellow-700/50' : 'hover:bg-gray-800/50'}`}
                                >
                                    <td className="p-2 font-mono text-gray-500">
                                        <input type="text" value={p.barcode || ''} onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => onUpdateProduct(p.id || p.code, 'barcode', e.target.value)}
                                            className="w-full bg-transparent border-b border-transparent focus:border-purple-500 outline-none text-[10px]" placeholder="바코드" />
                                    </td>
                                    <td className={`p-2 font-mono ${isSelected ? 'text-yellow-200' : 'text-gray-400'}`}>
                                        <input type="text" value={p.code} onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => onUpdateProduct(p.id || p.code, 'code', e.target.value)}
                                            className="w-full bg-transparent border-b border-transparent focus:border-yellow-500 outline-none text-sm" />
                                    </td>
                                    <td className="p-2 text-gray-400">{p.brand}</td>
                                    <td className={`p-2 font-medium ${isSelected ? 'text-yellow-100 font-bold' : 'text-white'}`}>{p.name}</td>
                                    <td className="p-2 text-right text-gray-400">{p.price?.toLocaleString()}</td>
                                    <td className="p-2 text-right">
                                        <input type="number" value={p.stock} onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => onUpdateProduct(p.id || p.code, 'stock', Number(e.target.value))}
                                            className="w-16 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-right text-gray-300 focus:border-gray-400 outline-none" />
                                    </td>
                                    <td className="p-2 text-right">
                                        <input type="number" value={p.sales} onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => onUpdateProduct(p.id || p.code, 'sales', Number(e.target.value))}
                                            className="w-16 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-right text-red-300 focus:border-red-500 outline-none" />
                                    </td>
                                    <td className="p-2 text-right text-yellow-400 font-mono text-lg font-bold">
                                        {((p.sales || 0) * (p.price || 0)).toLocaleString()}
                                    </td>
                                    <td className={`p-2 text-right font-bold ${p.stock - p.sales <= 0 ? 'text-red-500' : 'text-blue-400'}`}>
                                        {p.stock - p.sales}
                                    </td>
                                    <td className="p-2 text-right">
                                        <button onClick={(e) => { e.stopPropagation(); onEdit(p); }} className="text-gray-500 hover:text-white mr-2"><Edit size={12} /></button>
                                        <button onClick={(e) => { e.stopPropagation(); onDelete(p.code); }} className="text-gray-500 hover:text-red-400"><Trash size={12} /></button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
