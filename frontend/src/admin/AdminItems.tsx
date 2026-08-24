import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Search, Trash2 } from 'lucide-react';
import { api } from '../api';
import { formatTimestamp } from '../time';
import { formatItemPrice, formatItemPrices } from '../currency';
import type { Item } from '../types';

const statuses = ['在售', '已售出', '已下架'];
const kinds = ['商品', '贴图'];
const eggOptions = ['猫'];
const pageSize = 20;

export default function AdminItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(() => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page) });
    if (keyword) params.set('q', keyword);
    if (status) params.set('status', status);
    api<{ items: Item[]; total: number }>(`/api/admin/items?${params}`)
      .then(d => { setItems(d.items); setTotal(d.total); })
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [page, keyword, status]);
  useEffect(load, [load]);

  const changeStatus = async (item: Item, next: string) => {
    try { await api(`/api/admin/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); load(); }
    catch (e) { setError(e instanceof Error ? e.message : '更新失败'); }
  };
  const changeKind = async (item: Item, next: string) => {
    try { await api(`/api/admin/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: item.status, kind: next }) }); load(); }
    catch (e) { setError(e instanceof Error ? e.message : '更新失败'); }
  };
  const changeEgg = async (item: Item, next: string) => {
    try { await api(`/api/admin/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: item.status, easterEgg: next || null }) }); load(); }
    catch (e) { setError(e instanceof Error ? e.message : '更新失败'); }
  };
  const remove = async (item: Item) => {
    if (!window.confirm(`确定删除商品「${item.title}」？删除后无法恢复。`)) return;
    try { await api(`/api/admin/items/${item.id}`, { method: 'DELETE' }); load(); }
    catch (e) { setError(e instanceof Error ? e.message : '删除失败'); }
  };

  return <div className="admin-page">
    <div className="admin-page-title"><span className="eyebrow">ITEMS</span><h1>商品管理</h1><p>共 {total} 件商品，可调整状态或删除违规内容。</p></div>
    <div className="admin-toolbar">
      <form className="admin-search" onSubmit={e => { e.preventDefault(); setPage(1); setKeyword(q); }}><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索标题或卖家昵称" /><button>搜索</button></form>
      <div className="admin-filters">
        <button className={!status ? 'active' : ''} onClick={() => { setStatus(''); setPage(1); }}>全部</button>
        {statuses.map(s => <button key={s} className={status === s ? 'active' : ''} onClick={() => { setStatus(s); setPage(1); }}>{s}</button>)}
        <button className="admin-refresh" onClick={() => load()} title="刷新"><RefreshCw /></button>
      </div>
    </div>
    {error && <div className="form-error">{error}</div>}
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>商品</th><th>学校 / 校区</th><th>卖家</th><th>价格</th><th>状态</th><th>性质</th><th>彩蛋</th><th>发布时间</th><th>操作</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={9} className="admin-table-empty">加载中…</td></tr> :
            !items.length ? <tr><td colSpan={9} className="admin-table-empty">没有找到符合条件的商品</td></tr> :
            items.map(item => <tr key={item.id}>
              <td><div className="admin-cell-item"><img src={item.images[0] || ''} alt="" /><span><b>{item.title}</b><small>{item.category} · {item.condition}</small></span></div></td>
              <td><b>{item.schoolName}</b><br/><small className="admin-muted">{item.campusName}</small></td>
              <td><div className="admin-cell-user"><span><b>{item.seller?.nickname || '未知'}</b><small>#{item.userId}</small></span></div></td>
              <td><strong className={`admin-price${item.kind === '贴图' ? ' pic-price' : ''}`}>{item.kind === '贴图' ? item.price : formatItemPrices(item)}</strong></td>
              <td><select className={`admin-status-select ${item.status === '在售' ? 'selling' : item.status === '已售出' ? 'sold' : 'off'}`} value={item.status} onChange={e => void changeStatus(item, e.target.value)}>{statuses.map(s => <option key={s}>{s}</option>)}</select></td>
              <td><select className={`admin-status-select ${item.kind === '贴图' ? 'off' : ''}`} value={item.kind || '商品'} onChange={e => void changeKind(item, e.target.value)}>{kinds.map(k => <option key={k}>{k}</option>)}</select></td>
              <td><select className={`admin-status-select ${item.easterEgg ? 'selling' : ''}`} value={item.easterEgg || ''} onChange={e => void changeEgg(item, e.target.value)}><option value="">无彩蛋</option>{eggOptions.map(k => <option key={k} value={k}>🐱 {k}</option>)}</select></td>
              <td className="admin-muted">{formatTimestamp(item.createdAt)}</td>
              <td><div className="admin-row-actions"><Link className="admin-icon-btn" to={`/items/${item.id}`} target="_blank" rel="noreferrer" title="查看商品"><ExternalLink /></Link><button className="admin-icon-btn danger" title="删除" onClick={() => void remove(item)}><Trash2 /></button></div></td>
            </tr>)}
        </tbody>
      </table>
    </div>
    {totalPages > 1 && <div className="admin-pagination"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft />上一页</button><span>{page} / {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页<ChevronRight /></button></div>}
  </div>;
}
